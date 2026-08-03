#!/usr/bin/env node
/**
 * VYRON — review workspace information density measurement.
 *
 * Answers one question with pixels, not opinion: after the workspace change,
 * does the operator see MORE or LESS of each zone than before?
 *
 * Renders the BASELINE layout (commit 4be3520) and the CURRENT layout side by
 * side against the same compiled production stylesheet, and measures the
 * visible height of every zone the operator works in.
 *
 * Measurement only. Nothing here changes application behaviour.
 *
 *   npm run build && node scripts/measure-review-workspace-density.mjs
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import os from "node:os";

const candidates = execSync("node scripts/support/find-built-css.mjs", { encoding: "utf8" }).trim().split("\n");
const cssFile = candidates.filter(Boolean).find((f) => readFileSync(f, "utf8").includes("vyron-workspace-frame"));
if (!cssFile) {
  console.error("\nCompiled CSS not found. Run `npm run build` first.\n");
  process.exit(2);
}
const css = readFileSync(cssFile, "utf8");

const ROW_HEIGHT = 30;
const HEADER_FIELDS = 11;
const FIELD_HEIGHT = 56;

/**
 * Both layouts, differing only where the workspace change touched them.
 *
 *   BASELINE  root grows past the viewport (min-h), header block uncapped (p-4),
 *             main padded p-3/p-4, grid floor 280px
 *   CURRENT   root bounded (h-full), header capped and scrollable (max-h-30vh),
 *             main padded p-2/p-2.5, grid floor 140px
 */
function harness(variant) {
  const baseline = variant === "baseline";

  const shellMain = baseline
    ? 'class="vyron-cost-shell-main relative z-0 ml-[330px] min-w-0 h-screen overflow-x-hidden" data-id="shell-main"'
    : 'class="vyron-cost-shell-main vyron-workspace-frame relative z-0 ml-[330px] min-w-0 h-screen overflow-x-hidden" data-id="shell-main"';
  const mainArea = baseline
    ? 'class="min-w-0 w-full max-w-full flex-1 overflow-x-hidden px-0 py-0" data-id="shell-mainarea"'
    : 'class="min-w-0 w-full max-w-full flex-1 overflow-x-hidden px-0 py-0 min-h-0 overflow-y-hidden" data-id="shell-mainarea"';
  const wrapA = baseline ? 'class="mx-auto min-w-0 w-full max-w-full"' : 'class="mx-auto min-w-0 w-full max-w-full h-full"';
  const wrapB = baseline
    ? 'class="flex min-w-0 w-full max-w-full flex-col"'
    : 'class="flex min-w-0 w-full max-w-full flex-col h-full min-h-0"';
  const root = baseline
    ? 'class="flex flex-col overflow-hidden bg-slate-100 min-h-[calc(100dvh-5rem)]" data-id="review-root"'
    : 'class="flex flex-col overflow-hidden bg-slate-100 h-full min-h-0" data-id="review-root"';
  const reviewMain = baseline
    ? 'class="flex min-h-0 flex-1 overflow-hidden p-3 lg:flex-row lg:gap-3 lg:p-4" data-id="review-main"'
    : 'class="flex min-h-0 flex-1 overflow-hidden p-2 lg:flex-row lg:gap-2.5 lg:p-2.5" data-id="review-main"';
  const panelGap = baseline ? "gap-3" : "gap-2";
  const headerBlock = baseline
    ? 'class="shrink-0 rounded-2xl border border-slate-200 bg-white shadow-sm p-4" data-id="header-block"'
    : 'class="shrink-0 rounded-2xl border border-slate-200 bg-white shadow-sm p-3" data-id="header-block"';
  const gridFloor = baseline ? "min-h-[280px]" : "min-h-[140px]";

  /*
   * The eleven real header fields, laid out the way each variant lays them out.
   * Baseline: two columns. Current: two/three/four responsive. The field count
   * is what drives the block's height, so it must be real, not a round number.
   */
  const fieldCells = Array.from(
    { length: HEADER_FIELDS },
    (_, i) => `<label style="height:${FIELD_HEIGHT}px;display:block" class="rounded-xl border p-2">Field ${i + 1}</label>`
  ).join("");
  const fieldGrid = baseline ? "grid gap-3 sm:grid-cols-2" : "grid gap-2 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  const fields = `<div class="mb-2">Invoice Header</div><div class="${fieldGrid}">${fieldCells}</div>`;
  const rows = Array.from({ length: 40 }, (_, i) => `<tr data-row="${i}"><td style="height:${ROW_HEIGHT}px">Line ${i + 1}</td><td>1</td><td>100.00</td></tr>`).join("");
  const pages = Array.from({ length: 6 }, (_, i) => `<div style="height:900px;background:#eee;margin-bottom:12px">Page ${i + 1}</div>`).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<div class="vyron-cost-shell vyron-master-workspace">
  <aside class="vyron-cost-shell-sidebar" style="width:330px"></aside>
  <div ${shellMain}>
    <header class="shrink-0" style="height:56px;background:#fff">top bar</header>
    <main ${mainArea}>
      <div ${wrapA}><div ${wrapB}>
        <div ${root}>
          <header class="shrink-0" style="height:44px;background:#fff" data-id="review-header">review header</header>
          <main ${reviewMain}>
            <div class="flex min-h-0 flex-col overflow-hidden shrink-0" style="width:44%" data-id="preview-col">
              <div class="mb-1 shrink-0" style="height:20px">Original Invoice</div>
              <div class="min-h-0 flex-1 overflow-hidden" data-id="preview-frame">
                <div class="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-white">
                  <div class="shrink-0" style="height:36px">toolbar</div>
                  <div class="flex min-h-0 flex-1">
                    <div class="min-h-0 flex-1 overflow-auto bg-slate-200/80 p-3" data-id="preview-scroller">${pages}</div>
                  </div>
                </div>
              </div>
            </div>
            <div class="flex min-h-0 flex-col overflow-hidden" style="flex:1 1 0%;min-width:0" data-id="review-col">
              <div class="flex min-h-0 flex-1 flex-col ${panelGap} overflow-hidden" data-id="extraction-panel">
                <div ${headerBlock}>${fields}</div>
                <section class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-white" data-id="lines-section">
                  <div class="shrink-0" style="height:34px" data-id="lines-title">Line Items</div>
                  <div class="${gridFloor} flex-1 basis-0 overflow-auto overscroll-contain" data-id="lines-scroller">
                    <table class="w-full"><tbody>${rows}</tbody></table>
                  </div>
                  <div class="shrink-0" style="height:38px" data-id="totals-footer">totals</div>
                </section>
              </div>
            </div>
          </main>
        </div>
      </div></div>
    </main>
  </div>
</div></body></html>`;
}

const browser = await chromium.launch();
const tmp = mkdtempSync(path.join(os.tmpdir(), "vyron-density-"));
const table = [];

for (const [vpName, width, height] of [
  ["1920x1080", 1920, 1080],
  ["1600x900", 1600, 900],
  ["1366x768", 1366, 768],
]) {
  for (const variant of ["baseline", "current"]) {
    const file = path.join(tmp, `${variant}-${width}.html`);
    writeFileSync(file, harness(variant), "utf8");
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    await page.goto(`file://${file.replace(/\\/g, "/")}`);

    const m = await page.evaluate((rowHeight) => {
      const box = (id) => {
        const el = document.querySelector(`[data-id="${id}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), client: el.clientHeight, scroll: el.scrollHeight };
      };
      const vh = window.innerHeight;
      const clampVisible = (b) => (b ? Math.max(0, Math.min(vh, b.bottom) - Math.max(0, b.top)) : 0);

      const preview = box("preview-scroller");
      const header = box("header-block");
      const lines = box("lines-scroller");
      const totals = box("totals-footer");
      const area = document.querySelector('[data-id="shell-mainarea"]');

      return {
        previewVisible: clampVisible(preview),
        headerVisible: clampVisible(header),
        headerContent: header ? header.scroll : 0,
        headerClipped: header ? Math.max(0, header.scroll - header.client) : 0,
        linesVisible: clampVisible(lines),
        visibleRows: Math.floor(clampVisible(lines) / rowHeight),
        totalsVisible: totals ? (totals.top >= 0 && totals.bottom <= vh ? 1 : 0) : 0,
        pageScrolls: area ? area.scrollHeight - area.clientHeight > 1 : false,
        pageScrollAmount: area ? Math.max(0, area.scrollHeight - area.clientHeight) : 0,
      };
    }, ROW_HEIGHT);

    table.push({ vp: vpName, variant, ...m });
    await ctx.close();
  }
}

await browser.close();

console.log("\nREVIEW WORKSPACE INFORMATION DENSITY — measured pixels\n");
console.log(
  "viewport    variant   preview  header(vis/content)  lines   rows  totals  page-scroll"
);
console.log("-".repeat(96));
for (const r of table) {
  console.log(
    r.vp.padEnd(12) +
      r.variant.padEnd(10) +
      String(r.previewVisible + "px").padEnd(9) +
      `${r.headerVisible}/${r.headerContent}px`.padEnd(21) +
      String(r.linesVisible + "px").padEnd(8) +
      String(r.visibleRows).padEnd(6) +
      (r.totalsVisible ? "yes" : "NO").padEnd(8) +
      (r.pageScrolls ? `YES ${r.pageScrollAmount}px` : "no")
  );
}

console.log("\nDELTA current vs baseline (positive = operator sees MORE)\n");
console.log("viewport    preview      header-visible   lines        rows   header-hidden-content");
console.log("-".repeat(96));
for (const vp of ["1920x1080", "1600x900", "1366x768"]) {
  const b = table.find((r) => r.vp === vp && r.variant === "baseline");
  const c = table.find((r) => r.vp === vp && r.variant === "current");
  const sign = (n) => (n > 0 ? `+${n}` : String(n));
  console.log(
    vp.padEnd(12) +
      `${sign(c.previewVisible - b.previewVisible)}px`.padEnd(13) +
      `${sign(c.headerVisible - b.headerVisible)}px`.padEnd(17) +
      `${sign(c.linesVisible - b.linesVisible)}px`.padEnd(13) +
      `${sign(c.visibleRows - b.visibleRows)}`.padEnd(7) +
      `${c.headerClipped}px hidden (baseline ${b.headerClipped}px)`
  );
}
console.log();
