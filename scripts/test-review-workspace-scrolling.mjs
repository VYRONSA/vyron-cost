#!/usr/bin/env node
/**
 * VYRON — review workspace scroll-containment test.
 *
 * Converting the invoice review screen to a full-height flex layout introduces
 * a specific family of regressions: the page scrolls when it should not, a pane
 * stops scrolling because an ancestor forgot `min-h-0`, or two nested elements
 * both scroll and the wheel does the wrong thing.
 *
 * This asserts the containment rules in a real browser, against the COMPILED
 * production stylesheet, using the same class chain the review page renders.
 * The cascade is the point: the shell's own rule
 * `.vyron-cost-shell > .vyron-cost-shell-main` is two classes deep and outranks
 * a single Tailwind utility, so `overflow-y-hidden` applied as a utility lost
 * silently and the page kept scrolling. Only a real cascade catches that —
 * reading the JSX cannot.
 *
 * What it checks:
 *   1. the page (body) does not scroll
 *   2. the shell main column does not scroll
 *   3. the invoice preview pane scrolls, on its own
 *   4. the line-item pane scrolls, on its own
 *   5. no unintended scroll container exists between them
 *   6. the same holds in Focus Invoice and Focus Review layouts
 *   7. the same holds on a short laptop viewport, where floors bite hardest
 *
 * Family A under the Repository Safety Programme: local browser, no network,
 * no database, no writes outside a temp file.
 *
 *   npm run build && node scripts/test-review-workspace-scrolling.mjs
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import os from "node:os";

/** The compiled stylesheet, so the test sees the real cascade. */
function findCompiledCss() {
  const candidates = execSync("node scripts/support/find-built-css.mjs", { encoding: "utf8" }).trim().split("\n");
  const withRule = candidates.filter(Boolean).find((file) => readFileSync(file, "utf8").includes("vyron-workspace-frame"));
  if (!withRule) {
    console.error("\nCompiled CSS containing .vyron-workspace-frame not found. Run `npm run build` first.\n");
    process.exit(2);
  }
  return readFileSync(withRule, "utf8");
}

const css = findCompiledCss();

/**
 * The review page's class chain, reproduced exactly.
 *
 * Kept in sync by hand with VyronCostAiShellClient and DocumentReviewWorkspace.
 * A copy is a liability, so the assertions below target containment behaviour
 * rather than specific class names — if the markup changes shape, the test
 * fails loudly instead of quietly passing on a stale replica.
 */
function harness({ layout }) {
  const invoiceWidth = layout === "focus-invoice" ? "width:70%" : layout === "focus-review" ? "width:26%" : "width:44%";
  const reviewFlex = "flex:1 1 0%;min-width:0";
  const rowCount = 60;
  const rows = Array.from(
    { length: rowCount },
    (_, i) =>
      `<tr${i === rowCount - 1 ? ' data-id="last-row"' : ""}><td${
        i === rowCount - 1 ? ' data-id="last-row-first-cell"' : ""
      } style="height:30px">Line ${i + 1}</td><td>1</td><td>100.00</td></tr>`
  ).join("");
  const pages = Array.from({ length: 8 }, (_, i) => `<div style="height:900px;background:#eee;margin-bottom:12px">Page ${i + 1}</div>`).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>
<body>
<div class="vyron-cost-shell vyron-master-workspace">
  <aside class="vyron-cost-shell-sidebar" style="width:330px"></aside>
  <div class="vyron-cost-shell-main vyron-workspace-frame relative z-0 ml-[330px] min-w-0 h-screen overflow-x-hidden" data-id="shell-main">
    <header class="shrink-0" style="height:56px;background:#fff">top bar</header>
    <main class="min-w-0 w-full max-w-full flex-1 overflow-x-hidden px-0 py-0 min-h-0 overflow-y-hidden" data-id="shell-mainarea">
      <div class="mx-auto min-w-0 w-full max-w-full h-full">
        <div class="flex min-w-0 w-full max-w-full flex-col h-full min-h-0">

          <div class="flex flex-col overflow-hidden bg-slate-100 h-full min-h-0" data-id="review-root">
            <header class="sticky top-0 z-30 shrink-0" style="height:44px;background:#fff">review header</header>
            <main class="flex min-h-0 flex-1 overflow-hidden p-2 lg:flex-row lg:gap-2.5 lg:p-2.5" data-id="review-main">

              <div class="flex min-h-0 flex-col overflow-hidden shrink-0" style="${invoiceWidth}" data-id="preview-col">
                <div class="mb-1 flex shrink-0 items-center justify-between gap-2"><div>Original Invoice</div></div>
                <div class="min-h-0 flex-1 overflow-hidden" data-id="preview-frame">
                  <div class="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-white">
                    <div class="shrink-0" style="height:36px">viewer toolbar</div>
                    <div class="flex min-h-0 flex-1">
                      <div class="min-h-0 flex-1 cursor-grab overflow-auto bg-slate-200/80 p-3" data-id="preview-scroller">${pages}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="flex min-h-0 flex-col overflow-hidden" style="${reviewFlex}" data-id="review-col">
                <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden" data-id="extraction-panel">
                  <div class="shrink-0 overflow-y-auto overscroll-contain rounded-2xl border bg-white max-h-[30vh] p-3" data-id="header-block">
                    ${Array.from({ length: 14 }, (_, i) => `<div style="height:44px">Field ${i + 1}</div>`).join("")}
                  </div>
                  <section class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-white" data-id="lines-section">
                    <div class="shrink-0" style="height:34px">Line Items</div>
                    <div class="min-h-[140px] flex-1 basis-0 overflow-auto overscroll-contain" data-id="lines-scroller">
                      <table class="min-w-[2100px] w-full"><tbody>${rows}</tbody></table>
                    </div>
                    <div class="shrink-0" style="height:38px" data-id="totals-footer">totals footer</div>
                  </section>
                </div>
              </div>

            </main>
          </div>

        </div>
      </div>
    </main>
  </div>
</div>
</body></html>`;
}

const browser = await chromium.launch();
let failures = 0;
let checks = 0;

function check(name, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`    ok    ${name}`);
    return;
  }
  failures += 1;
  console.log(`    FAIL  ${name}${detail ? `\n            ${detail}` : ""}`);
}

const tmp = mkdtempSync(path.join(os.tmpdir(), "vyron-scroll-"));

for (const [viewportName, width, height] of [
  ["desktop 1920x1080", 1920, 1080],
  ["laptop 1366x768", 1366, 768],
  ["short 1280x700", 1280, 700],
]) {
  for (const layout of ["split", "focus-invoice", "focus-review"]) {
    const file = path.join(tmp, `harness-${width}-${layout}.html`);
    writeFileSync(file, harness({ layout }), "utf8");

    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await page.goto(`file://${file.replace(/\\/g, "/")}`);

    const measured = await page.evaluate(() => {
      const read = (id) => {
        const el = document.querySelector(`[data-id="${id}"]`);
        if (!el) return null;
        const style = getComputedStyle(el);
        return {
          overflowY: style.overflowY,
          scrollable: el.scrollHeight - el.clientHeight > 1,
          overflowAmount: el.scrollHeight - el.clientHeight,
          clientHeight: el.clientHeight,
        };
      };
      const body = document.body;
      const doc = document.documentElement;
      return {
        bodyScrollable: body.scrollHeight - body.clientHeight > 1 || doc.scrollHeight - doc.clientHeight > 1,
        shellMain: read("shell-main"),
        shellMainArea: read("shell-mainarea"),
        reviewRoot: read("review-root"),
        reviewMain: read("review-main"),
        previewCol: read("preview-col"),
        previewFrame: read("preview-frame"),
        previewScroller: read("preview-scroller"),
        reviewCol: read("review-col"),
        extractionPanel: read("extraction-panel"),
        headerBlock: read("header-block"),
        linesSection: read("lines-section"),
        linesScroller: read("lines-scroller"),
      };
    });

    console.log(`\n  ${viewportName} · layout=${layout}`);

    check("page (body/html) does not scroll", measured.bodyScrollable === false);
    check(
      "shell main column does not scroll",
      measured.shellMain.overflowY === "hidden" && !measured.shellMain.scrollable,
      `overflowY=${measured.shellMain.overflowY} overflow=${measured.shellMain.overflowAmount}px`
    );
    check("shell main area does not scroll", !measured.shellMainArea.scrollable);
    check("review root does not scroll", !measured.reviewRoot.scrollable);
    check("review main does not scroll", !measured.reviewMain.scrollable);

    check(
      "invoice preview pane scrolls",
      measured.previewScroller.scrollable && measured.previewScroller.overflowY === "auto",
      `overflowY=${measured.previewScroller.overflowY} overflow=${measured.previewScroller.overflowAmount}px`
    );
    check("preview column itself does not scroll", !measured.previewCol.scrollable);
    check("preview frame itself does not scroll", !measured.previewFrame.scrollable);

    check(
      "line-item pane scrolls",
      measured.linesScroller.scrollable && measured.linesScroller.overflowY === "auto",
      `overflowY=${measured.linesScroller.overflowY} overflow=${measured.linesScroller.overflowAmount}px`
    );
    check("review column itself does not scroll", !measured.reviewCol.scrollable);
    check("extraction panel itself does not scroll", !measured.extractionPanel.scrollable);
    check("line section itself does not scroll", !measured.linesSection.scrollable);

    // The header block is allowed to scroll — it is capped on purpose — but it
    // must never be the thing that clips the table out of reach.
    check(
      "line-item pane has usable height",
      measured.linesScroller.clientHeight >= 100,
      `clientHeight=${measured.linesScroller.clientHeight}px`
    );

    /*
     * The workflow assertion.
     *
     * Every check above can pass on a layout the operator still cannot use:
     * `overflow: auto` is satisfied by a pane whose final row sits underneath
     * the totals footer, or below the fold of the viewport. This scrolls the
     * line pane to the end the way a person would and asserts the thing they
     * actually need — that the last invoice line is on screen, whole, with the
     * totals still visible beside it.
     */
    const reachability = await page.evaluate(() => {
      const scroller = document.querySelector('[data-id="lines-scroller"]');
      scroller.scrollTop = scroller.scrollHeight;
      // Force layout so the measurements below reflect the scrolled position.
      void scroller.offsetHeight;

      const rect = (id) => {
        const el = document.querySelector(`[data-id="${id}"]`);
        return el ? el.getBoundingClientRect() : null;
      };

      return {
        atBottom: Math.abs(scroller.scrollTop + scroller.clientHeight - scroller.scrollHeight) <= 1,
        scroller: rect("lines-scroller"),
        lastRow: rect("last-row-first-cell"),
        footer: rect("totals-footer"),
        viewportHeight: window.innerHeight,
      };
    });

    const { lastRow, footer, scroller } = reachability;

    check("line pane scrolls fully to the bottom", reachability.atBottom);

    check(
      "last invoice line is inside the scroll pane, not clipped",
      lastRow.bottom <= scroller.bottom + 1 && lastRow.top >= scroller.top - 1,
      `row ${lastRow.top.toFixed(0)}-${lastRow.bottom.toFixed(0)} vs pane ${scroller.top.toFixed(0)}-${scroller.bottom.toFixed(0)}`
    );

    check(
      "last invoice line is within the browser viewport",
      lastRow.top >= 0 && lastRow.bottom <= reachability.viewportHeight,
      `row ${lastRow.top.toFixed(0)}-${lastRow.bottom.toFixed(0)} vs viewport 0-${reachability.viewportHeight}`
    );

    check(
      "last invoice line has real height (is rendered, not collapsed)",
      lastRow.height > 4,
      `height=${lastRow.height.toFixed(1)}px`
    );

    check(
      "totals footer is still visible",
      footer.height > 0 && footer.top >= 0 && footer.bottom <= reachability.viewportHeight,
      `footer ${footer.top.toFixed(0)}-${footer.bottom.toFixed(0)} vs viewport 0-${reachability.viewportHeight}`
    );

    check(
      "nothing is clipped underneath the totals footer",
      lastRow.bottom <= footer.top + 1,
      `last row bottom ${lastRow.bottom.toFixed(0)} overlaps footer top ${footer.top.toFixed(0)}`
    );

    await context.close();
  }
}

/*
 * Negative control.
 *
 * Reproduces the markup as it stood BEFORE this change: the utility class
 * `overflow-y-hidden` on the shell main column instead of the specificity-
 * matched `.vyron-workspace-frame` rule, and a `min-h` review root instead of a
 * bounded one. Both defects have to be visible to this test, or the 117 passes
 * above prove nothing.
 */
console.log("\n  negative control — the pre-fix markup must FAIL these rules");

const controlHtml = harness({ layout: "split" })
  .replace("vyron-cost-shell-main vyron-workspace-frame", "vyron-cost-shell-main flex flex-col overflow-y-hidden")
  // The whole pre-fix chain has to be restored, not just the shell class: the
  // intermediate <main> and its wrappers only gained `min-h-0`/`h-full` as part
  // of this change, and leaving them in place clips the growth before the shell
  // column can see it — which is why the first attempt at this control passed
  // when it should not have.
  .replace('class="min-w-0 w-full max-w-full flex-1 overflow-x-hidden px-0 py-0 min-h-0 overflow-y-hidden"', 'class="min-w-0 w-full max-w-full flex-1 overflow-x-hidden px-0 py-0"')
  .replace('class="mx-auto min-w-0 w-full max-w-full h-full"', 'class="mx-auto min-w-0 w-full max-w-full"')
  .replace('class="flex min-w-0 w-full max-w-full flex-col h-full min-h-0"', 'class="flex min-w-0 w-full max-w-full flex-col"')
  /*
   * `min-h` with content taller than the viewport is the situation the old
   * layout actually hit: a long line-item table grew the workspace past the
   * screen. The harness panes are overflow-hidden, so the growth is simulated
   * with an explicit height — the point being what the SHELL does when its
   * child is too tall, not how the child got that way.
   */
  .replace(
    'class="flex flex-col overflow-hidden bg-slate-100 h-full min-h-0"',
    'class="flex flex-col bg-slate-100" style="min-height:1600px"'
  );

const controlFile = path.join(tmp, "harness-control.html");
writeFileSync(controlFile, controlHtml, "utf8");

const controlContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const controlPage = await controlContext.newPage();
await controlPage.goto(`file://${controlFile.replace(/\\/g, "/")}`);

const control = await controlPage.evaluate(() => {
  const read = (id) => {
    const el = document.querySelector(`[data-id="${id}"]`);
    return {
      overflowY: getComputedStyle(el).overflowY,
      scrollable: el.scrollHeight - el.clientHeight > 1,
      overflowAmount: el.scrollHeight - el.clientHeight,
    };
  };
  return { shellMain: read("shell-main"), shellMainArea: read("shell-mainarea") };
});
await controlContext.close();

check(
  "control: utility class loses to the stylesheet (proves the specificity bug was real)",
  control.shellMain.overflowY === "auto",
  `computed overflowY=${control.shellMain.overflowY}; expected "auto" — if this is "hidden", the utility now wins and the control is stale`
);
/*
 * The scroll lands on the main AREA, not the shell column: main absorbs the
 * overflow before the column ever sees it. Measured, not assumed — the first
 * version of this control asserted the wrong element and passed a layout that
 * was in fact broken. From the operator's seat it is the same defect either
 * way: the review body scrolls as one, taking the invoice preview off screen.
 */
check(
  "control: the pre-fix layout scrolls the review body as one",
  control.shellMainArea.scrollable === true,
  `shell-mainarea overflow=${control.shellMainArea.overflowAmount}px — the control did not reproduce the regression, so the passes above are not meaningful`
);

/*
 * Reachability control.
 *
 * The workflow assertions above are only worth their runtime if they fail on a
 * layout where the last line is genuinely out of reach. This removes the scroll
 * container from the line pane and lets the table overflow its section — the
 * shape the old `min-h-[280px]` floor produced on a short screen, where the
 * excess was clipped by an overflow-hidden ancestor rather than scrolled.
 */
console.log("\n  reachability control — a clipped last row must be detected");

const clippedHtml = harness({ layout: "split" }).replace(
  'class="min-h-[140px] flex-1 basis-0 overflow-auto overscroll-contain" data-id="lines-scroller"',
  'class="flex-1 basis-0 overflow-auto overscroll-contain" style="min-height:1200px" data-id="lines-scroller"'
);

const clippedFile = path.join(tmp, "harness-clipped.html");
writeFileSync(clippedFile, clippedHtml, "utf8");

const clippedContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const clippedPage = await clippedContext.newPage();
await clippedPage.goto(`file://${clippedFile.replace(/\\/g, "/")}`);

const clipped = await clippedPage.evaluate(() => {
  const scroller = document.querySelector('[data-id="lines-scroller"]');
  scroller.scrollTop = scroller.scrollHeight;
  void scroller.offsetHeight;
  const rect = (id) => document.querySelector(`[data-id="${id}"]`).getBoundingClientRect();
  const section = rect("lines-section");
  const footer = rect("totals-footer");
  return {
    // The section cannot shrink to fit, so its overflow-hidden clips the footer
    // out of view entirely — the totals disappear below the pane.
    footerPushedOutOfSection: footer.bottom > section.bottom + 1,
    footerOutsideViewport: footer.bottom > window.innerHeight,
    detail: `footer ${footer.top.toFixed(0)}-${footer.bottom.toFixed(0)}, section bottom ${section.bottom.toFixed(0)}, viewport ${window.innerHeight}`,
  };
});
await clippedContext.close();

check(
  "control: an oversized line pane pushes the totals footer out of its section",
  clipped.footerPushedOutOfSection === true,
  `${clipped.detail} — the clipped layout was not reproduced, so the reachability checks above prove nothing`
);
check(
  "control: the clipped footer is detectable as off-screen",
  clipped.footerOutsideViewport === true,
  clipped.detail
);

await browser.close();

console.log(`\n  ${checks - failures}/${checks} checks passed\n`);
process.exit(failures ? 1 : 0);
