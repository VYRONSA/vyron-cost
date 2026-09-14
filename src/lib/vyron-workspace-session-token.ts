import { createHmac, hkdfSync, timingSafeEqual } from "crypto";

/**
 * Server-issued, tamper-evident workspace identity.
 *
 * The workspace session cookie used to be plain JSON naming a userId and a
 * workspaceId, and the auth cookie was the raw auth user id. Neither was
 * signed, so anyone who knew a member's ids could write those cookies and be
 * treated as that member. Identity now travels only inside a token this server
 * signed: HMAC-SHA256 over the claims, with a key the browser never sees. A
 * token that was edited, truncated, re-signed with another key, issued for the
 * other cookie, or has expired verifies as nothing at all.
 *
 * The token proves who the caller is and which workspace they signed in to.
 * It does NOT carry role, permissions or company: those are still read from
 * vyron_workspace_memberships and vyron_workspaces on every request, so a
 * removed or disabled member loses access immediately.
 *
 * Standard primitives only (Node crypto): HKDF-SHA256 to derive the signing key,
 * HMAC-SHA256 to sign, timingSafeEqual to compare.
 */

const VERSION = "v1";
const MAX_TOKEN_LENGTH = 2048;
/** How long a signed-in session lasts. Matches the previous cookie lifetime. */
export const WORKSPACE_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const CLOCK_SKEW_SECONDS = 60;

const HKDF_SALT = "vyron-workspace-session";
const HKDF_INFO = "vyron workspace session signing key v1";

/** "ws": the workspace session. "au": the signed-in auth user, used to restore a session. */
export type WorkspaceTokenKind = "ws" | "au";

export type WorkspaceTokenClaims = {
  v: 1;
  k: WorkspaceTokenKind;
  /** The member's user id (vyron_workspace_memberships.user_id / auth user id). */
  sub: string;
  /** The workspace the session belongs to. Present on "ws" tokens only. */
  wid?: string;
  /** Issued by a platform operator's Login As / repair, not by the member. */
  imp?: boolean;
  iat: number;
  exp: number;
};

/**
 * The signing key. A dedicated VYRON_WORKSPACE_SESSION_SECRET is used when set;
 * otherwise the key is derived from the service role key, which every server
 * environment already holds and the browser never sees. Either way it goes
 * through HKDF with a purpose label, so the key signs sessions and nothing else.
 * Returns null when neither is configured: signing then refuses and every
 * token fails verification, so a misconfigured server authenticates nobody.
 */
function signingKey(): Buffer | null {
  const dedicated = process.env.VYRON_WORKSPACE_SESSION_SECRET?.trim();
  const source = dedicated && dedicated.length >= 32 ? dedicated : process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!source || source.length < 32) return null;
  return Buffer.from(hkdfSync("sha256", source, HKDF_SALT, HKDF_INFO, 32));
}

function base64url(buffer: Buffer) {
  return buffer.toString("base64url");
}

function sign(key: Buffer, signedPart: string) {
  return createHmac("sha256", key).update(signedPart).digest();
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

export function signWorkspaceToken(
  input: { kind: WorkspaceTokenKind; userId: string; workspaceId?: string | null; impersonating?: boolean },
  options: { issuedAt?: number; ttlSeconds?: number } = {}
): string {
  const key = signingKey();
  if (!key) throw new Error("Workspace sessions cannot be issued: no session signing key is configured.");
  const userId = String(input.userId || "").trim();
  if (!userId) throw new Error("A workspace session needs a user.");
  const workspaceId = String(input.workspaceId || "").trim();
  if (input.kind === "ws" && !workspaceId) throw new Error("A workspace session needs a workspace.");

  const iat = options.issuedAt ?? nowSeconds();
  const claims: WorkspaceTokenClaims = {
    v: 1,
    k: input.kind,
    sub: userId,
    ...(input.kind === "ws" ? { wid: workspaceId } : {}),
    ...(input.impersonating ? { imp: true } : {}),
    iat,
    exp: iat + (options.ttlSeconds ?? WORKSPACE_SESSION_TTL_SECONDS),
  };
  const payload = base64url(Buffer.from(JSON.stringify(claims), "utf8"));
  const signedPart = `${VERSION}.${payload}`;
  return `${signedPart}.${base64url(sign(key, signedPart))}`;
}

/**
 * The claims of a token this server signed for this purpose, or null.
 *
 * Null for: nothing, the wrong shape, the wrong version, a bad signature, a
 * token issued for the other cookie, missing fields, or one outside its
 * lifetime. The caller never learns which, and never sees unverified claims.
 */
export function verifyWorkspaceToken(raw: string | null | undefined, kind: WorkspaceTokenKind): WorkspaceTokenClaims | null {
  const token = String(raw || "").trim();
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const [, payload, signature] = parts;
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(signature)) return null;

  const key = signingKey();
  if (!key) return null;
  const expected = sign(key, `${VERSION}.${payload}`);
  const presented = Buffer.from(signature, "base64url");
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) return null;

  let claims: WorkspaceTokenClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as WorkspaceTokenClaims;
  } catch {
    return null;
  }
  if (!claims || typeof claims !== "object" || claims.v !== 1 || claims.k !== kind) return null;
  if (typeof claims.sub !== "string" || !claims.sub.trim()) return null;
  if (kind === "ws" && (typeof claims.wid !== "string" || !claims.wid.trim())) return null;
  if (!Number.isInteger(claims.iat) || !Number.isInteger(claims.exp)) return null;

  const now = nowSeconds();
  if (claims.exp <= now) return null;
  if (claims.iat > now + CLOCK_SKEW_SECONDS) return null;
  if (claims.exp - claims.iat > WORKSPACE_SESSION_TTL_SECONDS + CLOCK_SKEW_SECONDS) return null;
  return claims;
}
