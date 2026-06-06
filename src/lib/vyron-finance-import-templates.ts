export type FinanceImportType =
  | "trial-balance"
  | "general-ledger"
  | "accounts-payable"
  | "accounts-receivable"
  | "inventory-export"
  | "bank-transactions";

export type FinanceImportTemplate = {
  id: FinanceImportType;
  label: string;
  description: string;
  columns: string[];
  sampleRow: string[];
};

export const financeImportTemplates: FinanceImportTemplate[] = [
  {
    id: "trial-balance",
    label: "Trial Balance",
    description: "Chart of accounts with debit/credit balances",
    columns: ["account_code", "account_name", "account_type", "debit", "credit", "prior_balance"],
    sampleRow: ["4000", "Sales Revenue", "revenue", "0", "1250000", "1180000"],
  },
  {
    id: "general-ledger",
    label: "General Ledger",
    description: "GL journal lines for period analysis",
    columns: ["journal_date", "account_code", "account_name", "debit", "credit", "reference", "narration"],
    sampleRow: ["2026-06-01", "5100", "COS - Protein", "45000", "0", "PO-1001", "Chicken fillet GRN"],
  },
  {
    id: "accounts-payable",
    label: "Accounts Payable",
    description: "Supplier creditor balances and ageing",
    columns: ["supplier_name", "invoice_number", "invoice_date", "due_date", "amount", "status"],
    sampleRow: ["Protein Direct", "INV-1002", "2026-05-18", "2026-06-17", "9500.00", "Open"],
  },
  {
    id: "accounts-receivable",
    label: "Accounts Receivable",
    description: "Customer debtor balances",
    columns: ["customer_name", "invoice_number", "invoice_date", "due_date", "amount", "status"],
    sampleRow: ["Retail Chain A", "SI-4401", "2026-05-20", "2026-06-19", "28000.00", "Open"],
  },
  {
    id: "inventory-export",
    label: "Inventory Export",
    description: "Stock valuation export for finance",
    columns: ["sku", "item_name", "category", "qty_on_hand", "unit_cost", "total_value"],
    sampleRow: ["ING-001", "Chicken Fillet", "Protein", "240", "95.00", "22800.00"],
  },
  {
    id: "bank-transactions",
    label: "Bank Transactions",
    description: "Bank statement lines for cash reconciliation",
    columns: ["transaction_date", "description", "reference", "debit", "credit", "balance"],
    sampleRow: ["2026-06-02", "Supplier payment Protein Direct", "PAY-8821", "9500.00", "0", "412000.00"],
  },
];

export function getFinanceImportTemplate(type: FinanceImportType) {
  return financeImportTemplates.find((t) => t.id === type)!;
}
