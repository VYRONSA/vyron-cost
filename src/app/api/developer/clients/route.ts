import { NextRequest, NextResponse } from "next/server";
import { createClientWorkspace, listClientWorkspaces, type CreateClientInput } from "@/lib/vyron-saas-workspace";

export const runtime = "nodejs";

function serializeServerError(error: unknown) {
  const extractOrigin = (stack: string | undefined | null) => {
    if (!stack) return null;
    const lines = stack.split("\n").map((line) => line.trim());
    for (const line of lines) {
      const match = line.match(/\(([^)]+):(\d+):(\d+)\)$/) || line.match(/at ([^\s]+):(\d+):(\d+)$/);
      if (match) {
        return {
          file: match[1],
          line: Number(match[2]),
          column: Number(match[3]),
        };
      }
    }
    return null;
  };

  if (error instanceof Error) {
    const e = error as Error & { step?: string; cause?: unknown };
    const origin = extractOrigin(e.stack);
    return {
      step: e.step || "unknown",
      name: e.name || "Error",
      message: e.message,
      cause:
        e.cause instanceof Error
          ? {
              name: e.cause.name,
              message: e.cause.message,
              stack: e.cause.stack || null,
            }
          : typeof e.cause === "string"
            ? e.cause
            : e.cause
              ? e.cause
              : null,
      stack: e.stack || null,
      origin,
    };
  }

  return {
    step: "unknown",
    name: typeof error,
    message: typeof error === "string" ? error : "Client creation failed.",
    cause: null,
    stack: null,
    origin: null,
  };
}

export async function GET() {
  try {
    const workspaces = await listClientWorkspaces();
    return NextResponse.json({ ok: true, workspaces });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Client list failed." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  console.log("[developer/clients][POST] start");
  try {
    const body = (await request.json()) as CreateClientInput;
    console.log("[developer/clients][POST] payload parsed", {
      companyName: body.companyName,
      tradingName: body.tradingName,
      adminEmail: body.admin?.email,
      loginMethod: body.loginSetup?.method,
    });

    const result = await createClientWorkspace(body);

    const email = result.ownerDetails.email;
    const loginNote = !result.authProvisioned
      ? `NO LOGIN CREATED for ${email}.`
      : result.ownerDetails.loginStatus === "invited"
        ? `Invitation email sent to ${email}.`
        : `LOGIN ACTIVE — ${email} can sign in with the temporary password.`;

    return NextResponse.json({
      ok: true,
      workspace: result.workspace,
      owner: result.owner,
      ownerDetails: result.ownerDetails,
      authProvisioned: result.authProvisioned,
      message: `Workspace created. ${loginNote}`,
    });
  } catch (error) {
    const details = serializeServerError(error);
    const rawError = error instanceof Error ? error.toString() : String(error);
    console.error("[developer/clients][POST] failed", details);
    return NextResponse.json(
      {
        ok: false,
        step: details.step,
        name: details.name,
        message: details.message,
        cause: details.cause,
        stack: details.stack,
        origin: details.origin,
        error: rawError,
      },
      { status: 400 }
    );
  } finally {
    console.log("[developer/clients][POST] end");
  }
}
