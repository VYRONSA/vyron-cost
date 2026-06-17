import CustomerInvoiceDetailPageClient from "@/components/vyron-cost/customers/CustomerInvoiceDetailPageClient";

export default async function CustomerInvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceNumber: string }>;
}) {
  const { invoiceNumber } = await params;
  return <CustomerInvoiceDetailPageClient invoiceNumber={invoiceNumber} />;
}
