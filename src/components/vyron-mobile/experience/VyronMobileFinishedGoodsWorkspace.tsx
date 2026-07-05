"use client";

import { useEffect, useMemo, useState } from "react";
import { Boxes, PackagePlus, PackageSearch, Sparkles } from "lucide-react";
import Link from "next/link";
import {
  PremiumMobileCard,
  PremiumMobileCardSkeleton,
  PremiumMobileEmptyState,
  PremiumMobileModuleTile,
  PremiumMobileRecordCard,
  PremiumMobileSearch,
} from "@/components/vyron-mobile/design-system";

type Product = {
  id: string;
  product_name: string;
  category?: string;
  product_category?: string;
  status?: string;
  product_status?: string;
  selling_price?: number;
  total_cost?: number;
  created_at?: string;
  updated_at?: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(value || 0);
}

function gpPercent(price: number, cost: number) {
  if (!price) return 0;
  return Math.round(((price - cost) / price) * 100);
}

function tone(status: string): "draft" | "pending" | "approved" | "completed" | "archived" | "cancelled" | "received" {
  const value = status.toLowerCase();
  if (value.includes("archive")) return "archived";
  if (value.includes("cancel")) return "cancelled";
  if (value.includes("active") || value.includes("approved")) return "approved";
  if (value.includes("review") || value.includes("pending")) return "pending";
  return "draft";
}

export default function VyronMobileFinishedGoodsWorkspace() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("/api/products", { credentials: "include" });
        const json = await response.json().catch(() => ({ ok: false }));
        if (!active) return;
        setProducts(Array.isArray(json.products) ? json.products : []);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(() => {
    const values = products
      .map((product) => String(product.product_category || product.category || "Uncategorized"))
      .filter(Boolean);
    return ["All", ...Array.from(new Set(values)).slice(0, 8)];
  }, [products]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      const productCategory = String(product.product_category || product.category || "Uncategorized");
      const inCategory = category === "All" || productCategory === category;
      const inSearch = !term || [product.product_name, productCategory, product.status, product.product_status].join(" ").toLowerCase().includes(term);
      return inCategory && inSearch;
    });
  }, [category, products, search]);

  const topSelling = useMemo(
    () => [...filtered].sort((a, b) => Number(b.selling_price || 0) - Number(a.selling_price || 0)).slice(0, 5),
    [filtered]
  );

  const recentlyUpdated = useMemo(
    () => [...filtered].sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || ""))).slice(0, 6),
    [filtered]
  );

  return (
    <section className="space-y-5 px-4 pb-8 pt-1 sm:px-5">
      <PremiumMobileCard tone="default" className="p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Finished Goods</div>
        <div className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">Product Command Surface</div>
        <div className="mt-1 text-sm font-semibold text-slate-600">Find, review and launch product maintenance with a premium mobile workflow.</div>
      </PremiumMobileCard>

      <PremiumMobileSearch
        placeholder="Search finished goods"
        value={search}
        onChange={setSearch}
        recent={["Top margin products", "Recently updated", "Archived"]}
        onRecentSelect={setSearch}
      />

      <section>
        <div className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Categories</div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={`rounded-full border px-3 py-2 text-xs font-black uppercase tracking-[0.12em] ${item === category ? "border-[#D8B24A] bg-[#FFF7E4] text-[#A87A17]" : "border-slate-200 bg-white text-slate-500"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Quick Actions</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <PremiumMobileModuleTile href="/products" title="Recent Items" description="Open recently viewed finished goods" icon={PackageSearch} eyebrow="Browse" />
          <PremiumMobileModuleTile href="/products" title="Top Selling" description="Focus on high-value products" icon={Sparkles} eyebrow="Explore" />
          <PremiumMobileModuleTile href="/products" title="Recently Updated" description="Review latest product changes" icon={Boxes} eyebrow="Review" />
          <PremiumMobileModuleTile href="/products" title="Create Finished Good" description="Launch product creation workflow" icon={PackagePlus} eyebrow="Create" />
        </div>
      </section>

      <section>
        <div className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Top Selling Items</div>
        {loading ? (
          <div className="space-y-3">
            <PremiumMobileCardSkeleton />
            <PremiumMobileCardSkeleton />
          </div>
        ) : topSelling.length ? (
          <div className="space-y-3">
            {topSelling.map((product) => {
              const price = Number(product.selling_price || 0);
              const cost = Number(product.total_cost || 0);
              return (
                <PremiumMobileRecordCard
                  key={`top-${product.id}`}
                  title={product.product_name}
                  subtitle={String(product.product_category || product.category || "Uncategorized")}
                  icon={PackageSearch}
                  status={String(product.product_status || product.status || "Draft")}
                  statusTone={tone(String(product.product_status || product.status || "Draft"))}
                  meta={[
                    { label: "Price", value: formatCurrency(price) },
                    { label: "Cost", value: formatCurrency(cost) },
                    { label: "GP", value: `${gpPercent(price, cost)}%` },
                    { label: "Updated", value: product.updated_at ? new Date(product.updated_at).toLocaleDateString("en-ZA") : "-" },
                  ]}
                  actions={[
                    { id: `${product.id}-open`, label: "Open", href: `/products/${product.id}`, variant: "primary" },
                    { id: `${product.id}-edit`, label: "Edit", href: `/products/${product.id}/edit`, variant: "secondary" },
                  ]}
                />
              );
            })}
          </div>
        ) : (
          <PremiumMobileEmptyState
            title="No finished goods yet"
            description="Create your first finished good to start tracking margin and pricing performance."
            icon={PackageSearch}
            primaryAction={{ label: "Create Finished Good", href: "/products" }}
            secondaryAction={{ label: "Open Products", href: "/products" }}
          />
        )}
      </section>

      {!loading && recentlyUpdated.length ? (
        <section>
          <div className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Recently Updated</div>
          <div className="space-y-2">
            {recentlyUpdated.map((product) => (
              <PremiumMobileCard key={`recent-${product.id}`} tone="muted" className="p-3">
                <Link href={`/products/${product.id}`} className="block">
                  <div className="text-sm font-black text-slate-900">{product.product_name}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    {String(product.product_category || product.category || "Uncategorized")} • {product.updated_at ? new Date(product.updated_at).toLocaleDateString("en-ZA") : "-"}
                  </div>
                </Link>
              </PremiumMobileCard>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
