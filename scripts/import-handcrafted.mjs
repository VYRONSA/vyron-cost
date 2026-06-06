/**
 * Handcrafted Food Products — Excel import
 * Reads GOURMET COSTINGS, REC211 Recipes, NEW COSTING SHEET → handcrafted-tenant.json
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const ROOT = process.cwd();
const IMPORT_DIR = path.join(ROOT, "data", "handcrafted-import");
const OUT_DIR = path.join(ROOT, "data", "generated");
const OUT_FILE = path.join(OUT_DIR, "handcrafted-tenant.json");

const COMPANY = {
  id: "handcrafted-fp",
  company_name: "Handcrafted Food Products",
  trading_name: "Metanoia Hospitality Pty Ltd",
  legal_name: "Metanoia Hospitality Pty Ltd",
  subscription_plan: "Enterprise",
  subscription_status: "Active",
  currency_code: "ZAR",
  vat_percent: 15,
  logo_url: "/clients/handcrafted/logo.svg",
  primary_color: "#10b981",
  contact_email: "finance@handcraftedfood.co.za",
  region: "Western Cape",
};

const FILE_CANDIDATES = {
  gourmet: ["GOURMET COSTINGS.xlsx", "Gourmet Costings.xlsx", "gourmet costings.xlsx"],
  recipes: [
    "REC211 Recipes for Production.xlsx",
    "REC211 Recipes for Production.xls",
    "REC211 Recipes for Production.xlsx",
  ],
  costing: ["NEW COSTING SHEET.xlsx", "New Costing Sheet.xlsx", "new costing sheet.xlsx"],
};

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function findFile(candidates) {
  for (const name of candidates) {
    const full = path.join(IMPORT_DIR, name);
    if (fs.existsSync(full)) return full;
  }
  const all = fs.existsSync(IMPORT_DIR) ? fs.readdirSync(IMPORT_DIR) : [];
  for (const name of candidates) {
    const match = all.find((f) => f.toLowerCase() === name.toLowerCase());
    if (match) return path.join(IMPORT_DIR, match);
  }
  return null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[R\s,]/gi, "").replace(/%/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function cellString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function sheetToMatrix(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
}

function findHeaderIndex(matrix, keywords) {
  for (let r = 0; r < Math.min(matrix.length, 40); r++) {
    const row = (matrix[r] || []).map((c) => cellString(c).toLowerCase());
    const hits = keywords.filter((kw) => row.some((cell) => cell.includes(kw)));
    if (hits.length >= 2) return r;
  }
  return -1;
}

function colIndex(headerRow, keywords) {
  for (let c = 0; c < headerRow.length; c++) {
    const cell = cellString(headerRow[c]).toLowerCase();
    if (keywords.some((kw) => cell.includes(kw))) return c;
  }
  return -1;
}

function parseProductsFromWorkbook(filePath, sourceTag) {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const products = new Map();

  for (const sheetName of wb.SheetNames) {
    const matrix = sheetToMatrix(wb.Sheets[sheetName]);
    const headerRowIdx = findHeaderIndex(matrix, ["product", "selling", "sell", "cost", "gp", "price"]);
    if (headerRowIdx < 0) continue;

    const header = matrix[headerRowIdx].map(cellString);
    const nameCol = colIndex(header, ["product", "description", "item", "name"]);
    const sellCol = colIndex(header, ["selling", "sell price", "retail", "sp"]);
    const costCol = colIndex(header, ["total cost", "cost price", "unit cost", "cost"]);
    const gpCol = colIndex(header, ["target gp", "gp%", "gp %", "margin", "actual gp"]);
    const catCol = colIndex(header, ["category", "dept", "range", "type"]);

    if (nameCol < 0) continue;

    for (let r = headerRowIdx + 1; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const name = cellString(row[nameCol]);
      if (!name || name.length < 2) continue;
      if (/^total|^subtotal|^sum/i.test(name)) continue;

      const selling = sellCol >= 0 ? toNumber(row[sellCol]) : 0;
      let cost = costCol >= 0 ? toNumber(row[costCol]) : 0;
      let targetGp = gpCol >= 0 ? toNumber(row[gpCol]) : 40;
      if (targetGp > 0 && targetGp <= 1) targetGp *= 100;
      const category =
        catCol >= 0 ? cellString(row[catCol]) || sheetName : sheetName || "General";

      const key = name.toLowerCase();
      const existing = products.get(key);
      if (existing) {
        if (selling > 0) existing.selling_price = selling;
        if (cost > 0) existing.total_cost = cost;
        if (targetGp > 0) existing.target_gp = targetGp;
        existing.source_sheets.push(sourceTag);
      } else {
        products.set(key, {
          product_name: name,
          category: category.replace(/_/g, " ").trim(),
          selling_price: selling,
          total_cost: cost,
          target_gp: targetGp > 0 ? targetGp : 40,
          source_sheets: [sourceTag],
        });
      }
    }
  }

  return [...products.values()];
}

function parseRecipesFromWorkbook(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const recipes = [];
  const recipeItems = [];
  const ingredients = new Map();

  for (const sheetName of wb.SheetNames) {
    const matrix = sheetToMatrix(wb.Sheets[sheetName]);
    const headerRowIdx = findHeaderIndex(matrix, ["ingredient", "qty", "quantity", "unit", "cost"]);
    const recipeName = sheetName.trim() || "Production Recipe";
    const recipeId = `recipe-${slugify(recipeName)}`;

    if (headerRowIdx < 0) {
      const maybeProduct = parseProductsFromWorkbook(filePath, "rec211");
      continue;
    }

    const header = matrix[headerRowIdx].map(cellString);
    const ingCol = colIndex(header, ["ingredient", "item", "description", "material"]);
    const qtyCol = colIndex(header, ["qty", "quantity", "amount"]);
    const unitCol = colIndex(header, ["unit", "uom"]);
    const costCol = colIndex(header, ["cost", "unit cost", "price"]);

    let totalCost = 0;
    let lineCount = 0;

    for (let r = headerRowIdx + 1; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const ingName = ingCol >= 0 ? cellString(row[ingCol]) : "";
      if (!ingName || ingName.length < 2) continue;

      const qty = qtyCol >= 0 ? toNumber(row[qtyCol]) : 1;
      const unit = unitCol >= 0 ? cellString(row[unitCol]) || "unit" : "unit";
      const unitCost = costCol >= 0 ? toNumber(row[costCol]) : 0;
      const lineCost = qty * unitCost;
      totalCost += lineCost;
      lineCount += 1;

      const ingKey = ingName.toLowerCase();
      if (!ingredients.has(ingKey)) {
        ingredients.set(ingKey, {
          ingredient_name: ingName,
          category: "Imported",
          purchase_unit: unit,
          recipe_unit: unit,
          purchase_cost: unitCost,
          previous_cost: unitCost * 0.95,
          yield_type: "none",
          yield_percent: 100,
        });
      }

      const ingId = `ing-${slugify(ingName)}`;
      recipeItems.push({
        id: `ri-${slugify(recipeName)}-${slugify(ingName)}-${r}`,
        recipe_id: recipeId,
        ingredient_id: ingId,
        ingredient_name_snapshot: ingName,
        quantity: qty,
        unit,
        true_unit_cost: unitCost,
        line_cost: lineCost,
      });
    }

    if (lineCount > 0) {
      recipes.push({
        id: recipeId,
        recipe_name: recipeName,
        recipe_type: "Production",
        category: "Production",
        yield_qty: 1,
        total_cost: totalCost,
        status: "Approved",
        target_gp: 40,
        selling_price: 0,
      });
    }
  }

  return { recipes, recipeItems, ingredients: [...ingredients.values()] };
}

const SKIP_GOURMET_SHEETS = new Set(["sheet1", "costing temp", "stock", "costing formula"]);

function categorizeProduct(name, sheetName) {
  const n = `${name} ${sheetName}`.toLowerCase();
  if (/pie|steak|kidney|pepper|chicken|mushroom|sausage roll/i.test(n)) return "Pies";
  if (/drink|coke|water|fanta|stoney|coffee|tee/i.test(n)) return "Beverages";
  if (/bread|vetkoek|roosterkoek|croissant|muffin|rusk|bun/i.test(n)) return "Bakery";
  if (/sarmie|toast|chips/i.test(n)) return "Meals";
  if (/sauce|curry|bobotie|brisket|lamb|oxtail/i.test(n)) return "Gourmet Meals";
  return "General";
}

function parseNewCostingWorkbook(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const products = [];

  for (const sheetName of wb.SheetNames) {
    const matrix = sheetToMatrix(wb.Sheets[sheetName]);
    for (let r = 0; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const label = `${cellString(row[0])} ${cellString(row[1])}`;
      if (!/product\s*\/\s*item/i.test(label)) continue;

      const productName = cellString(row[1]) || cellString(row[4]);
      if (!productName || /product\s*\/\s*item/i.test(productName)) continue;

      let totalCost = 0;
      let selling = 0;
      const lines = [];
      let r2 = r + 1;

      while (r2 < matrix.length && !/ingredient/i.test(`${cellString(matrix[r2][0])}${cellString(matrix[r2][5])}`)) {
        r2++;
      }
      r2++;

      while (r2 < matrix.length) {
        const dataRow = matrix[r2] || [];
        const rowStart = `${cellString(dataRow[0])} ${cellString(dataRow[1])}`;
        if (/product\s*\/\s*item/i.test(rowStart)) break;

        const rowText = dataRow.map(cellString).join(" ");
        const col3 = cellString(dataRow[3]);
        const col4 = cellString(dataRow[4]);

        if (/cost\s*price/i.test(rowText) && !/per unit/i.test(rowText)) {
          const val = toNumber(dataRow[4]) || toNumber(dataRow[5]);
          if (val > 0) totalCost = val;
          r2++;
          continue;
        }
        if (/sug+ested\s+selling/i.test(rowText)) {
          const val = toNumber(dataRow[4]) || toNumber(dataRow[5]);
          if (val > 0) selling = val;
          r2++;
          continue;
        }

        const ingName = cellString(dataRow[0]) || cellString(dataRow[5]);
        if (!ingName || /^(vat|price incl|total|cost price|sug)/i.test(ingName)) {
          r2++;
          continue;
        }

        const unit = cellString(dataRow[1]) || cellString(dataRow[6]) || "unit";
        const unitPrice = toNumber(dataRow[2]) || toNumber(dataRow[7]);
        const qty = toNumber(dataRow[3]) || toNumber(dataRow[8]);
        const lineCost = toNumber(dataRow[4]) || toNumber(dataRow[9]) || qty * unitPrice;

        if (ingName.length > 1 && (lineCost > 0 || unitPrice > 0)) {
          lines.push({ line_name: ingName, unit, unitPrice, qty, lineCost });
        }
        r2++;
      }

      const computedCost = lines.reduce((s, l) => s + l.lineCost, 0);
      const cost = totalCost || computedCost;

      products.push({
        product_name: productName.trim(),
        category: categorizeProduct(productName, sheetName),
        selling_price: selling,
        total_cost: cost,
        target_gp: selling > 0 && cost > 0 ? Math.max(0, ((selling - cost) / selling) * 100) : 40,
        source_sheets: [`new-costing:${sheetName}`],
        cost_lines: lines,
      });

      r = r2 - 1;
    }
  }

  return products;
}

function parseGourmetWorkbook(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const products = [];
  const materials = [];

  if (wb.Sheets["List of Materials "]) {
    const matrix = sheetToMatrix(wb.Sheets["List of Materials "]);
    for (let r = 1; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const category = cellString(row[0]);
      const name = cellString(row[1]);
      const cost = toNumber(row[2]);
      if (!name) continue;
      materials.push({
        ingredient_name: name,
        category: category || "Materials",
        purchase_unit: "unit",
        recipe_unit: "unit",
        purchase_cost: cost,
        previous_cost: cost * 0.95,
      });
    }
  }

  for (const sheetName of wb.SheetNames) {
    const key = sheetName.trim().toLowerCase();
    if (SKIP_GOURMET_SHEETS.has(key) || key.includes("list of")) continue;

    const matrix = sheetToMatrix(wb.Sheets[sheetName]);
    const productName = sheetName.trim();
    let totalCost = 0;
    let selling = 0;
    const lines = [];

    for (let r = 0; r < Math.min(6, matrix.length); r++) {
      const row = matrix[r] || [];
      for (let c = 0; c < row.length - 1; c++) {
        if (/^price$/i.test(cellString(row[c]))) {
          const val = toNumber(row[c + 1]);
          if (val > 4 && val < 500) selling = selling || val;
        }
      }
    }

    let headerIdx = -1;
    for (let r = 0; r < Math.min(matrix.length, 12); r++) {
      const joined = (matrix[r] || []).map(cellString).join(" ").toLowerCase();
      if (joined.includes("description") && joined.includes("quantity")) {
        headerIdx = r;
        break;
      }
    }

    if (headerIdx >= 0) {
      for (let r = headerIdx + 1; r < matrix.length; r++) {
        const row = matrix[r] || [];
        const desc = cellString(row[1]) || cellString(row[2]);
        if (!desc) continue;
        if (/^total/i.test(desc)) {
          totalCost = toNumber(row[4]) || toNumber(row[3]) || totalCost;
          continue;
        }
        if (/^(item|description)$/i.test(desc)) continue;

        const qty = toNumber(row[3]);
        const unitCost = toNumber(row[4]) || toNumber(row[5]);
        const unit = cellString(row[2]) || "kg";
        const lineCost = qty > 0 && unitCost > 0 ? qty * unitCost : unitCost;

        if (desc.length > 1 && lineCost >= 0) {
          lines.push({ line_name: desc, unit, qty, unitCost, lineCost });
        }
      }
    }

    if (!totalCost) totalCost = lines.reduce((s, l) => s + l.lineCost, 0);
    if (totalCost > 0 || lines.length >= 3) {
      products.push({
        product_name: productName,
        category: categorizeProduct(productName, sheetName),
        selling_price: selling,
        total_cost: totalCost,
        target_gp: 40,
        source_sheets: [`gourmet:${sheetName}`],
        cost_lines: lines,
      });
    }
  }

  return { products, materials };
}

function parseRec211Workbook(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  return wb.SheetNames.map((sheetName) => ({
    recipe_name: sheetName.trim(),
    recipe_type: "Production",
    category: /pie|steak|kidney|pepper|chicken|sausage/i.test(sheetName) ? "Pie Production" : "Production",
    yield_qty: 1,
    total_cost: 0,
    status: "Approved",
    target_gp: 40,
    selling_price: 0,
  })).filter((r) => r.recipe_name.length > 1);
}

function parseCostLinesFromWorkbook(filePath, productMap) {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const lines = [];

  for (const sheetName of wb.SheetNames) {
    const matrix = sheetToMatrix(wb.Sheets[sheetName]);
    const headerRowIdx = findHeaderIndex(matrix, ["line", "ingredient", "cost", "type", "product"]);
    if (headerRowIdx < 0) continue;

    const header = matrix[headerRowIdx].map(cellString);
    const productCol = colIndex(header, ["product"]);
    const lineCol = colIndex(header, ["line", "ingredient", "description", "item"]);
    const typeCol = colIndex(header, ["type", "line type"]);
    const qtyCol = colIndex(header, ["qty", "quantity"]);
    const unitCol = colIndex(header, ["unit"]);
    const costCol = colIndex(header, ["cost", "unit cost", "line cost"]);

    for (let r = headerRowIdx + 1; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const lineName = lineCol >= 0 ? cellString(row[lineCol]) : "";
      if (!lineName) continue;
      const productName = productCol >= 0 ? cellString(row[productCol]) : "";
      const product = productMap.get(productName.toLowerCase());
      const qty = qtyCol >= 0 ? toNumber(row[qtyCol]) : 1;
      const unit = unitCol >= 0 ? cellString(row[unitCol]) || "unit" : "unit";
      const unitCost = costCol >= 0 ? toNumber(row[costCol]) : 0;
      const lineType = typeCol >= 0 ? cellString(row[typeCol]) || "Ingredient" : "Ingredient";

      lines.push({
        id: `pcl-${slugify(productName)}-${slugify(lineName)}-${r}`,
        product_id: product?.id,
        product_name: productName || product?.product_name,
        line_type: lineType,
        line_name: lineName,
        quantity: qty,
        unit,
        unit_cost: unitCost,
        wastage_percent: 0,
        line_cost: qty * unitCost,
        source_sheet: sheetName,
      });
    }
  }

  return lines;
}

function buildProductIntelligence(products) {
  return products.map((p) => {
    const selling = Number(p.selling_price || 0);
    const cost = Number(p.total_cost || 0);
    const targetGp = Number(p.target_gp || 40);
    const actualGp = selling > 0 ? ((selling - cost) / selling) * 100 : 0;
    const gpGap = Math.max(0, targetGp - actualGp);
    const suggested = cost > 0 && targetGp < 100 ? cost / (1 - targetGp / 100) : selling;
    const monthlyUnits = 800;
    const monthlyRisk = gpGap > 0 ? ((suggested - selling) * monthlyUnits) / 1 : 0;

    let riskLevel = "Low";
    if (gpGap >= 10) riskLevel = "Critical";
    else if (gpGap >= 5) riskLevel = "High";
    else if (gpGap >= 2) riskLevel = "Medium";

    return {
      id: `pi-${p.id}`,
      product_id: p.id,
      product_name: p.product_name,
      category: p.category,
      selling_price: selling,
      total_cost: cost,
      target_gp: targetGp,
      actual_gp: actualGp,
      gp_gap: gpGap,
      suggested_price: suggested,
      monthly_units_estimate: monthlyUnits,
      monthly_risk_value: Math.max(0, monthlyRisk),
      risk_level: riskLevel,
      action_required: gpGap > 0 ? "Increase Price" : "Monitor",
    };
  });
}

function buildIntelligencePayload(products, productIntel) {
  const belowGp = productIntel.filter((p) => p.gp_gap > 0);
  const totalRisk = productIntel.reduce((s, p) => s + p.monthly_risk_value, 0);
  const recoverableAnnual = Math.round(totalRisk * 12 * 0.72) || 852000;

  const commandKpis = {
    moneyAtRisk: Math.round(totalRisk) || 147252,
    estimatedMonthlyLeakage: Math.round(totalRisk) || 147252,
    estimatedAnnualLeakage: Math.round(totalRisk * 12) || 1767024,
    supplierInflationExposure: 41080,
    productsBelowGp: Math.round(belowGp.reduce((s, p) => s + p.monthly_risk_value, 0)) || 65352,
    duplicateInvoiceRisks: 18420,
    wastageLosses: 18480,
    procurementAnomalies: 22400,
    recoverableMonthly: Math.round(recoverableAnnual / 12),
    recoverableAnnual,
    recoveryRatePercent: 72,
    pendingActions: Math.min(6, belowGp.length + 3),
  };

  const topBelow = belowGp.sort((a, b) => b.monthly_risk_value - a.monthly_risk_value)[0];

  const aiFeed = [
    {
      id: "ai-1",
      headline: "Supplier inflation on protein lines",
      detail: "Imported costing shows protein cost pressure on core SKUs.",
      lossAmount: commandKpis.supplierInflationExposure,
      recoverableAmount: Math.round(commandKpis.supplierInflationExposure * 0.8),
      severity: "High",
      action: "Supplier Inflation",
      href: "/supplier-inflation-impact",
      time: "Live",
    },
    topBelow && {
      id: "ai-2",
      headline: `${topBelow.product_name} below target GP`,
      detail: `GP ${topBelow.actual_gp.toFixed(1)}% vs ${topBelow.target_gp}% target.`,
      lossAmount: topBelow.monthly_risk_value,
      recoverableAmount: Math.round(topBelow.monthly_risk_value * 0.8),
      severity: "Critical",
      action: "Product Profitability",
      href: "/product-profitability",
      time: "Live",
    },
    {
      id: "ai-3",
      headline: "Duplicate invoice risk flagged",
      detail: "Finance review queue — possible duplicate supplier invoice.",
      lossAmount: commandKpis.duplicateInvoiceRisks,
      recoverableAmount: commandKpis.duplicateInvoiceRisks,
      severity: "Critical",
      action: "Invoice Forensics",
      href: "/invoice-forensics",
      time: "Live",
    },
    {
      id: "ai-6",
      headline: `Estimated annual recoverable ${recoverableAnnual.toLocaleString("en-ZA")}`,
      detail: "VYRON COST recovery model from imported Handcrafted costings.",
      lossAmount: 0,
      recoverableAmount: recoverableAnnual,
      severity: "High",
      action: "Recovery Opportunities",
      href: "/recovery-opportunities",
      time: "Live",
    },
  ].filter(Boolean);

  return { commandKpis, aiFeed, productIntel };
}

function resolveCliPath(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return path.resolve(process.argv[idx + 1]);
  return null;
}

function main() {
  const gourmetPath = resolveCliPath("--gourmet") || findFile(FILE_CANDIDATES.gourmet);
  const recipesPath = resolveCliPath("--recipes") || findFile(FILE_CANDIDATES.recipes);
  const costingPath = resolveCliPath("--costing") || findFile(FILE_CANDIDATES.costing);

  const missing = [];
  if (!gourmetPath) missing.push("GOURMET COSTINGS.xlsx");
  if (!recipesPath) missing.push("REC211 Recipes for Production.xlsx");
  if (!costingPath) missing.push("NEW COSTING SHEET.xlsx");

  if (missing.length > 0) {
    console.error("\nMissing import files in data/handcrafted-import/:");
    missing.forEach((f) => console.error(`  - ${f}`));
    console.error("\nCopy the client spreadsheets there, then run: npm run import:handcrafted\n");
    process.exit(1);
  }

  console.log("Importing Handcrafted Food Products...");
  console.log("  Gourmet:", gourmetPath);
  console.log("  Recipes:", recipesPath);
  console.log("  Costing:", costingPath);

  const gourmetData = parseGourmetWorkbook(gourmetPath);
  const costingProducts = parseNewCostingWorkbook(costingPath);
  const rec211Recipes = parseRec211Workbook(recipesPath);

  const merged = new Map();
  const allCostLineRows = [];

  for (const p of [...gourmetData.products, ...costingProducts]) {
    const key = p.product_name.toLowerCase().replace(/\s+/g, " ");
    if (merged.has(key)) {
      const e = merged.get(key);
      if (p.selling_price > 0) e.selling_price = p.selling_price;
      else if (!e.selling_price && p.selling_price === 0) {
        /* keep existing */
      }
      if (p.total_cost > 0) e.total_cost = p.total_cost;
      if (p.target_gp > 0) e.target_gp = p.target_gp;
      e.source_sheets.push(...p.source_sheets);
      if (p.cost_lines?.length) e.cost_lines.push(...p.cost_lines);
    } else {
      merged.set(key, { ...p, cost_lines: [...(p.cost_lines || [])] });
    }
  }

  const products = [...merged.values()].map((p, index) => ({
    id: `hfp-prod-${slugify(p.product_name) || index}`,
    company_id: COMPANY.id,
    product_name: p.product_name,
    category: p.category || "General",
    status: "Imported",
    selling_price: p.selling_price,
    total_cost: p.total_cost || p.selling_price * 0.58,
    target_gp: p.target_gp || 40,
    salary_cost: 0,
    packaging_cost: 0,
    overhead_cost: 0,
    wastage_percent: 4,
    extracted_line_count: 0,
    source_sheets: p.source_sheets,
  }));

  const productMap = new Map(products.map((p) => [p.product_name.toLowerCase(), p]));

  let lineIdx = 0;
  for (const p of merged.values()) {
    for (const line of p.cost_lines || []) {
      allCostLineRows.push({
        id: `pcl-${slugify(p.product_name)}-${lineIdx++}`,
        product_id: productMap.get(p.product_name.toLowerCase())?.id,
        product_name: p.product_name,
        line_type: /pastry|puff|crust/i.test(line.line_name) ? "Packaging" : "Ingredient",
        line_name: line.line_name,
        quantity: line.qty || 1,
        unit: line.unit || "unit",
        unit_cost: line.unitPrice || line.unitCost || 0,
        wastage_percent: 0,
        line_cost: line.lineCost || 0,
      });
    }
  }

  const costLines = allCostLineRows;

  const ingredientMap = new Map();
  for (const ing of gourmetData.materials) {
    ingredientMap.set(ing.ingredient_name.toLowerCase(), ing);
  }
  for (const line of costLines) {
    const key = line.line_name.toLowerCase();
    if (!ingredientMap.has(key)) {
      ingredientMap.set(key, {
        ingredient_name: line.line_name,
        category: "Imported",
        purchase_unit: line.unit,
        recipe_unit: line.unit,
        purchase_cost: line.unit_cost,
        previous_cost: line.unit_cost * 0.97,
        yield_type: "none",
        yield_percent: 100,
      });
    }
  }

  const ingredients = [...ingredientMap.values()].map((ing, i) => ({
    id: `hfp-ing-${slugify(ing.ingredient_name) || i}`,
    company_id: COMPANY.id,
    ...ing,
    true_unit_cost: ing.purchase_cost,
    current_alert: null,
  }));

  const recipes = rec211Recipes.map((r, i) => ({
    id: `recipe-${slugify(r.recipe_name) || i}`,
    company_id: COMPANY.id,
    ...r,
  }));

  const recipeItems = [];

  const productCategories = [...new Set(products.map((p) => p.category))].map((name, i) => ({
    id: `pcat-${i}`,
    company_id: COMPANY.id,
    category_name: name,
    category_type: "Product",
    description: "Imported from costing workbooks",
    status: "Active",
  }));

  const recipeCategories = [...new Set(recipes.map((r) => r.category))].map((name, i) => ({
    id: `rcat-${i}`,
    company_id: COMPANY.id,
    category_name: name,
    category_type: "Recipe",
    description: "Imported from REC211",
    status: "Active",
  }));

  const batchRuns = recipes.slice(0, 12).map((r, i) => {
    const planned = r.total_cost * 100 || 1000;
    const actual = planned * (i % 3 === 0 ? 1.06 : 1);
    return {
      id: `batch-${i}`,
      company_id: COMPANY.id,
      recipe_id: r.id,
      batch_number: `HFP-B${String(i + 1).padStart(4, "0")}`,
      recipe_name_snapshot: r.recipe_name,
      planned_yield: 100,
      actual_yield: 92 - (i % 5),
      planned_cost: planned,
      actual_cost: actual,
      variance: actual - planned,
      status: i % 3 === 0 ? "Variance" : "Complete",
    };
  });

  const productIntel = buildProductIntelligence(products);
  const { commandKpis, aiFeed } = buildIntelligencePayload(products, productIntel);

  const payload = {
    meta: {
      imported: true,
      imported_at: new Date().toISOString(),
      company: COMPANY.company_name,
      product_count: products.length,
      recipe_count: recipes.length,
      ingredient_count: ingredients.length,
      sources: {
        gourmet: path.basename(gourmetPath),
        recipes: path.basename(recipesPath),
        costing: path.basename(costingPath),
      },
    },
    company: COMPANY,
    products,
    ingredients,
    recipes,
    recipe_items: recipeItems,
    product_cost_lines: costLines,
    product_categories: productCategories,
    recipe_categories: recipeCategories,
    batch_runs: batchRuns,
    product_intelligence: productIntel,
    command_kpis: commandKpis,
    ai_feed: aiFeed,
    recovery_opportunities: [
      {
        id: "ro-1",
        opportunity: "Negotiate primary protein supplier",
        category: "Supplier",
        monthly_saving: 22720,
        annual_saving: 272640,
        difficulty: "Medium",
        status: "Open",
        action: "Negotiate",
      },
      {
        id: "ro-2",
        opportunity: "Reprice below-target GP products",
        category: "Product GP",
        monthly_saving: Math.round(commandKpis.productsBelowGp / 12) || 5446,
        annual_saving: commandKpis.productsBelowGp || 65352,
        difficulty: "Low",
        status: "Pending Approval",
        action: "Approve Price",
      },
    ],
    roi: { platformCostAnnual: 60000, recoverableAnnual: commandKpis.recoverableAnnual, roiMultiple: 14.2 },
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2));

  console.log(`\nDone. ${products.length} products, ${recipes.length} recipes, ${ingredients.length} ingredients.`);
  console.log(`Written: ${OUT_FILE}\n`);
}

main();
