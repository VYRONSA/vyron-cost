/**
 * VYRON COST — enterprise design language visual capture.
 *
 * Captures full-page screenshots of every reachable workspace at desktop, tablet
 * and phone widths, and reports which routes were gated by authentication so the
 * validation record distinguishes "verified" from "not reachable".
 *
 *   node scripts/visual-capture.mjs [baseUrl]
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:3007";
const OUT = path.resolve("visual-validation");

const ROUTES = [
  ["landing", "/landing"],
  ["login", "/login"],
  ["dashboard", "/dashboard"],
  ["executive-dashboard", "/executive-boardroom"],
  ["procurement", "/procurement"],
  ["suppliers", "/suppliers"],
  ["inventory", "/inventory"],
  ["manufacturing", "/products"],
  ["sales", "/store-orders/dashboard"],
  ["customers", "/customers"],
  ["reports", "/reports"],
  ["administration", "/admin/company-setup"],
  ["ai-modules", "/ai-assistant"],
];

const VIEWPORTS = [
  ["desktop", 1920, 1080],
  ["tablet", 1024, 1366],
  ["phone", 390, 844],
];

const results = [];

const browser = await chromium.launch();

for (const [vpName, width, height] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  for (const [name, route] of ROUTES) {
    const dir = path.join(OUT, vpName);
    fs.mkdirSync(dir, { recursive: true });
    const before = consoleErrors.length;
    let status = "ok";
    let landed = route;

    try {
      const resp = await page.goto(`${BASE}${route}`, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      await page.waitForTimeout(1800);
      landed = new URL(page.url()).pathname;
      if (landed !== route) status = `redirected -> ${landed}`;
      if (resp && resp.status() >= 400) status = `http ${resp.status()}`;
      await page.screenshot({
        path: path.join(dir, `${name}.png`),
        fullPage: vpName === "desktop",
      });
    } catch (err) {
      status = `error: ${String(err).split("\n")[0].slice(0, 120)}`;
    }

    results.push({
      viewport: vpName,
      name,
      route,
      status,
      consoleErrors: consoleErrors.length - before,
    });
  }
  await ctx.close();
}

await browser.close();

fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(results, null, 2));

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${pad("VIEWPORT", 10)}${pad("PAGE", 22)}${pad("STATUS", 34)}ERR`);
console.log("-".repeat(74));
for (const r of results) {
  console.log(`${pad(r.viewport, 10)}${pad(r.name, 22)}${pad(r.status, 34)}${r.consoleErrors}`);
}

const gated = results.filter((r) => r.status.startsWith("redirected")).length;
const failed = results.filter((r) => r.status.startsWith("error") || r.status.startsWith("http")).length;
console.log(
  `\n${results.length} captures — ${results.length - gated - failed} rendered, ${gated} auth-gated, ${failed} failed.`
);
