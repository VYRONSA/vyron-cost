import { type Href, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ScanButton } from "@/components/scanner/ScanButton";
import { VyronBadge, VyronButton, VyronCard, VyronEmptyState, VyronInput, VyronLoading } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { useCreateSalesDraftMutation, useSalesCustomers, useSalesProducts } from "@/hooks/useSales";
import { useAuth } from "@/providers";
import type { SalesDraftLineInput, SalesProduct } from "@/types/sales";

type DraftLine = SalesDraftLineInput & { key: string };

function formatMoney(value: number) {
  return `R ${value.toFixed(2)}`;
}

function buildLineFromProduct(product: SalesProduct): DraftLine {
  return {
    key: `${product.id}-${Date.now()}`,
    productId: product.id,
    productName: product.product_name,
    quantity: 1,
    sellingPrice: product.selling_price,
    costPerUnit: product.average_unit_cost,
  };
}

export default function NewInvoiceScreen() {
  const router = useRouter();
  const permissions = usePermissions();
  const { session } = useAuth();

  const [customerSearch, setCustomerSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [discountPct, setDiscountPct] = useState("0");
  const [vatPct, setVatPct] = useState("15");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const customersQuery = useSalesCustomers();
  const productsQuery = useSalesProducts(productSearch);
  const mutation = useCreateSalesDraftMutation();

  const customers = useMemo(() => customersQuery.data ?? [], [customersQuery.data]);
  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);

  const filteredCustomers = useMemo(() => {
    const needle = customerSearch.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter((row) => row.customer_name.toLowerCase().includes(needle));
  }, [customers, customerSearch]);

  const selectedCustomer = useMemo(
    () => customers.find((row) => row.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId]
  );

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity * line.sellingPrice, 0),
    [lines]
  );
  const totalCost = useMemo(() => lines.reduce((sum, line) => sum + line.quantity * line.costPerUnit, 0), [lines]);
  const discount = subtotal * (Number(discountPct || 0) / 100);
  const afterDiscount = Math.max(0, subtotal - discount);
  const vat = afterDiscount * (Number(vatPct || 0) / 100);
  const grandTotal = afterDiscount + vat;
  const gpPct = grandTotal > 0 ? ((grandTotal - totalCost) / grandTotal) * 100 : 0;
  const requiresApproval = gpPct < 20;

  if (permissions.isLoading || customersQuery.isLoading || productsQuery.isLoading) return <VyronLoading />;

  if (!permissions.data?.canCreateSalesOrders) {
    return (
      <VyronEmptyState
        title="Invoice creation not permitted"
        description="Your workspace role does not include sales order creation permissions."
      />
    );
  }

  const addProduct = (product: SalesProduct) => {
    setLines((current) => {
      const existing = current.find((row) => row.productId === product.id);
      if (existing) {
        return current.map((row) =>
          row.productId === product.id ? { ...row, quantity: row.quantity + 1 } : row
        );
      }
      return [...current, buildLineFromProduct(product)];
    });
  };

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const removeLine = (key: string) => {
    setLines((current) => current.filter((row) => row.key !== key));
  };

  const submitDraft = async () => {
    if (!selectedCustomer) {
      setSubmitError("Select a customer before creating an invoice.");
      return;
    }
    if (!lines.length) {
      setSubmitError("Add at least one product line.");
      return;
    }

    setSubmitError(null);

    try {
      const result = await mutation.mutateAsync({
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.customer_name,
        notes: notes.trim() || undefined,
        lines: lines.map((line) => ({
          productId: line.productId,
          productName: line.productName,
          quantity: line.quantity,
          sellingPrice: line.sellingPrice,
          costPerUnit: line.costPerUnit,
        })),
        actor: session?.email || permissions.data?.email || "vyron-ops-mobile",
      });

      if ((result as { queued?: boolean })?.queued) {
        router.replace("/sales" as Href);
        return;
      }

      const created = result as { id?: string };
      if (created?.id) {
        router.replace(`/sales/${created.id}` as Href);
        return;
      }

      router.replace("/sales" as Href);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not create invoice draft.");
    }
  };

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <VyronCard className="gap-3">
          <Text className="text-lg font-bold text-vyron-text">1. Select customer</Text>
          <VyronInput
            label="Customer search"
            placeholder="Customer name"
            value={customerSearch}
            onChangeText={setCustomerSearch}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {filteredCustomers.map((customer) => (
                <VyronButton
                  key={customer.id}
                  label={customer.customer_name}
                  variant={selectedCustomerId === customer.id ? "primary" : "secondary"}
                  className="min-h-[48px] px-4"
                  onPress={() => setSelectedCustomerId(customer.id)}
                />
              ))}
            </View>
          </ScrollView>
          {selectedCustomer ? (
            <View className="gap-1">
              <Text className="text-sm font-semibold text-vyron-subtle">Selected: {selectedCustomer.customer_name}</Text>
              {permissions.data?.canViewCustomerBalances ? (
                <Text className="text-sm font-semibold text-vyron-muted">
                  Sales history R {Number(selectedCustomer.total_sales || 0).toFixed(2)} · Invoices {Number(selectedCustomer.invoice_count || 0)}
                </Text>
              ) : null}
              <VyronButton
                label="Open customer profile"
                variant="ghost"
                className="min-h-[44px] px-3"
                onPress={() => router.push(`/sales/customer/${selectedCustomer.id}` as Href)}
              />
            </View>
          ) : null}
        </VyronCard>

        <VyronCard className="gap-3">
          <Text className="text-lg font-bold text-vyron-text">2. Add products</Text>
          <VyronInput
            label="Product search"
            placeholder="Name or SKU"
            value={productSearch}
            onChangeText={setProductSearch}
          />
          <ScanButton
            label="Scan product"
            workflow="sales"
            context={{ returnPath: "/sales/new" }}
            onValidated={(result) => {
              if (result.matched?.description) setProductSearch(result.matched.description);
              if (result.matched?.itemCode) setProductSearch(result.matched.itemCode);
            }}
          />

          <View className="gap-2">
            {products.slice(0, 12).map((product) => (
              <VyronCard key={product.id} className="gap-2 p-3">
                <Text className="text-base font-bold text-vyron-text">{product.product_name}</Text>
                <Text className="text-xs font-semibold text-vyron-muted">
                  Stock {product.current_stock} · Sell {formatMoney(product.selling_price)}
                </Text>
                <VyronButton label="Add line" className="min-h-[44px]" onPress={() => addProduct(product)} />
                <VyronButton
                  label="Product details"
                  variant="ghost"
                  className="min-h-[40px]"
                  onPress={() => router.push(`/sales/product/${product.id}` as Href)}
                />
              </VyronCard>
            ))}
          </View>
        </VyronCard>

        <VyronCard className="gap-3">
          <Text className="text-lg font-bold text-vyron-text">3. Draft lines</Text>
          {lines.length === 0 ? (
            <Text className="text-sm font-semibold text-vyron-muted">No products added yet.</Text>
          ) : (
            <View className="gap-3">
              {lines.map((line) => (
                <VyronCard key={line.key} className="gap-2 p-3">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="flex-1 text-base font-bold text-vyron-text">{line.productName}</Text>
                    <VyronButton label="Remove" variant="ghost" className="min-h-[40px] px-3" onPress={() => removeLine(line.key)} />
                  </View>
                  <View className="flex-row items-center gap-2">
                    <VyronButton
                      label="-"
                      variant="secondary"
                      className="min-h-[40px] w-12"
                      onPress={() => updateLine(line.key, { quantity: Math.max(1, line.quantity - 1) })}
                    />
                    <Text className="text-base font-bold text-vyron-text">Qty {line.quantity}</Text>
                    <VyronButton
                      label="+"
                      variant="secondary"
                      className="min-h-[40px] w-12"
                      onPress={() => updateLine(line.key, { quantity: line.quantity + 1 })}
                    />
                  </View>
                  <VyronInput
                    label="Unit price"
                    keyboardType="numeric"
                    value={String(line.sellingPrice)}
                    onChangeText={(value) => updateLine(line.key, { sellingPrice: Number(value || 0) })}
                  />
                </VyronCard>
              ))}
            </View>
          )}
        </VyronCard>

        <VyronCard className="gap-3">
          <Text className="text-lg font-bold text-vyron-text">4. Totals and notes</Text>
          <View className="flex-row flex-wrap gap-2">
            <VyronBadge label={`Subtotal ${formatMoney(subtotal)}`} tone="info" />
            <VyronBadge label={`Total ${formatMoney(grandTotal)}`} tone="success" />
            {permissions.data?.canViewProductGp ? (
              <VyronBadge label={`GP ${gpPct.toFixed(1)}%`} tone={gpPct < 20 ? "warning" : "success"} />
            ) : null}
            <VyronBadge
              label={requiresApproval ? "Approval required" : "Auto-approval eligible"}
              tone={requiresApproval ? "warning" : "success"}
            />
          </View>
          <VyronInput label="Discount %" keyboardType="numeric" value={discountPct} onChangeText={setDiscountPct} />
          <VyronInput label="VAT %" keyboardType="numeric" value={vatPct} onChangeText={setVatPct} />
          <VyronInput label="Notes" placeholder="Optional order notes" value={notes} onChangeText={setNotes} multiline />
        </VyronCard>

        {submitError ? <Text className="text-base font-semibold text-vyron-rose">{submitError}</Text> : null}

        <VyronButton
          label={mutation.isPending ? "Creating…" : "Create draft invoice"}
          onPress={submitDraft}
          disabled={mutation.isPending}
        />
      </View>
    </ScrollView>
  );
}
