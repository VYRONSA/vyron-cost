import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { VyronBadge, VyronButton, VyronCard, VyronEmptyState, VyronInput, VyronLoading } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { useSalesInvoiceDetail, useUpdateSalesInvoiceStatusMutation } from "@/hooks/useSales";
import { useAuth } from "@/providers";

function formatMoney(value: number) {
  return `R ${value.toFixed(2)}`;
}

function toneForStatus(status: string) {
  if (status === "Paid") return "success" as const;
  if (status === "Cancelled") return "danger" as const;
  if (status === "Draft") return "warning" as const;
  return "info" as const;
}

export default function SalesInvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const permissions = usePermissions();
  const { session } = useAuth();
  const { data: invoice, isLoading, error, refetch } = useSalesInvoiceDetail(id);
  const mutation = useUpdateSalesInvoiceStatusMutation();
  const [actionError, setActionError] = useState<string | null>(null);
  const [signatureName, setSignatureName] = useState("");

  if (isLoading || permissions.isLoading) return <VyronLoading />;
  if (error || !invoice) {
    return (
      <VyronEmptyState
        title="Invoice unavailable"
        description={error instanceof Error ? error.message : "Not found"}
        actionLabel="Retry"
        onAction={() => refetch()}
      />
    );
  }

  const actor = session?.email || permissions.data?.email || "vyron-ops-mobile";

  const performAction = async (
    action: "approve" | "send" | "email" | "paid" | "cancel" | "pdf" | "whatsapp" | "signature"
  ) => {
    setActionError(null);
    try {
      await mutation.mutateAsync({
        invoiceId: invoice.id,
        action,
        signer: action === "signature" ? signatureName.trim() : undefined,
        actor,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Invoice action failed.");
    }
  };

  const shareToWhatsApp = async () => {
    const message = encodeURIComponent(
      `Invoice ${invoice.invoice_number} for ${invoice.customer_name} totals ${formatMoney(invoice.sales_value)}.`
    );
    await performAction("whatsapp");
    await Linking.openURL(`https://wa.me/?text=${message}`);
  };

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <VyronCard className="gap-3">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1 gap-1">
              <Text className="text-2xl font-bold text-vyron-text">{invoice.invoice_number}</Text>
              <Text className="text-sm font-semibold text-vyron-muted">{invoice.customer_name}</Text>
              <Text className="text-xs font-semibold text-vyron-subtle">Invoice date {invoice.invoice_date}</Text>
            </View>
            <VyronBadge label={invoice.status} tone={toneForStatus(invoice.status)} />
          </View>

          <View className="flex-row flex-wrap gap-4">
            <Text className="text-sm font-semibold text-vyron-subtle">Sales {formatMoney(invoice.sales_value)}</Text>
            {permissions.data?.canViewProductGp ? (
              <Text className="text-sm font-semibold text-vyron-subtle">
                GP {invoice.gp_percentage.toFixed(1)}% ({formatMoney(invoice.gross_profit)})
              </Text>
            ) : null}
          </View>

          {invoice.notes ? <Text className="text-sm font-medium text-vyron-muted">{invoice.notes}</Text> : null}
        </VyronCard>

        <VyronCard className="gap-3">
          <Text className="text-lg font-bold text-vyron-text">Invoice lines</Text>
          {(invoice.lines || []).length === 0 ? (
            <Text className="text-sm font-semibold text-vyron-muted">No lines captured.</Text>
          ) : (
            <View className="gap-2">
              {(invoice.lines || []).map((line) => (
                <VyronCard key={line.id} className="gap-1 p-3">
                  <Text className="text-base font-bold text-vyron-text">{line.product_name}</Text>
                  <Text className="text-xs font-semibold text-vyron-muted">
                    Qty {line.quantity} · Unit {formatMoney(line.selling_price)} · Total {formatMoney(line.line_total)}
                  </Text>
                </VyronCard>
              ))}
            </View>
          )}
        </VyronCard>

        <VyronCard className="gap-3">
          <Text className="text-lg font-bold text-vyron-text">Actions</Text>
          <View className="gap-2">
            {invoice.status === "Draft" ? (
              <VyronButton
                label={mutation.isPending ? "Posting…" : "Post invoice"}
                onPress={() => performAction("approve")}
                disabled={!permissions.data?.canConvertSalesOrderToInvoice || mutation.isPending}
              />
            ) : null}

            {invoice.status === "Approved" ? (
              <VyronButton
                label={mutation.isPending ? "Emailing…" : "Email invoice"}
                onPress={() => performAction("email")}
                disabled={!permissions.data?.canConvertSalesOrderToInvoice || mutation.isPending}
              />
            ) : null}

            {invoice.status === "Sent" ? (
              <VyronButton
                label={mutation.isPending ? "Updating…" : "Mark paid"}
                onPress={() => performAction("paid")}
                disabled={!permissions.data?.canConvertSalesOrderToInvoice || mutation.isPending}
              />
            ) : null}

            <VyronInput
              label="Customer signature"
              placeholder="Signer name"
              value={signatureName}
              onChangeText={setSignatureName}
            />
            <VyronButton
              label={mutation.isPending ? "Saving signature…" : "Capture signature"}
              variant="secondary"
              onPress={() => performAction("signature")}
              disabled={!permissions.data?.canConvertSalesOrderToInvoice || mutation.isPending || !signatureName.trim()}
            />

            <VyronButton
              label="Share on WhatsApp"
              variant="secondary"
              onPress={shareToWhatsApp}
              disabled={!permissions.data?.canConvertSalesOrderToInvoice}
            />

            <VyronButton
              label="PDF summary"
              variant="secondary"
              onPress={() => performAction("pdf")}
            />

            {invoice.status !== "Cancelled" && invoice.status !== "Paid" ? (
              <VyronButton
                label={mutation.isPending ? "Cancelling…" : "Cancel invoice"}
                variant="danger"
                onPress={() => performAction("cancel")}
                disabled={!permissions.data?.canEditSalesOrderDrafts || mutation.isPending}
              />
            ) : null}
          </View>

          {actionError ? <Text className="text-sm font-semibold text-vyron-rose">{actionError}</Text> : null}
        </VyronCard>
      </View>
    </ScrollView>
  );
}
