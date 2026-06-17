export type InvoiceStockPostingStatus = "Not Posted" | "Posted" | "Reversed";

export function getInvoiceStockPostingStatus(invoice: {
  stock_posted?: boolean;
  stock_reversed?: boolean;
}): InvoiceStockPostingStatus {
  if (invoice.stock_reversed) return "Reversed";
  if (invoice.stock_posted) return "Posted";
  return "Not Posted";
}
