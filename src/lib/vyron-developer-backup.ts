import { createHmac, timingSafeEqual } from "crypto";
import fs from "fs/promises";
import path from "path";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { tablesForModule } from "@/lib/vyron-reset-plan.generated";

/**
 * PCP-045A — mandatory backup before a developer reset. Server side only.
 *
 * A backup captures exactly the rows the matching reset would delete: both come
 * from the same generated scope predicates, so a backup can never cover a
 * different row set than the delete removes.
 */

export type BackupReport = {
  location: string;
  absolutePath: string;
  companyId: string;
  companySlug: string;
  module: string;
  createdAt: string;
  tables: number;
  rows: number;
  bytes: number;
  durationMs: number;
  perTable: Array<{ table: string; rows: number; bytes: number }>;
};

export type BackupStatus =
  | { exists: false; writable: boolean; reason?: string }
  | { exists: true; writable: boolean; report: BackupReport };

/** Root for backup trees. Override with VYRON_BACKUP_ROOT on hosts with a writable volume. */
export function backupRoot() {
  return String(process.env.VYRON_BACKUP_ROOT || "").trim() || path.join(process.cwd(), "backups");
}

export function companySlug(name: string) {
  return (
    String(name || "")
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-") || "company"
  );
}

/** Filesystem-safe ISO stamp: 2026-08-03T19-42-11Z */
function stamp(d = new Date()) {
  return d.toISOString().replace(/\.\d+Z$/, "Z").replace(/:/g, "-");
}

/**
 * Serverless filesystems are read-only outside the temp dir. Backups must never
 * be reported as created when they cannot persist.
 */
export async function isBackupLocationWritable(): Promise<{ writable: boolean; reason?: string }> {
  const root = backupRoot();
  try {
    await fs.mkdir(root, { recursive: true });
    const probe = path.join(root, `.write-probe-${Date.now()}`);
    await fs.writeFile(probe, "ok");
    await fs.unlink(probe);
    return { writable: true };
  } catch (error) {
    return {
      writable: false,
      reason:
        error instanceof Error
          ? `Backup directory is not writable (${error.message}). Set VYRON_BACKUP_ROOT to a writable volume.`
          : "Backup directory is not writable.",
    };
  }
}

function requireAdminClient() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase service role is not configured. Backups cannot run.");
  return supabase;
}

/**
 * Writes one JSON file per table plus a manifest. Tables are captured in reverse
 * delete order, so parents land before children and the tree can be replayed
 * forwards on restore.
 */
export async function createBackup(input: {
  companyId: string;
  companyName: string;
  moduleKey: string;
}): Promise<BackupReport> {
  const writable = await isBackupLocationWritable();
  if (!writable.writable) throw new Error(writable.reason || "Backup location is not writable.");

  const supabase = requireAdminClient();
  const tables = [...tablesForModule(input.moduleKey)].reverse();
  if (!tables.length) throw new Error(`No tables registered for module ${input.moduleKey}.`);

  const started = Date.now();
  const createdAt = new Date();
  const slug = companySlug(input.companyName);
  const dirName = stamp(createdAt);
  const relative = path.posix.join("backups", slug, dirName);
  const absolute = path.join(backupRoot(), slug, dirName);

  await fs.mkdir(absolute, { recursive: true });

  const perTable: BackupReport["perTable"] = [];
  let rows = 0;
  let bytes = 0;

  for (const table of tables) {
    const { data, error } = await supabase.rpc("vyron_dev_reset_export_table", {
      p_company_id: input.companyId,
      p_table: table,
    });
    if (error) throw new Error(`Backup failed while exporting ${table}: ${error.message}`);

    const payload = (data as unknown[] | null) || [];
    const json = JSON.stringify(payload, null, 1);
    await fs.writeFile(path.join(absolute, `${table}.json`), json, "utf8");

    perTable.push({ table, rows: payload.length, bytes: Buffer.byteLength(json) });
    rows += payload.length;
    bytes += Buffer.byteLength(json);
  }

  const report: BackupReport = {
    location: relative,
    absolutePath: absolute,
    companyId: input.companyId,
    companySlug: slug,
    module: input.moduleKey,
    createdAt: createdAt.toISOString(),
    tables: perTable.length,
    rows,
    bytes,
    durationMs: Date.now() - started,
    perTable,
  };

  const manifest = { ...report, restoreOrder: [...tables] };
  const manifestJson = JSON.stringify(manifest, null, 2);
  await fs.writeFile(path.join(absolute, "manifest.json"), manifestJson, "utf8");
  report.bytes += Buffer.byteLength(manifestJson);

  return report;
}

/** Most recent backup for a company, if any, verified as readable. */
export async function getLastBackup(companyName: string, companyId: string): Promise<BackupStatus> {
  const writable = await isBackupLocationWritable();
  const slug = companySlug(companyName);
  const dir = path.join(backupRoot(), slug);

  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return { exists: false, writable: writable.writable, reason: writable.reason };
  }

  const candidates = entries.filter((e) => /^\d{4}-\d{2}-\d{2}T/.test(e)).sort().reverse();

  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(path.join(dir, candidate, "manifest.json"), "utf8");
      const report = JSON.parse(raw) as BackupReport;
      // Never present another company's backup as this company's cover.
      if (report.companyId !== companyId) continue;
      return { exists: true, writable: writable.writable, report };
    } catch {
      continue;
    }
  }

  return { exists: false, writable: writable.writable, reason: writable.reason };
}

/**
 * Confirms a backup directory is present, parseable, and complete.
 *
 * `location` arrives from the browser, so it is matched against a strict shape
 * and the resolved path is re-checked to be inside the backup root. A crafted
 * value such as `backups/../../etc` must never resolve outside the tree.
 */
const LOCATION_RE = /^backups\/[A-Za-z0-9._-]+\/\d{4}-\d{2}-\d{2}T[\d-]+Z$/;

export async function verifyBackup(location: string, companyId: string) {
  if (!LOCATION_RE.test(String(location || ""))) {
    return { ok: false, reason: "Backup location is not a recognised backup path." };
  }

  const root = path.resolve(backupRoot());
  const absolute = path.resolve(root, location.replace(/^backups\//, ""));
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    return { ok: false, reason: "Backup location resolves outside the backup root." };
  }

  try {
    const raw = await fs.readFile(path.join(absolute, "manifest.json"), "utf8");
    const manifest = JSON.parse(raw) as BackupReport;
    if (manifest.companyId !== companyId) {
      return { ok: false, reason: "Backup belongs to a different company." };
    }
    for (const t of manifest.perTable) {
      const stat = await fs.stat(path.join(absolute, `${t.table}.json`));
      if (!stat.isFile()) return { ok: false, reason: `Missing backup file for ${t.table}.` };
    }
    return { ok: true, manifest };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? `Backup could not be verified: ${error.message}` : "Backup could not be verified.",
    };
  }
}

/* ------------------------------------------------------- preview freshness */

const PREVIEW_TTL_MS = 5 * 60 * 1000;

function previewSecret() {
  const secret = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  if (!secret) throw new Error("Cannot sign preview tokens without a service role key.");
  return secret;
}

/** Binds a preview to a company, module and moment so a stale preview cannot authorise a delete. */
export function issuePreviewToken(companyId: string, moduleKey: string, total: number) {
  const payload = `${companyId}.${moduleKey}.${total}.${Date.now()}`;
  const sig = createHmac("sha256", previewSecret()).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

export function verifyPreviewToken(
  token: string,
  companyId: string,
  moduleKey: string
): { ok: true; total: number; ageMs: number } | { ok: false; reason: string } {
  const [encoded, sig] = String(token || "").split(".");
  if (!encoded || !sig) return { ok: false, reason: "Preview has not been run." };

  let payload: string;
  try {
    payload = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return { ok: false, reason: "Preview token is malformed." };
  }

  const expected = createHmac("sha256", previewSecret()).update(payload).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "Preview token failed verification." };
  }

  const [tokenCompany, tokenModule, totalRaw, issuedRaw] = payload.split(".");
  if (tokenCompany !== companyId) return { ok: false, reason: "Preview was run against a different company." };
  if (tokenModule !== moduleKey) return { ok: false, reason: "Preview was run for a different module." };

  const ageMs = Date.now() - Number(issuedRaw);
  if (!Number.isFinite(ageMs) || ageMs < 0) return { ok: false, reason: "Preview token is malformed." };
  if (ageMs > PREVIEW_TTL_MS) return { ok: false, reason: "Preview expired. Please refresh." };

  return { ok: true, total: Number(totalRaw) || 0, ageMs };
}
