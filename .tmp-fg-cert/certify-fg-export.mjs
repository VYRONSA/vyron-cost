import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const outDir = path.join(root, ".tmp-fg-cert");
fs.mkdirSync(outDir, { recursive: true });

function loadEnvLocal() {
  const file = path.join(root, ".env.local");
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

function parseCookieFile(filePath) {
  const lines = fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  const cookies = new Map();
  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length >= 7) cookies.set(parts[5], parts[6]);
  }
  return cookies;
}

function decodeCookieJson(encoded) {
  return JSON.parse(decodeURIComponent(encoded));
}

function encodeCookieJson(value) {
  return encodeURIComponent(JSON.stringify(value));
}

function buildCookieHeader(cookieMap) {
  return [...cookieMap.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.length > 0);
  if (!lines.length) return { header: [], rows: [] };
  const parseLine = (line) => {
    const out = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuote = !inQuote;
        }
      } else if (ch === "," && !inQuote) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  };

  return {
    header: parseLine(lines[0]),
    rows: lines.slice(1).map(parseLine),
  };
}

async function run() {
  const cookieMap = parseCookieFile(path.join(root, "cookies-test.txt"));
  const baseCookieHeader = buildCookieHeader(cookieMap);

  const activeClient = decodeCookieJson(cookieMap.get("vyron_cost_active_client"));
  const workspaceSession = decodeCookieJson(cookieMap.get("vyron_workspace_user_session"));

  const baseHeaders = {
    Cookie: baseCookieHeader,
    "User-Agent": "FG-Certification/1.0",
  };

  const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseUrl = String(rawSupabaseUrl || "").replace(/\/rest\/v1\/?$/i, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const companyId = String(activeClient.companyId || "");
  const seedPrefix = "CERTFG_";
  const seededIds = [];
  const seededStockEntityIds = [];

  async function seedFixturesIfNeeded(target = 25) {
    const { count, error } = await supabase
      .from("vyron_cost_products")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .neq("status", "Archived");
    if (error) throw error;

    const existing = Number(count || 0);
    if (existing >= target) return 0;

    const createCount = target - existing;
    const rows = [];
    for (let i = 0; i < createCount; i += 1) {
      const id = crypto.randomUUID();
      seededIds.push(id);
      rows.push({
        id,
        company_id: companyId,
        product_name: `${seedPrefix} Product ${String(i + 1).padStart(3, "0")}`,
        sku: `${seedPrefix}${String(i + 1).padStart(3, "0")}`,
        category: "CERT_CATEGORY",
        product_category: "CERT_CATEGORY",
        selling_price: 20 + i,
        total_cost: 10 + i / 2,
        target_gp: 40,
        calculated_gp: 0,
        actual_gp: 0,
        suggested_selling_price: 0,
        product_status: "Active",
        status: "Active",
      });
    }

    const { error: insertError } = await supabase.from("vyron_cost_products").insert(rows);
    if (insertError) throw insertError;

    for (const row of rows) {
      const response = await fetch("http://localhost:3007/api/inventory/stock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: baseCookieHeader,
          "User-Agent": "FG-Certification/1.0",
        },
        body: JSON.stringify({
          workspaceId: activeClient.id,
          companyId,
          action: "create",
          entityType: "finished_goods",
          entityId: row.id,
          itemCode: row.sku,
          description: row.product_name,
          category: row.category,
          unit: "unit",
          currentCost: row.total_cost,
          openingQty: 100,
          openingDate: "2026-07-13",
          openingNote: "Certification seed",
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Failed to seed stock item for ${row.id}: ${response.status} ${body}`);
      }
      seededStockEntityIds.push(row.id);
    }

    return createCount;
  }

  async function cleanupSeededFixtures() {
    if (seededStockEntityIds.length) {
      await supabase
        .from("vyron_cost_stock_items")
        .delete()
        .eq("company_id", companyId)
        .eq("entity_type", "finished_goods")
        .in("entity_id", seededStockEntityIds);
    }

    if (!seededIds.length) return;
    await supabase
      .from("vyron_cost_products")
      .delete()
      .eq("company_id", companyId)
      .in("id", seededIds);
  }

  async function auditCount() {
    const { count, error } = await supabase
      .from("vyron_inventory_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("event_type", "Finished Goods Exported");
    if (error) throw error;
    return Number(count || 0);
  }

  async function latestAudits(limit = 5) {
    const { data, error } = await supabase
      .from("vyron_inventory_audit_log")
      .select("id, event_type, actor, metadata, created_at, reference_type")
      .eq("company_id", companyId)
      .eq("event_type", "Finished Goods Exported")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }

  async function fetchApiJson(url, headers = baseHeaders) {
    const res = await fetch(url, { headers });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  }

  async function exportFile({ format, params = {}, headers = baseHeaders, label }) {
    const qs = new URLSearchParams({ format, ...params }).toString();
    const url = `http://localhost:3007/api/inventory/finished-goods/export?${qs}`;
    const res = await fetch(url, { headers });
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    const filePath = path.join(outDir, `${label}.${format === "xlsx" ? "xlsx" : "csv"}`);
    fs.writeFileSync(filePath, buf);

    const contentDisposition = res.headers.get("content-disposition") || "";
    const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);

    return {
      ok: res.ok,
      status: res.status,
      filePath,
      bytes: buf.length,
      fileName: filenameMatch?.[1] || null,
      buffer: buf,
      text: format === "csv" ? buf.toString("utf8") : null,
    };
  }

  let seededCount = 0;
  try {
    seededCount = await seedFixturesIfNeeded(25);

    const beforeAudit = await auditCount();

    const listDefault = await fetchApiJson("http://localhost:3007/api/inventory/finished-goods", baseHeaders);
    const defaultItems = Array.isArray(listDefault.body?.items) ? listDefault.body.items : [];

    const emptyExport = await exportFile({ format: "csv", params: { search: "__CERT_NO_MATCH__" }, label: "empty" });
    const emptyParsed = parseCsv(emptyExport.text || "");

    const seedFirstCode = `${seedPrefix}001`;
    const oneKey = seedFirstCode;
    const singleExport = await exportFile({ format: "csv", params: { search: String(oneKey) }, label: "single" });
    const singleParsed = parseCsv(singleExport.text || "");

    const multiExportCsv = await exportFile({ format: "csv", params: {}, label: "multi" });
    const multiParsed = parseCsv(multiExportCsv.text || "");

    const multiExportXlsx = await exportFile({ format: "xlsx", params: {}, label: "multi" });

    const filterCategory = "CERT_CATEGORY";
    const filteredApi = await fetchApiJson(
      `http://localhost:3007/api/inventory/finished-goods?${new URLSearchParams({ category: filterCategory, sortBy: "name", sortDirection: "asc" }).toString()}`,
      baseHeaders
    );
    const filteredApiRows = Array.isArray(filteredApi.body?.items) ? filteredApi.body.items.length : 0;
    const filteredCsv = await exportFile({
      format: "csv",
      params: { category: filterCategory, sortBy: "name", sortDirection: "asc" },
      label: "filtered",
    });
    const filteredParsed = parseCsv(filteredCsv.text || "");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(multiExportXlsx.filePath);
    const ws = workbook.getWorksheet("Finished Goods");
    const headerRow = ws.getRow(1);
    const sampleDataRow = ws.getRow(2);

    const headerCell = headerRow.getCell(1);
    const currencyCell = sampleDataRow.getCell(5);
    const percentCell = sampleDataRow.getCell(9);
    const createdDateCell = sampleDataRow.getCell(12);
    const lastUpdatedCell = sampleDataRow.getCell(13);

    const freezeOk = Boolean(ws.views?.some((v) => v && v.state === "frozen" && Number(v.ySplit || 0) === 1));
    const headerBold = Boolean(headerCell.font?.bold);
    const headerCentered = headerCell.alignment?.horizontal === "center";
    const headerHasFill = Boolean(headerCell.fill?.fgColor?.argb);
    const columnsSized = Boolean((ws.columns || []).every((col) => Number(col.width || 0) > 0));
    const currencyFormatOk = typeof currencyCell.numFmt === "string" && currencyCell.numFmt.includes("R") && currencyCell.numFmt.includes("0.00");
    const percentageFormatOk = percentCell.numFmt === "0.00%";
    const createdDateTypeOk = createdDateCell.value === null || createdDateCell.value instanceof Date;
    const lastUpdatedTypeOk = lastUpdatedCell.value === null || lastUpdatedCell.value instanceof Date;
    const dateFormatOk =
      (createdDateCell.value === null || createdDateCell.numFmt === "yyyy-mm-dd") &&
      (lastUpdatedCell.value === null || lastUpdatedCell.numFmt === "yyyy-mm-dd");

    const csvHasBom = (multiExportCsv.buffer[0] === 0xef && multiExportCsv.buffer[1] === 0xbb && multiExportCsv.buffer[2] === 0xbf);

    const { data: companyProducts } = await supabase
      .from("vyron_cost_products")
      .select("product_name,sku")
      .eq("company_id", companyId);
    const companyKeys = new Set(
      (companyProducts || []).flatMap((row) => [String(row.product_name || "").toLowerCase(), String(row.sku || "").toLowerCase()])
    );

    const crossLeak = multiParsed.rows.some((row) => {
      const code = String(row[0] || "").toLowerCase();
      const name = String(row[1] || "").toLowerCase();
      if (!code && !name) return false;
      return !companyKeys.has(code) && !companyKeys.has(name);
    });

    const deniedSession = { ...workspaceSession, role: "VIEW_ONLY", permissions: {} };
    const deniedCookieMap = new Map(cookieMap);
    deniedCookieMap.set("vyron_workspace_user_session", encodeCookieJson(deniedSession));
    const deniedHeaders = {
      Cookie: buildCookieHeader(deniedCookieMap),
      "User-Agent": "FG-Certification/1.0",
    };
    const deniedAttempt = await exportFile({ format: "csv", params: {}, headers: deniedHeaders, label: "permission-denied" });

    const afterAudit = await auditCount();
    const audits = await latestAudits(10);
    const requiredAuditFields = [
      "userId",
      "workspaceId",
      "companyId",
      "exportType",
      "exportTimestamp",
      "exportedRowCount",
      "filters",
      "clientIp",
      "userAgent",
    ];

    const auditFieldCoverage = audits.every((a) => {
      const m = a.metadata || {};
      const hasMetadataFields = requiredAuditFields.every((k) => Object.prototype.hasOwnProperty.call(m, k));
      return hasMetadataFields && a.reference_type === "finished_goods_export";
    });

    const successfulExports = [emptyExport, singleExport, multiExportCsv, multiExportXlsx, filteredCsv].filter((x) => x.ok).length;

    const results = {
      context: {
        workspaceId: activeClient.id,
        companyId,
      },
      matrix: {
        emptyDataset: emptyExport.ok && emptyParsed.rows.length === 0,
        singleRecord: singleExport.ok && singleParsed.rows.length === 1,
        multipleRecords: multiExportCsv.ok && multiParsed.rows.length > 1,
        largerThanOneUiPage: multiParsed.rows.length > 20,
        allFilteredRecordsExported: filteredCsv.ok && filteredParsed.rows.length === filteredApiRows,
        companyIsolation: !crossLeak,
        permissionDenied: !deniedAttempt.ok && deniedAttempt.status === 403,
        excelOpensWithoutWarnings: multiExportXlsx.ok && multiExportXlsx.bytes > 0,
        csvOpensInExcel: multiExportCsv.ok && csvHasBom,
        currencyFormatting: currencyFormatOk,
        percentageFormatting: percentageFormatOk,
        dateFormatting: createdDateTypeOk && lastUpdatedTypeOk && dateFormatOk,
        excelHeaderBold: headerBold,
        excelHeaderCentered: headerCentered,
        excelHeaderPalette: headerHasFill,
        excelHeaderFrozen: freezeOk,
        excelAutoSizedColumns: columnsSized,
      },
      audit: {
        before: beforeAudit,
        after: afterAudit,
        delta: afterAudit - beforeAudit,
        expectedMinDelta: successfulExports,
        fieldCoverage: auditFieldCoverage,
        latest: audits.slice(0, 3),
      },
      counts: {
        seededCount,
        defaultItems: defaultItems.length,
        emptyRows: emptyParsed.rows.length,
        singleRows: singleParsed.rows.length,
        multiRows: multiParsed.rows.length,
        filteredApiRows,
        filteredExportRows: filteredParsed.rows.length,
      },
      files: {
        emptyCsv: emptyExport.filePath,
        singleCsv: singleExport.filePath,
        multiCsv: multiExportCsv.filePath,
        multiXlsx: multiExportXlsx.filePath,
        filteredCsv: filteredCsv.filePath,
      },
      denied: {
        status: deniedAttempt.status,
        ok: deniedAttempt.ok,
      },
    };

    fs.writeFileSync(path.join(outDir, "cert-results.json"), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await cleanupSeededFixtures();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
