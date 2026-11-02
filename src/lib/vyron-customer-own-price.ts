import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PriceListError,
  addCustomerPriceListItem,
  assignCustomerPriceLists,
  createCustomerPriceList,
  isUuidShape,
  loadCompanyDefaultPriceList,
  parseListPrice,
  updateCustomerPriceListItemPrice,
  writeCustomerPriceListAudit,
} from "@/lib/vyron-customer-price-lists";

/**
 * Set ONE customer's price for a product, without touching any other customer.
 *
 * Price lists are shared: several customers can be assigned the same standard
 * or contract list, and customers with no list are priced from the company
 * default. Editing a list item therefore changes the price for everyone on that
 * list (Kingdom Foods, 2026-11: "when updating a price for one customer, ONLY
 * that customer's price must be updated").
 *
 * So the change goes to the customer's OWN contract list — a contract list no
 * other customer is assigned and that is not the company default:
 *   - if the customer already has one, the item on it is updated (or added);
 *   - otherwise one is created (copy-on-write). Every Active item of the
 *     customer's current contract list is copied into it first, so the
 *     customer's other prices are unchanged; their standard list stays in the
 *     standard slot, and a customer who was priced from the company default
 *     gets that list in the standard slot so their other products keep the
 *     prices they had. The shared lists themselves are never written.
 *
 * Contract prices beat standard prices in resolveCustomerProductPrice, so the
 * new price applies to this customer only.
 */
export async function setCustomerOwnProductPrice(
  supabase: SupabaseClient,
  companyId: string,
  params: { customerId: string; productId: string; price: unknown; actor: string }
): Promise<{ priceListId: string; itemId: string; createdOwnList: boolean; price: number }> {
  const price = parseListPrice(params.price);
  if (!isUuidShape(params.customerId)) throw new PriceListError("Customer not found.", 404);
  if (!isUuidShape(params.productId)) throw new PriceListError("Product not found.", 404);

  const { data: customer, error: customerError } = await supabase
    .from("vyron_customers")
    .select("id, customer_name")
    .eq("company_id", companyId)
    .eq("id", params.customerId)
    .maybeSingle();
  if (customerError) throw new Error(customerError.message);
  if (!customer) throw new PriceListError("Customer not found.", 404);

  const { data: assignment, error: assignmentError } = await supabase
    .from("vyron_customer_price_list_assignments")
    .select("*")
    .eq("company_id", companyId)
    .eq("customer_id", params.customerId)
    .maybeSingle();
  if (assignmentError) throw new Error(assignmentError.message);
  const active = assignment && String(assignment.status || "Active") === "Active" ? assignment : null;
  const contractId: string | null = active?.contract_price_list_id || null;
  const standardId: string | null = active?.default_price_list_id || null;
  const companyDefault = await loadCompanyDefaultPriceList(supabase, companyId);

  let ownListId: string | null = null;
  if (contractId && contractId !== companyDefault?.id) {
    const { data: sharers, error } = await supabase
      .from("vyron_customer_price_list_assignments")
      .select("customer_id, default_price_list_id, contract_price_list_id")
      .eq("company_id", companyId)
      .neq("customer_id", params.customerId);
    if (error) throw new Error(error.message);
    const shared = (sharers || []).some((row: { contract_price_list_id?: string | null; default_price_list_id?: string | null }) => row.contract_price_list_id === contractId || row.default_price_list_id === contractId);
    if (!shared) ownListId = contractId;
  }

  let createdOwnList = false;
  if (!ownListId) {
    const customerName = String(customer.customer_name || "Customer").trim();
    const list = await createCustomerPriceList(supabase, companyId, {
      listName: `${customerName} - customer prices`,
      listType: "Contract",
      status: "Active",
      notes: "Created automatically so this customer's prices can change without changing any other customer's.",
      createdBy: params.actor,
    });
    ownListId = String(list.id);
    createdOwnList = true;

    if (contractId) {
      const { data: inherited, error } = await supabase
        .from("vyron_customer_price_list_items")
        .select("product_id, base_price, markup_pct, discount_pct, gp_pct, override_price, final_price, effective_from, effective_to")
        .eq("company_id", companyId)
        .eq("price_list_id", contractId)
        .eq("status", "Active");
      if (error) throw new Error(error.message);
      if (inherited?.length) {
        const now = new Date().toISOString();
        const { error: copyError } = await supabase.from("vyron_customer_price_list_items").insert(
          inherited.map((item: Record<string, unknown>) => ({ ...item, company_id: companyId, price_list_id: ownListId, status: "Active", updated_at: now }))
        );
        if (copyError) throw new Error(copyError.message);
      }
    }

    // Keep the standard slot; a customer priced from the company default keeps it as their standard list.
    const hadNoList = !contractId && !standardId;
    await assignCustomerPriceLists(supabase, companyId, {
      customerId: params.customerId,
      contractPriceListId: ownListId,
      defaultPriceListId: standardId || (hadNoList ? companyDefault?.id || null : null),
      status: "Active",
      notes: active?.notes || undefined,
      actor: params.actor,
    });
  }

  const { data: existing, error: existingError } = await supabase
    .from("vyron_customer_price_list_items")
    .select("id, status")
    .eq("company_id", companyId)
    .eq("price_list_id", ownListId)
    .eq("product_id", params.productId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  let itemId: string;
  if (existing && existing.status === "Active") {
    await updateCustomerPriceListItemPrice(supabase, companyId, { priceListId: ownListId, itemId: String(existing.id), price, actor: params.actor });
    itemId = String(existing.id);
  } else {
    const added = await addCustomerPriceListItem(supabase, companyId, { priceListId: ownListId, productId: params.productId, price, actor: params.actor });
    itemId = added.itemId;
  }

  await writeCustomerPriceListAudit(supabase, {
    companyId,
    eventType: "Customer Price Changed",
    actor: params.actor,
    detail: `Customer-only price set for ${customer.customer_name || params.customerId}${createdOwnList ? " (own price list created)" : ""}`,
    priceListId: ownListId,
    priceListItemId: itemId,
    metadata: { customerId: params.customerId, productId: params.productId, price, createdOwnList, previousContractListId: contractId, standardListId: standardId },
  });

  return { priceListId: ownListId, itemId, createdOwnList, price };
}
