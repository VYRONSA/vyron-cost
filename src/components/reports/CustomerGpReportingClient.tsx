"use client";

import { useEffect, useMemo, useState } from "react";
import ReportExportActions from "@/components/reports/ReportExportActions";

type Report = {
  metrics: {
    revenue: number;
    costOfSales: number;
    grossProfit: number;
    gpPct: number;
    marginPct: number;
    markupPct: number;
    qtySold: number;
    avgSellingPrice: number;
    avgCostPrice: number;
  };
  byCustomer: Array<{
    customerId: string | null;
    customerName: string;
    customerGroup: string;
    revenue: number;
    cost: number;
    gp: number;
    gpPct: number;
    marginPct: number;
    markupPct: number;
    qtySold: number;
    avgSellingPrice: number;
    avgCostPrice: number;
    products: Array<{
      productId: string | null;
      productName: string;
      category: string;
      qty: number;
      revenue: number;
      cost: number;
      gp: number;
      gpPct: number;
      marginPct: number;
      markupPct: number;
    }>;
    invoices: Array<{
      invoiceId: string;
      invoiceNumber: string;
      invoiceDate: string;
      revenue: number;
      cost: number;
      gp: number;
      gpPct: number;
      marginPct: number;
      markupPct: number;
      qtySold: number;
      salesperson: string;
      warehouse: string;
    }>;
  }>;
  byProduct: Array<{
    productId: string | null;
    productName: string;
    category: string;
    qty: number;
    revenue: number;
    cost: number;
    gp: number;
    gpPct: number;
    marginPct: number;
    markupPct: number;
  }>;
  byInvoice: Array<{
    invoiceId: string;
    invoiceNumber: string;
    invoiceDate: string;
    customerName: string;
    customerGroup: string;
    salesperson: string;
    warehouse: string;
    revenue: number;
    cost: number;
    gp: number;
    gpPct: number;
    marginPct: number;
    markupPct: number;
    qtySold: number;
  }>;
  byMonth: Array<{ month: string; revenue: number; cost: number; gp: number; gpPct: number }>;
  byYear: Array<{ year: string; revenue: number; cost: number; gp: number; gpPct: number }>;
  topPerformingProducts: Array<{ productName: string; gp: number }>;
  lowestMarginProducts: Array<{ productName: string; marginPct: number; gp: number }>;
  lossMakingProducts: Array<{ productName: string; gp: number; revenue: number; cost: number }>;
  charts: {
    gpTrend: Array<{ period: string; gpPct: number }>;
    monthlyGp: Array<{ month: string; gp: number }>;
    revenueVsCost: Array<{ month: string; revenue: number; cost: number }>;
    top10CustomersByGp: Array<{ customer: string; gp: number }>;
    top10ProductsByGp: Array<{ product: string; gp: number }>;
  };
};

type Customer = { id: string; customer_name: string; category?: string | null };
type Product = { id: string; product_name: string; category?: string | null };
type PriceList = { id: string; list_name: string };

function money(n: number) {
  return `R${Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(n: number) {
  return `${Number(n || 0).toFixed(2)}%`;
}

function qty(n: number) {
  return Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CustomerGpReportingClient() {
  const [report, setReport] = useState<Report | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [customerId, setCustomerId] = useState("");
  const [customerGroup, setCustomerGroup] = useState("");
  const [salesperson, setSalesperson] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [productId, setProductId] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [priceListId, setPriceListId] = useState("");
  const [search, setSearch] = useState("");

  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const selected = useMemo(
    () => report?.byCustomer.find((row) => row.customerId === selectedCustomer || row.customerName === selectedCustomer) || null,
    [report, selectedCustomer]
  );

  const salespersonOptions = useMemo(
    () => [...new Set((report?.byInvoice || []).map((row) => row.salesperson).filter((v) => v && v !== "Unassigned"))],
    [report]
  );
  const warehouseOptions = useMemo(
    () => [...new Set((report?.byInvoice || []).map((row) => row.warehouse).filter((v) => v && v !== "Unassigned"))],
    [report]
  );
  const customerGroupOptions = useMemo(
    () => [...new Set(customers.map((row) => String(row.category || "Uncategorised")))],
    [customers]
  );
  const productCategoryOptions = useMemo(
    () => [...new Set(products.map((row) => String(row.category || "Uncategorised")))],
    [products]
  );

  async function loadLookups() {
    const [customerRes, productRes, listRes] = await Promise.all([
      fetch("/api/customers"),
      fetch("/api/products"),
      fetch("/api/customer-price-lists"),
    ]);

    const [customerData, productData, listData] = await Promise.all([
      customerRes.json(),
      productRes.json(),
      listRes.json(),
    ]);

    if (customerData.ok) setCustomers(Array.isArray(customerData.customers) ? customerData.customers : []);
    if (productData.ok) setProducts(Array.isArray(productData.products) ? productData.products : []);
    if (listData.ok) {
      const lists = Array.isArray(listData.lists) ? listData.lists : [];
      setPriceLists(lists.map((row: { id: string; list_name: string }) => ({ id: row.id, list_name: row.list_name })));
    }
  }

  async function loadReport() {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (customerId) params.set("customerId", customerId);
      if (customerGroup) params.set("customerGroup", customerGroup);
      if (salesperson) params.set("salesperson", salesperson);
      if (warehouse) params.set("warehouse", warehouse);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (productId) params.set("productId", productId);
      if (productCategory) params.set("productCategory", productCategory);
      if (priceListId) params.set("priceListId", priceListId);
      if (search) params.set("search", search);

      const response = await fetch(`/api/reports/customer-gp?${params.toString()}`);
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "Failed to load report.");

      const next: Report = data.report;
      setReport(next);

      if (!selectedCustomer && next.byCustomer.length) {
        setSelectedCustomer(next.byCustomer[0].customerId || next.byCustomer[0].customerName);
      }
    } catch (e) {
      setReport(null);
      setError(e instanceof Error ? e.message : "Failed to load report.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadLookups();
    void loadReport();
  }, []);

  function applyFilters() {
    void loadReport();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">Customer GP% Reporting</h2>
          <div className="flex flex-wrap gap-2">
            <ReportExportActions reportKey="customer-gp" />
          </div>
        </div>
        <p className="mt-1 text-sm text-slate-600">Posted customer invoices only. Drill down Customer → Invoice → Product.</p>

        <div className="mt-4 grid gap-2 md:grid-cols-5">
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-xs">
            <option value="">Customer</option>
            {customers.map((row) => (
              <option key={row.id} value={row.id}>{row.customer_name}</option>
            ))}
          </select>
          <select value={customerGroup} onChange={(e) => setCustomerGroup(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-xs">
            <option value="">Customer Group</option>
            {customerGroupOptions.map((row) => (
              <option key={row} value={row}>{row}</option>
            ))}
          </select>
          <select value={salesperson} onChange={(e) => setSalesperson(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-xs">
            <option value="">Salesperson</option>
            {salespersonOptions.map((row) => (
              <option key={row} value={row}>{row}</option>
            ))}
          </select>
          <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-xs">
            <option value="">Branch/Warehouse</option>
            {warehouseOptions.map((row) => (
              <option key={row} value={row}>{row}</option>
            ))}
          </select>
          <select value={priceListId} onChange={(e) => setPriceListId(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-xs">
            <option value="">Price List</option>
            {priceLists.map((row) => (
              <option key={row.id} value={row.id}>{row.list_name}</option>
            ))}
          </select>

          <input value={from} onChange={(e) => setFrom(e.target.value)} type="date" className="rounded-lg border border-slate-300 px-2 py-2 text-xs" />
          <input value={to} onChange={(e) => setTo(e.target.value)} type="date" className="rounded-lg border border-slate-300 px-2 py-2 text-xs" />
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-xs">
            <option value="">Product</option>
            {products.map((row) => (
              <option key={row.id} value={row.id}>{row.product_name}</option>
            ))}
          </select>
          <select value={productCategory} onChange={(e) => setProductCategory(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-xs">
            <option value="">Product Category</option>
            {productCategoryOptions.map((row) => (
              <option key={row} value={row}>{row}</option>
            ))}
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="rounded-lg border border-slate-300 px-2 py-2 text-xs" />
        </div>

        <button type="button" onClick={applyFilters} className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">Apply Filters</button>
      </section>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</div> : null}

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Metric title="Revenue" value={money(report?.metrics.revenue || 0)} />
        <Metric title="Cost of Sales" value={money(report?.metrics.costOfSales || 0)} />
        <Metric title="Gross Profit" value={money(report?.metrics.grossProfit || 0)} />
        <Metric title="GP %" value={pct(report?.metrics.gpPct || 0)} />
        <Metric title="Margin %" value={pct(report?.metrics.marginPct || 0)} />
        <Metric title="Mark-up %" value={pct(report?.metrics.markupPct || 0)} />
        <Metric title="Quantity Sold" value={qty(report?.metrics.qtySold || 0)} />
        <Metric title="Avg Selling Price" value={money(report?.metrics.avgSellingPrice || 0)} />
        <Metric title="Avg Cost Price" value={money(report?.metrics.avgCostPrice || 0)} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="GP Trend">
          <MiniBars data={(report?.charts.gpTrend || []).map((row) => ({ label: row.period, value: row.gpPct }))} suffix="%" />
        </ChartCard>
        <ChartCard title="Monthly GP">
          <MiniBars data={(report?.charts.monthlyGp || []).map((row) => ({ label: row.month, value: row.gp }))} moneyMode />
        </ChartCard>
        <ChartCard title="Revenue vs Cost">
          <DualBars data={report?.charts.revenueVsCost || []} />
        </ChartCard>
        <ChartCard title="Top 10 Customers by GP">
          <MiniBars data={(report?.charts.top10CustomersByGp || []).map((row) => ({ label: row.customer, value: row.gp }))} moneyMode />
        </ChartCard>
        <ChartCard title="Top 10 Products by GP">
          <MiniBars data={(report?.charts.top10ProductsByGp || []).map((row) => ({ label: row.product, value: row.gp }))} moneyMode />
        </ChartCard>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-bold text-slate-900">Customer Breakdown</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-left uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2">Customer</th>
                <th className="px-2 py-2">Group</th>
                <th className="px-2 py-2">Revenue</th>
                <th className="px-2 py-2">Cost</th>
                <th className="px-2 py-2">GP</th>
                <th className="px-2 py-2">GP %</th>
                <th className="px-2 py-2">Qty</th>
              </tr>
            </thead>
            <tbody>
              {(report?.byCustomer || []).map((row) => (
                <tr key={row.customerId || row.customerName} className={`cursor-pointer border-t border-slate-100 ${selectedCustomer === (row.customerId || row.customerName) ? "bg-slate-50" : ""}`} onClick={() => setSelectedCustomer(row.customerId || row.customerName)}>
                  <td className="px-2 py-2 font-semibold">{row.customerName}</td>
                  <td className="px-2 py-2">{row.customerGroup}</td>
                  <td className="px-2 py-2">{money(row.revenue)}</td>
                  <td className="px-2 py-2">{money(row.cost)}</td>
                  <td className="px-2 py-2">{money(row.gp)}</td>
                  <td className="px-2 py-2">{pct(row.gpPct)}</td>
                  <td className="px-2 py-2">{qty(row.qtySold)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">Drill-down: Invoices</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-left uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-2">Invoice</th>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Salesperson</th>
                  <th className="px-2 py-2">Warehouse</th>
                  <th className="px-2 py-2">Revenue</th>
                  <th className="px-2 py-2">GP %</th>
                </tr>
              </thead>
              <tbody>
                {(selected?.invoices || []).map((row) => (
                  <tr key={row.invoiceId} className="border-t border-slate-100">
                    <td className="px-2 py-2 font-semibold">{row.invoiceNumber}</td>
                    <td className="px-2 py-2">{row.invoiceDate}</td>
                    <td className="px-2 py-2">{row.salesperson}</td>
                    <td className="px-2 py-2">{row.warehouse}</td>
                    <td className="px-2 py-2">{money(row.revenue)}</td>
                    <td className="px-2 py-2">{pct(row.gpPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">Drill-down: Products</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-left uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-2">Product</th>
                  <th className="px-2 py-2">Category</th>
                  <th className="px-2 py-2">Qty</th>
                  <th className="px-2 py-2">Revenue</th>
                  <th className="px-2 py-2">GP</th>
                  <th className="px-2 py-2">Margin %</th>
                </tr>
              </thead>
              <tbody>
                {(selected?.products || []).map((row) => (
                  <tr key={`${row.productId || "none"}-${row.productName}`} className="border-t border-slate-100">
                    <td className="px-2 py-2 font-semibold">{row.productName}</td>
                    <td className="px-2 py-2">{row.category}</td>
                    <td className="px-2 py-2">{qty(row.qty)}</td>
                    <td className="px-2 py-2">{money(row.revenue)}</td>
                    <td className="px-2 py-2">{money(row.gp)}</td>
                    <td className="px-2 py-2">{pct(row.marginPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <ListCard title="Top Performing Products" rows={(report?.topPerformingProducts || []).map((row) => `${row.productName} · ${money(row.gp)}`)} />
        <ListCard title="Lowest Margin Products" rows={(report?.lowestMarginProducts || []).map((row) => `${row.productName} · ${pct(row.marginPct)} · ${money(row.gp)}`)} />
        <ListCard title="Loss-making Products" rows={(report?.lossMakingProducts || []).map((row) => `${row.productName} · ${money(row.gp)}`)} />
      </section>

      {busy ? <div className="text-xs font-semibold text-slate-500">Loading report...</div> : null}
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
      <div className="text-[11px] font-semibold uppercase text-slate-500">{title}</div>
      <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function MiniBars({ data, suffix, moneyMode }: { data: Array<{ label: string; value: number }>; suffix?: string; moneyMode?: boolean }) {
  const max = Math.max(1, ...data.map((row) => Math.abs(row.value)));
  return (
    <div className="space-y-2">
      {data.slice(0, 12).map((row) => (
        <div key={row.label}>
          <div className="mb-1 flex items-center justify-between text-xs text-slate-600"><span>{row.label}</span><span>{moneyMode ? money(row.value) : `${row.value.toFixed(2)}${suffix || ""}`}</span></div>
          <div className="h-2 rounded bg-slate-100">
            <div className={`h-2 rounded ${row.value >= 0 ? "bg-emerald-500" : "bg-rose-500"}`} style={{ width: `${Math.min(100, (Math.abs(row.value) / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DualBars({ data }: { data: Array<{ month: string; revenue: number; cost: number }> }) {
  const max = Math.max(1, ...data.flatMap((row) => [row.revenue, row.cost]));
  return (
    <div className="space-y-2">
      {data.slice(0, 12).map((row) => (
        <div key={row.month} className="rounded-lg border border-slate-100 p-2">
          <div className="mb-1 text-xs font-semibold text-slate-700">{row.month}</div>
          <div className="text-[11px] text-slate-500">Revenue {money(row.revenue)} · Cost {money(row.cost)}</div>
          <div className="mt-1 grid gap-1">
            <div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-indigo-500" style={{ width: `${Math.min(100, (row.revenue / max) * 100)}%` }} /></div>
            <div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-amber-500" style={{ width: `${Math.min(100, (row.cost / max) * 100)}%` }} /></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ListCard({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      <div className="mt-2 space-y-1 text-xs text-slate-700">
        {rows.length ? rows.slice(0, 10).map((row) => <div key={row} className="rounded border border-slate-100 px-2 py-1">{row}</div>) : <div className="text-slate-500">No data</div>}
      </div>
    </div>
  );
}
