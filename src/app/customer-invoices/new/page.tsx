import { redirect } from "next/navigation";

export default function NewCustomerInvoicePage() {
  redirect("/customer-invoices?create=1");
}
