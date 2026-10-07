/**
 * Child-process probe for test-supplier-statement-pdf-runtime.mjs. Runs in a FRESH Node process
 * (DOMMatrix undefined, as on the server) under production-pdf-boundary-hook.mjs, and prints one JSON
 * line with what happened. Mode (argv[2]):
 *   control — import pdfjs-dist directly, as the released code did: must fail like production did.
 *   app     — the real extraction module and the real /api/supplier-reconciliations route.
 */
import { register } from "node:module";
import { randomBytes } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const importFromRoot = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
register(pathToFileURL(path.join(ROOT, "scripts/support/session-security-test-hook.mjs")).href, import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = `qa-${randomBytes(32).toString("hex")}`;
delete process.env.VYRON_WORKSPACE_SESSION_SECRET;
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "qa-anon";
const warn = console.warn;
console.warn = (...a) => (/standardFontDataUrl|fetchStandardFontData|Warning:/.test(String(a[0])) ? undefined : warn(...a));

const out = { domMatrixAtStart: typeof globalThis.DOMMatrix };
const mode = process.argv[2];
const pdfs = await import(pathToFileURL(path.join(ROOT, "scripts/support/synthetic-statement-pdfs.mjs")).href);

if (mode === "control") {
  try {
    await import("pdfjs-dist/legacy/build/pdf.mjs");
    out.controlError = null;
  } catch (error) {
    out.controlError = `${error?.constructor?.name}: ${error?.message}`;
  }
} else {
  const ex = await importFromRoot("src/lib/vyron-supplier-statement-pdf.ts");
  const run = async (name, bytes) => {
    try {
      const r = await ex.extractSupplierStatementPdf(bytes, { ownCompanyNames: [pdfs.OWN_COMPANY] });
      return { ok: true, transactions: r.transactions.length, supplier: r.supplier.value, agrees: r.balanceCheck.agrees };
    } catch (error) {
      return { ok: false, error: `${error?.constructor?.name}: ${error?.message}` };
    }
  };
  out.classic = await run("classic", pdfs.layoutClassic());
  out.erp = await run("erp", pdfs.layoutErp());
  out.scanned = await run("scanned", pdfs.layoutScanned());
  const { jsPDF } = await import("jspdf");
  const locked = new jsPDF({ unit: "pt", encryption: { userPassword: "secret", ownerPassword: "owner", userPermissions: ["print"] } });
  locked.text("Coastal Fresh Produce (Pty) Ltd", 40, 40);
  out.locked = await run("locked", new Uint8Array(locked.output("arraybuffer")));

  // The production entry point: the real route, real session, in-memory database.
  const { createFakeSupabase } = await import(pathToFileURL(path.join(ROOT, "scripts/support/document-email-test-stubs/fake-supabase.mjs")).href);
  const CO = "aaaaaaaa-0000-4000-8000-000000000001";
  const WS = "aaaaaaaa-0000-4000-8000-000000000002";
  const USER = "aaaaaaaa-0000-4000-8000-000000000010";
  const db = createFakeSupabase(
    {
      vyron_workspaces: [{ id: WS, company_id: CO, company_name: pdfs.OWN_COMPANY, package_name: "Enterprise", status: "Setup", default_vat_rate: 15 }],
      vyron_workspace_memberships: [{ id: "m1", workspace_id: WS, user_id: USER, role: "PROCUREMENT", status: "Active", permissions: {} }],
      vyron_cost_suppliers: [],
      vyron_supplier_reconciliations: [],
    },
    { honourOrder: true }
  );
  let writes = 0;
  const from = db.from.bind(db);
  db.from = (table) => {
    const q = from(table);
    for (const m of ["insert", "update", "upsert", "delete"]) {
      const orig = q[m].bind(q);
      q[m] = (...a) => {
        writes++;
        return orig(...a);
      };
    }
    return q;
  };
  globalThis.__VYRON_SESSION_TEST__ = { supabase: db, browserSupabase: db, users: [{ id: USER, email: "buyer@qa.test", password: "qa-pass-buyer" }], cookies: new Map(), headers: {} };
  const { NextRequest } = await import("next/server");
  const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
  const route = await importFromRoot("src/app/api/supplier-reconciliations/route.ts");
  const login = await loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email: "buyer@qa.test", password: "qa-pass-buyer" }), headers: { "content-type": "application/json" } }));
  globalThis.__VYRON_SESSION_TEST__.cookies = new Map(login.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
  writes = 0;
  const form = new FormData();
  form.append("file", new File([pdfs.layoutClassic()], "statement.pdf", { type: "application/pdf" }));
  form.append("action", "extract");
  const res = await route.POST(new NextRequest(new URL("/api/supplier-reconciliations", "http://qa.local"), { method: "POST", body: form }));
  const json = await res.json().catch(() => null);
  out.route = { status: res.status, mode: json?.mode ?? null, transactions: json?.extraction?.transactions?.length ?? null, error: json?.error ?? null, writes };
}
out.domMatrixAtEnd = typeof globalThis.DOMMatrix;
console.log("PROBE " + JSON.stringify(out));
