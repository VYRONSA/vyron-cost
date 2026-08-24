"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, LogOut, Minus, Plus, Search, ShoppingBag, Star, History, RefreshCw } from "lucide-react";
import { VyronLogoLockup, VyronLogoMark } from "@/components/vyron-ui/VyronLogo";
import type { CustomerCatalogue, CatalogueProduct } from "@/lib/vyron-order-catalogue";

/**
 * VYRON ORDER — the customer portal.
 *
 * Stage 1 covers sign-in, the customer home and the customer's own catalogue.
 * Cart, checkout, reorder and favourites are deliberately not wired yet; the
 * buttons for them are present but disabled so the shape of the finished
 * journey is visible without pretending the behaviour exists.
 *
 * Built as one client surface with internal views rather than separate routes,
 * because the whole point is speed on a phone: moving between the catalogue and
 * the home screen should never cost a page load.
 *
 * Nothing here decides a price. Every figure rendered comes from the server,
 * which resolves it from the customer's price list.
 */

type SessionCustomer = { customerId: string; customerName: string };
type View = "signin" | "home" | "catalogue";

const money = (value: number) =>
  `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The greeting is computed on the server and passed in, so the first paint is
 * identical on both sides and the component needs no clock of its own.
 */
export default function VyronOrderPortalClient({ greeting }: { greeting: string }) {
  const [view, setView] = useState<View>("signin");
  const [booting, setBooting] = useState(true);
  const [customer, setCustomer] = useState<SessionCustomer | null>(null);

  useEffect(() => {
    // Restore an existing session. State is only set once the request settles,
    // never synchronously inside the effect body.
    let cancelled = false;
    fetch("/api/vyron-order/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.authenticated && data.customer) {
          setCustomer(data.customer as SessionCustomer);
          setView("home");
        }
      })
      .catch(() => { /* stay signed out */ })
      .finally(() => { if (!cancelled) setBooting(false); });
    return () => { cancelled = true; };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/vyron-order/auth/logout", { method: "POST" });
    } finally {
      setCustomer(null);
      setView("signin");
    }
  }, []);

  if (booting) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-6">
        <p className="text-sm font-bold text-white/70">Loading VYRON ORDER…</p>
      </main>
    );
  }

  if (view === "signin" || !customer) {
    return <SignIn onSignedIn={(c) => { setCustomer(c); setView("home"); }} />;
  }

  return (
    <main className="min-h-dvh bg-slate-50">
      <PortalHeader customerName={customer.customerName} onSignOut={signOut} />
      {view === "home" ? (
        <Home greeting={greeting} customer={customer} onNewOrder={() => setView("catalogue")} />
      ) : (
        <Catalogue onBack={() => setView("home")} />
      )}
    </main>
  );
}

/* ------------------------------------------------------------------ header */

function PortalHeader({ customerName, onSignOut }: { customerName: string; onSignOut: () => void }) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
        {/*
          The full lockup carries a two-line tagline that collides with the
          customer name on a 390px screen, so the header uses the mark plus a
          compact wordmark instead. Same brand, no wrapping.
        */}
        <div className="flex min-w-0 items-center gap-2">
          <VyronLogoMark size={30} />
          <span className="text-sm font-black tracking-[0.08em] text-slate-950">
            VYRON<span className="text-[#2563eb]">ORDER</span>
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 max-w-[8.5rem] truncate text-xs font-black text-slate-700 sm:max-w-[16rem]">
            {customerName}
          </span>
          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign out"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ signin */

function SignIn({ onSignedIn }: { onSignedIn: (c: SessionCustomer) => void }) {
  const [customers, setCustomers] = useState<{ customerId: string; displayName: string }[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/vyron-order/customers", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setCustomers(d?.customers || []); })
      .catch(() => { if (!cancelled) setCustomers([]); });
    return () => { cancelled = true; };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/vyron-order/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, pin }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setError(data?.error || "Incorrect customer or PIN.");
        setPin("");
        return;
      }
      onSignedIn(data.customer as SessionCustomer);
    } catch {
      setError("We couldn't sign you in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-slate-950 px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <VyronLogoLockup variant="onDark" size={44} suffix="ORDER" />
        </div>
        <p className="mt-3 text-center text-[11px] font-black uppercase tracking-[0.22em] text-white/50">
          Customer Ordering
        </p>

        <form onSubmit={submit} className="mt-8 rounded-3xl bg-white p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <h1 className="text-lg font-black text-slate-950">Welcome back</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">Sign in to place your order.</p>

          <label className="mt-6 block">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Customer</span>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              required
              className="mt-1 h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-bold text-slate-900 outline-none focus:border-slate-900"
            >
              <option value="">Select your business…</option>
              {customers.map((c) => (
                <option key={c.customerId} value={c.customerId}>{c.displayName}</option>
              ))}
            </select>
          </label>

          <label className="mt-4 block">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">PIN</span>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••"
              required
              className="mt-1 h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-center text-2xl font-black tracking-[0.5em] text-slate-900 outline-none focus:border-slate-900"
            />
          </label>

          {error ? (
            <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={busy || !customerId || pin.length < 4}
            className="mt-6 h-14 w-full rounded-2xl bg-slate-950 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:bg-slate-800 disabled:opacity-40"
          >
            {busy ? "Signing in…" : "Unlock"}
          </button>

          {customers.length === 0 ? (
            <p className="mt-4 text-center text-xs font-semibold text-slate-500">
              No ordering accounts are set up yet. Please contact your supplier.
            </p>
          ) : null}
        </form>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------- home */

function Home({
  greeting: greetingText,
  customer,
  onNewOrder,
}: {
  greeting: string;
  customer: SessionCustomer;
  onNewOrder: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <h1 className="text-2xl font-black text-slate-950">
        {greetingText}, {customer.customerName}
      </h1>
      <p className="mt-1 text-sm font-semibold text-slate-500">What would you like to order?</p>

      <button
        type="button"
        onClick={onNewOrder}
        className="mt-6 flex min-h-[88px] w-full items-center justify-center gap-3 rounded-3xl bg-slate-950 px-6 text-base font-black uppercase tracking-[0.12em] text-white transition hover:bg-slate-800"
      >
        <ShoppingBag size={22} />
        New Order
      </button>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <DisabledTile icon={<RefreshCw size={18} />} label="Reorder" note="Coming in Stage 2" />
        <DisabledTile icon={<Star size={18} />} label="Favourites" note="Coming in Stage 2" />
      </div>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
          <History size={14} /> My Orders
        </h2>
        <p className="mt-3 text-sm font-bold text-slate-800">No orders yet</p>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Your orders will appear here once you have placed your first one.
        </p>
      </section>
    </div>
  );
}

function DisabledTile({ icon, label, note }: { icon: React.ReactNode; label: string; note: string }) {
  return (
    <button
      type="button"
      disabled
      className="flex min-h-[76px] cursor-not-allowed flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-slate-300 bg-white text-slate-400"
    >
      <span className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.1em]">{icon}{label}</span>
      <span className="text-[10px] font-bold uppercase tracking-[0.1em]">{note}</span>
    </button>
  );
}

/* --------------------------------------------------------------- catalogue */

function Catalogue({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<CustomerCatalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  /*
   * Quantity is always held in UNITS. Box entry multiplies by the verified pack
   * size on the way in, so the box view and the unit view can never disagree and
   * the value sent to the server is unambiguous.
   */
  const [qty, setQty] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<Record<string, "boxes" | "units">>({});
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/vyron-order/catalogue", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body?.ok) {
        setError(body?.error || "We couldn't load your products.");
        return;
      }
      setData(body.catalogue as CustomerCatalogue);
    } catch {
      setError("We couldn't load your products.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // One attempt on mount. A failure shows Try again rather than retrying forever.
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    void load();
  }, [load]);

  const categories = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    if (!term) return data.categories;
    return data.categories
      .map((c) => ({
        ...c,
        products: c.products.filter((p) =>
          `${p.productName} ${p.sku ?? ""} ${p.category}`.toLowerCase().includes(term)
        ),
      }))
      .filter((c) => c.products.length > 0);
  }, [data, search]);

  const totals = useMemo(() => {
    if (!data) return { lines: 0, units: 0, value: 0 };
    const index = new Map<string, CatalogueProduct>();
    data.categories.forEach((c) => c.products.forEach((p) => index.set(p.productId, p)));
    let lines = 0, units = 0, value = 0;
    for (const [productId, quantity] of Object.entries(qty)) {
      if (!quantity) continue;
      const product = index.get(productId);
      if (!product) continue;
      lines += 1;
      units += quantity;
      value += quantity * product.sellingPrice;
    }
    return { lines, units, value };
  }, [qty, data]);

  const setQuantity = (productId: string, nextUnits: number) =>
    setQty((prev) => ({ ...prev, [productId]: Math.max(0, Math.round(nextUnits)) }));

  if (loading) {
    return <div className="mx-auto max-w-3xl px-4 py-10 text-sm font-bold text-slate-500">Loading your products…</div>;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-base font-black text-slate-900">We couldn&apos;t load your products.</p>
        <p className="mt-1 text-sm font-semibold text-slate-500">{error}</p>
        <button type="button" onClick={() => void load()} className="mt-4 h-12 rounded-2xl bg-slate-950 px-6 text-sm font-black text-white">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-32 pt-5">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-[0.1em] text-slate-700">
          Back
        </button>
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
          {data?.productCount ?? 0} products
        </p>
      </div>

      <label className="mt-4 flex h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4">
        <Search size={18} className="shrink-0 text-slate-400" />
        <span className="sr-only">Search products</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
          className="h-full w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
        />
      </label>

      {categories.length === 0 ? (
        <p className="mt-8 text-sm font-bold text-slate-500">No products match that search.</p>
      ) : null}

      <div className="mt-4 space-y-3">
        {categories.map((category) => {
          const isOpen = open[category.category] ?? Boolean(search.trim());
          return (
            <section key={category.category} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setOpen((p) => ({ ...p, [category.category]: !isOpen }))}
                aria-expanded={isOpen}
                className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="flex items-center gap-2">
                  <span className="text-base font-black text-slate-950">{category.category}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600">
                    {category.products.length}
                  </span>
                </span>
                <ChevronDown size={18} className={`shrink-0 text-slate-400 transition ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen ? (
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {category.products.map((product) => (
                    <ProductRow
                      key={product.productId}
                      product={product}
                      units={qty[product.productId] || 0}
                      mode={mode[product.productId] || (product.unitsPerBox ? "boxes" : "units")}
                      onModeChange={(m) => setMode((prev) => ({ ...prev, [product.productId]: m }))}
                      onChange={(nextUnits) => setQuantity(product.productId, nextUnits)}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      {totals.lines > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/97 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                {totals.lines} item{totals.lines === 1 ? "" : "s"} · {totals.units} units
              </p>
              <p className="text-xl font-black text-slate-950">{money(totals.value)}</p>
            </div>
            <button
              type="button"
              disabled
              title="Checkout arrives in Stage 2"
              className="h-14 shrink-0 cursor-not-allowed rounded-2xl bg-slate-300 px-6 text-sm font-black uppercase tracking-[0.1em] text-white"
            >
              Review Order
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProductRow({
  product,
  units,
  mode,
  onModeChange,
  onChange,
}: {
  product: CatalogueProduct;
  units: number;
  mode: "boxes" | "units";
  onModeChange: (mode: "boxes" | "units") => void;
  onChange: (nextUnits: number) => void;
}) {
  const unavailable = product.priceUnavailable;
  const perBox = product.unitsPerBox;
  const boxMode = mode === "boxes" && Boolean(perBox);
  const step = boxMode && perBox ? perBox : 1;
  const shown = boxMode && perBox ? Math.round(units / perBox) : units;
  const lineTotal = units * product.sellingPrice;

  return (
    <div className="px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-black text-slate-950">{product.productName}</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">
            {product.sku ? `${product.sku} · ` : ""}
            {perBox ? `Box of ${perBox}` : "Sold per unit"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {unavailable ? (
            <span className="text-xs font-black text-amber-700">Price unavailable</span>
          ) : (
            <>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                {boxMode ? "Per box" : "Per unit"}
              </p>
              <p className="text-lg font-black text-slate-950">
                {money(boxMode && product.pricePerBox !== null ? product.pricePerBox : product.sellingPrice)}
              </p>
              {perBox ? (
                <p className="text-[10px] font-bold text-slate-400">
                  {boxMode ? `${money(product.sellingPrice)} / unit` : `${money(product.pricePerBox ?? 0)} / box`}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      {unavailable ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
          Pricing is currently unavailable for this product. Please contact us to order it.
        </p>
      ) : (
        <>
          {perBox ? (
            <div
              role="group"
              aria-label={`${product.productName} ordering unit`}
              className="mt-3 inline-flex overflow-hidden rounded-xl border border-slate-200"
            >
              {(["boxes", "units"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={mode === option}
                  onClick={() => onModeChange(option)}
                  className={`h-11 min-w-[84px] px-4 text-xs font-black uppercase tracking-[0.1em] transition ${
                    mode === option ? "bg-slate-950 text-white" : "bg-white text-slate-600"
                  }`}
                >
                  {option === "boxes" ? "Boxes" : "Units"}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={`Decrease ${product.productName}`}
                onClick={() => onChange(units - step)}
                disabled={units <= 0}
                className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 disabled:opacity-40"
              >
                <Minus size={18} />
              </button>
              <input
                value={shown}
                onChange={(e) => {
                  const entered = Number(e.target.value.replace(/\D/g, "")) || 0;
                  onChange(boxMode && perBox ? entered * perBox : entered);
                }}
                inputMode="numeric"
                aria-label={`${product.productName} quantity in ${boxMode ? "boxes" : "units"}`}
                className="h-12 w-16 rounded-xl border border-slate-200 bg-white text-center text-base font-black text-slate-950 outline-none focus:border-slate-900"
              />
              <button
                type="button"
                aria-label={`Increase ${product.productName}`}
                onClick={() => onChange(units + step)}
                className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"
              >
                <Plus size={18} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {[2, 5, 10].map((bump) => (
                <button
                  key={bump}
                  type="button"
                  onClick={() => onChange(units + bump * step)}
                  className="h-11 min-w-[52px] rounded-xl bg-slate-100 px-3 text-sm font-black text-slate-700 transition hover:bg-slate-200"
                >
                  +{bump}
                </button>
              ))}
            </div>

            {units > 0 ? (
              <span className="ml-auto text-base font-black tabular-nums text-slate-950">{money(lineTotal)}</span>
            ) : null}
          </div>

          {units > 0 && boxMode && perBox ? (
            <p className="mt-2 text-xs font-bold text-slate-500">
              {shown} box{shown === 1 ? "" : "es"} × {perBox} = <span className="text-slate-900">{units} units</span>
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
