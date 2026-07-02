import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/query-keys";
import {
  createSalesDraftInvoice,
  fetchMobileCustomerProfile,
  fetchMobileProductDetail,
  fetchMobileProductIntelligence,
  fetchSalesCustomers,
  fetchSalesInvoiceDetail,
  fetchSalesInvoices,
  fetchSalesProducts,
  updateSalesInvoiceStatus,
} from "@/services/sales/sales-api";
import { executeOrEnqueue } from "@/services/sync/sync-gateway";

export function useSalesCustomers() {
  return useQuery({
    queryKey: queryKeys.salesCustomers,
    queryFn: fetchSalesCustomers,
    staleTime: 60_000,
  });
}

export function useSalesProducts(search?: string) {
  return useQuery({
    queryKey: queryKeys.salesProducts(search),
    queryFn: () => fetchSalesProducts(search),
    staleTime: 30_000,
  });
}

export function useSalesInvoices(filters?: { status?: string; search?: string }) {
  return useQuery({
    queryKey: queryKeys.salesInvoices(filters),
    queryFn: () => fetchSalesInvoices(filters),
    staleTime: 30_000,
  });
}

export function useSalesInvoiceDetail(invoiceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.salesInvoice(invoiceId || ""),
    queryFn: () => fetchSalesInvoiceDetail(invoiceId!),
    enabled: Boolean(invoiceId),
  });
}

export function useMobileProductIntelligence() {
  return useQuery({
    queryKey: queryKeys.mobileProductIntelligence,
    queryFn: fetchMobileProductIntelligence,
    staleTime: 60_000,
  });
}

export function useMobileCustomerProfile(customerId: string | undefined) {
  return useQuery({
    queryKey: ["mobile-customer-profile", customerId || ""],
    queryFn: () => fetchMobileCustomerProfile(customerId!),
    enabled: Boolean(customerId),
    staleTime: 30_000,
  });
}

export function useMobileProductDetail(input: { productId?: string; barcode?: string }) {
  const key = input.productId || input.barcode || "";
  return useQuery({
    queryKey: ["mobile-product-detail", key],
    queryFn: () => fetchMobileProductDetail(input),
    enabled: Boolean(key),
    staleTime: 30_000,
  });
}

async function invalidateSales(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["sales-invoices"] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.salesCustomers }),
    queryClient.invalidateQueries({ queryKey: ["sales-invoice"] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.mobileProductIntelligence }),
  ]);
}

export function useCreateSalesDraftMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Parameters<typeof createSalesDraftInvoice>[0] & { actor?: string }) => {
      const outcome = await executeOrEnqueue({
        workflow: "sales",
        action: "create_invoice_draft",
        entityType: "customer_invoice",
        entityId: input.customerId,
        payload: { draft: input },
        user: input.actor || "vyron-ops-mobile",
        onlineExecute: () => createSalesDraftInvoice(input),
      });
      if (outcome.mode === "queued") return { queued: true, queueId: outcome.queueId };
      return outcome.result;
    },
    onSuccess: async () => invalidateSales(queryClient),
  });
}

export function useUpdateSalesInvoiceStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      invoiceId: string;
      action: "approve" | "send" | "email" | "paid" | "cancel" | "pdf" | "whatsapp" | "signature";
      signer?: string;
      actor?: string;
    }) => {
      const outcome = await executeOrEnqueue({
        workflow: "sales",
        action: "update_invoice_status",
        entityType: "customer_invoice",
        entityId: input.invoiceId,
        payload: input,
        user: input.actor || "vyron-ops-mobile",
        onlineExecute: () => updateSalesInvoiceStatus(input.invoiceId, input.action, { signer: input.signer }),
      });
      if (outcome.mode === "queued") return { queued: true, queueId: outcome.queueId };
      return outcome.result;
    },
    onSuccess: async () => invalidateSales(queryClient),
  });
}
