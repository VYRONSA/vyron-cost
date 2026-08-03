# Supplier Invoice Processing — Product Backlog

The client is buying **supplier invoice processing**, not a supplier invoice
workspace. Every item in this backlog must name the one business outcome it
improves. An item that improves none of these does not belong here and is not
implemented:

| Metric | Meaning |
| --- | --- |
| **Faster invoice capture** | Time from receiving a document to extracted data existing |
| **More accurate extraction** | Fewer wrong values produced by the engine |
| **Fewer corrections** | Fewer fields the clerk has to touch by hand |
| **Faster approval** | Time from extracted data to approved and costed |
| **Better costing** | Cost data that is more correct or more complete downstream |

## Status of the review workspace

**Frozen at Version 1** as of PCP-042A (commit `b854021`). No further redesign
without a real usability problem observed in day-to-day use.

---

## BL-001 — Auto-highlight the invoice line using `source_page` + `source_bbox`

**Priority: VERY HIGH.** Likely the single biggest productivity improvement
remaining in the review experience. Not cosmetic.

**Metrics: Faster approval · Fewer corrections**

### The problem

The clerk must locate each printed line on the invoice by eye before they can
check the extracted row against it. On a sixteen-line invoice that is sixteen
manual searches through a scanned page, three hundred invoices a day.

### Why it is not already built

Measured 2026-08-03. `vyron_document_line_items.source_page` and `source_bbox`
are **null on every line of every document**, including documents extracted with
the current engine on that date. Nothing writes them: the insert payload in
`src/lib/vyron-document-extraction.ts` (the `extraction.lineItems.map(...)`
block) omits both columns.

The **consuming side already exists and is complete**:

- `src/lib/vyron-document-review-client.ts` — `parseSourceBBox`, and the
  `viewerRegions` / focus-target builders
- `ReviewDraftLine.sourceBbox`, `ViewerFocusTarget`
- `src/components/InvoiceDocumentViewer.tsx` — accepts `focusTarget` and
  `activeLineId`
- `src/components/DocumentReviewWorkspace.tsx` — `focusLine()` already sets a
  focus target on row activation

So this is a **producer-side change only**. The UI needs no new work beyond
re-enabling the affordance.

### Scope

1. Have the extraction engine emit, per line item, the source page number and a
   normalised bounding box (`x`, `y`, `width`, `height` as fractions of page
   size).
2. Add `source_page` and `source_bbox` to the line insert payload.
3. Re-enable the row-to-invoice focus affordance in the grid header (it was
   removed in PCP-042A because it promised behaviour the data could not
   support).

### Hard constraint

**Do not synthesise the bounding boxes.** Dividing the line-item table into N
equal bands to guess where line *i* sits is an estimate, and estimates are not
evidence. If the engine cannot measure a line's position, `source_bbox` stays
null and the UI falls back to today's behaviour for that line.

### Blocked by

The extraction subsystem is frozen until the Kingdom Foods certification run.
This is a producer-side change, so it must wait for that freeze to lift and will
require re-certification.

### Acceptance

- `source_page` and `source_bbox` populated for lines the engine can locate
- Activating a row scrolls the preview to that line and highlights it
- Lines without a measured box degrade silently — no fake highlight
- Measured: time to review a sixteen-line invoice, before and after

---

## Recorded defects — found during PCP-040/041/042, not yet fixed

These were recorded rather than fixed under the "one defect at a time" rule.
Each is listed with the metric it affects.

### BL-002 — Header chip and Extraction Quality panel contradict each other

**Metric: Faster approval.** On the same document the header chip reads
`mismatch` while the Extraction Quality panel reads `TOTALS Reconciled`. A clerk
who sees the system disagree with itself stops and escalates instead of
approving. Two surfaces, two different reconciliation verdicts — one of them is
computed from a different basis and they need to agree or say why they differ.

### BL-003 — "Add Invoice Line" round-trip is unverified end to end

**Metric: Fewer corrections.** Never confirmed that adding a line puts the
cursor in the first field, saves, and survives a reload. If it does not persist,
manual line additions are silently lost and the clerk redoes the work.

### BL-004 — Approval gate is unverified against incomplete data

**Metric: Better costing.** Never confirmed that approval rejects a document
with unmapped lines or an unexplained totals difference, and accepts a complete
one. If an incomplete document can be approved, wrong costs reach the costing
engine.

### BL-005 — Invoice preview zoom controls consume the reading pane

**Metric: Faster approval.** In Focus Invoice the zoom controls
(`− + Fit Width · Fit Page · 100–300% · Open Full Screen`) wrap into five rows
and take most of the 221px column when the review side is narrow. Lower value
than the items above; listed so it is not rediscovered.
