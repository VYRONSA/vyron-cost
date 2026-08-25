"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown, ChevronRight, LogOut, Minus, Plus, Search, ShoppingBag, Star,
  History, RefreshCw, CalendarDays, CheckCircle2, AlertTriangle, Trash2, ArrowLeft, Check,
} from "lucide-react";
import { VyronLogoMark } from "@/components/vyron-ui/VyronLogo";
import type { CustomerCatalogue, CatalogueProduct } from "@/lib/vyron-order-catalogue";
import type { CartView, PriceChange } from "@/lib/vyron-order-cart";
import type { CustomerOrderSummary, CustomerOrderDetail, UsualProduct } from "@/lib/vyron-order-history";

/**
 * VYRON ORDER — the customer portal.
 *
 * The whole journey lives here as one client surface with internal views rather
 * than separate routes, because the point is speed on a phone: moving from the
 * catalogue to the cart and back should never cost a page load.
 *
 * Nothing in this file decides a price, a total or a stock position. Quantities
 * are sent to the server and the server sends back the cart it computed; every
 * figure rendered on the review screen and every figure submitted comes from
 * that response. The optimistic numbers on the catalogue's sticky bar are the
 * one exception, and they are drawn from prices the server issued moments
 * earlier — they are an indication while typing, never the basis of an order.
 */

type SessionCustomer = { customerId: string; customerName: string };
type View = "signin" | "home" | "catalogue" | "review" | "confirmation" | "history" | "order";

type Confirmation = {
  orderNumber: string;
  total: number;
  requestedDeliveryDate: string | null;
  duplicate: boolean;
};

const money = (value: number) =>
  `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Dates arrive as plain yyyy-mm-dd strings and are formatted without a timezone hop. */
function formatDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-ZA", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  });
}

function newIdempotencyKey() {
  try {
    return crypto.randomUUID();
  } catch {
    return `k-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  }
}

/* =============================================================== cart state */

/**
 * The cart lives on the server. This hook keeps a local copy for rendering and
 * writes every change through to the API.
 *
 * Tapping + on a phone has to feel instant, so a quantity change is shown
 * immediately and the write is debounced — holding + for ten taps sends one
 * request, not ten. Until the write lands the local figure wins; afterwards the
 * server's cart replaces it wholesale, so the two can never drift.
 */
function useServerCart() {
  const [cart, setCart] = useState<CartView | null>(null);
  const [pending, setPending] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const active = timers.current;
    return () => { Object.values(active).forEach((t) => clearTimeout(t)); };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/vyron-order/cart", { cache: "no-store" });
      const body = await res.json();
      if (body?.ok) setCart(body.cart as CartView);
    } catch { /* the existing view stays on screen */ }
  }, []);

  const flush = useCallback(async (productId: string, quantityUnits: number, entryMode: "units" | "boxes") => {
    setSaving((n) => n + 1);
    try {
      const res = await fetch("/api/vyron-order/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantityUnits, entryMode }),
      });
      const body = await res.json();
      if (res.ok && body?.ok) {
        setCart(body.cart as CartView);
        setError(null);
      } else {
        setError(body?.error || "We couldn't save that change.");
      }
    } catch {
      setError("We couldn't save that change.");
    } finally {
      setSaving((n) => n - 1);
      setPending((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
    }
  }, []);

  const setLine = useCallback((productId: string, units: number, entryMode: "units" | "boxes") => {
    const quantity = Math.max(0, Math.round(units));
    setPending((prev) => ({ ...prev, [productId]: quantity }));
    if (timers.current[productId]) clearTimeout(timers.current[productId]);
    timers.current[productId] = setTimeout(() => { void flush(productId, quantity, entryMode); }, 350);
  }, [flush]);

  const setDelivery = useCallback(async (input: { requestedDeliveryDate?: string | null; notes?: string | null }) => {
    const res = await fetch("/api/vyron-order/cart", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = await res.json();
    if (res.ok && body?.ok) {
      setCart(body.cart as CartView);
      return { ok: true as const };
    }
    return { ok: false as const, error: String(body?.error || "We couldn't save that.") };
  }, []);

  const clear = useCallback(async () => {
    const res = await fetch("/api/vyron-order/cart", { method: "DELETE" });
    const body = await res.json();
    if (body?.ok) setCart(body.cart as CartView);
    setPending({});
  }, []);

  /** The quantity to render: an unsaved local change outranks the saved cart. */
  const quantityOf = useCallback((productId: string) => {
    if (productId in pending) return pending[productId];
    return cart?.lines.find((l) => l.productId === productId)?.quantityUnits || 0;
  }, [pending, cart]);

  return { cart, setCart, refresh, setLine, setDelivery, clear, quantityOf, pending, saving, error };
}

/* ================================================================== portal */

/**
 * The greeting is computed on the server and passed in, so the first paint is
 * identical on both sides and the component needs no clock of its own.
 */
export default function VyronOrderPortalClient({
  greeting,
  tenantSlug,
  tenantName,
}: {
  greeting: string;
  /** The supplier's ordering link this portal was opened through. */
  tenantSlug: string;
  tenantName: string;
}) {
  const [view, setView] = useState<View>("signin");
  const [booting, setBooting] = useState(true);
  const [customer, setCustomer] = useState<SessionCustomer | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [favourites, setFavourites] = useState<string[]>([]);
  const [catalogueFilter, setCatalogueFilter] = useState<"all" | "favourites">("all");
  const [reorderNotice, setReorderNotice] = useState<{ skipped: { description: string; reason: string }[]; priceChanges: PriceChange[] } | null>(null);
  const cart = useServerCart();

  const { refresh: refreshCart } = cart;

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

  const loadFavourites = useCallback(async () => {
    try {
      const res = await fetch("/api/vyron-order/favourites", { cache: "no-store" });
      const body = await res.json();
      if (body?.ok) setFavourites(body.favourites as string[]);
    } catch { /* favourites are a convenience, never a blocker */ }
  }, []);

  useEffect(() => {
    // Pull the customer's saved cart and favourites once signed in. Both settle
    // asynchronously; nothing is set synchronously inside the effect body.
    if (!customer) return;
    let cancelled = false;
    void refreshCart();
    fetch("/api/vyron-order/favourites", { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => { if (!cancelled && body?.ok) setFavourites(body.favourites as string[]); })
      .catch(() => { /* favourites are a convenience, never a blocker */ });
    return () => { cancelled = true; };
  }, [customer, refreshCart]);

  const toggleFavourite = useCallback(async (productId: string) => {
    // Shown immediately, reconciled against the server's answer.
    setFavourites((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]));
    try {
      const res = await fetch("/api/vyron-order/favourites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) void loadFavourites();
    } catch {
      void loadFavourites();
    }
  }, [loadFavourites]);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/vyron-order/auth/logout", { method: "POST" });
    } finally {
      setCustomer(null);
      setFavourites([]);
      cart.setCart(null);
      setView("signin");
    }
  }, [cart]);

  const openCatalogue = useCallback((filter: "all" | "favourites") => {
    setCatalogueFilter(filter);
    setReorderNotice(null);
    setView("catalogue");
  }, []);

  const reorder = useCallback(async (orderId: string) => {
    const res = await fetch(`/api/vyron-order/orders/${orderId}/reorder`, { method: "POST" });
    const body = await res.json();
    if (!res.ok || !body?.ok) return { ok: false as const, error: String(body?.error || "We couldn't rebuild that order.") };
    cart.setCart(body.cart as CartView);
    setReorderNotice({ skipped: body.skipped || [], priceChanges: body.priceChanges || [] });
    setView("review");
    return { ok: true as const };
  }, [cart]);

  if (booting) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-6">
        <p className="text-sm font-bold text-white/70">Loading VYRON ORDER…</p>
      </main>
    );
  }

  if (view === "signin" || !customer) {
    return (
      <SignIn
        tenantSlug={tenantSlug}
        tenantName={tenantName}
        onSignedIn={(c) => { setCustomer(c); setView("home"); }}
      />
    );
  }

  return (
    <main className="min-h-dvh bg-slate-50">
      <PortalHeader customerName={customer.customerName} onSignOut={signOut} />

      {view === "home" ? (
        <Home
          greeting={greeting}
          customer={customer}
          cart={cart.cart}
          favouriteCount={favourites.length}
          onNewOrder={() => openCatalogue("all")}
          onFavourites={() => openCatalogue("favourites")}
          onHistory={() => setView("history")}
          onResumeCart={() => setView("review")}
          onOpenOrder={(id) => { setActiveOrderId(id); setView("order"); }}
          onQuickAdd={(productId, units) => cart.setLine(productId, units, "units")}
        />
      ) : null}

      {view === "catalogue" ? (
        <Catalogue
          cart={cart}
          favourites={favourites}
          filter={catalogueFilter}
          onFilterChange={setCatalogueFilter}
          onToggleFavourite={toggleFavourite}
          onBack={() => setView("home")}
          onReview={() => setView("review")}
        />
      ) : null}

      {view === "review" ? (
        <Review
          cart={cart}
          notice={reorderNotice}
          onDismissNotice={() => setReorderNotice(null)}
          onBack={() => setView("catalogue")}
          onAddMore={() => openCatalogue("all")}
          onSubmitted={(result) => { setConfirmation(result); setReorderNotice(null); setView("confirmation"); }}
        />
      ) : null}

      {view === "confirmation" && confirmation ? (
        <ConfirmationScreen
          confirmation={confirmation}
          onHome={() => { setConfirmation(null); setView("home"); }}
          onHistory={() => { setConfirmation(null); setView("history"); }}
        />
      ) : null}

      {view === "history" ? (
        <OrderHistory
          onBack={() => setView("home")}
          onOpen={(id) => { setActiveOrderId(id); setView("order"); }}
        />
      ) : null}

      {view === "order" && activeOrderId ? (
        <OrderDetailScreen orderId={activeOrderId} onBack={() => setView("history")} onReorder={reorder} />
      ) : null}
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

function BackBar({ label, onBack, right }: { label: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white pl-3 pr-4 text-xs font-black uppercase tracking-[0.1em] text-slate-700"
      >
        <ArrowLeft size={15} /> {label}
      </button>
      {right}
    </div>
  );
}

/* ------------------------------------------------------------------ signin */

function SignIn({
  tenantSlug,
  tenantName,
  onSignedIn,
}: {
  tenantSlug: string;
  tenantName: string;
  onSignedIn: (c: SessionCustomer) => void;
}) {
  const [customers, setCustomers] = useState<{ customerId: string; displayName: string }[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/vyron-order/customers?tenant=${encodeURIComponent(tenantSlug)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body?.ok) setCustomers(body.customers);
        else setError("This ordering link is not working. Please ask your supplier to resend it.");
      })
      .catch(() => { /* the field stays empty and the error shows on submit */ })
      .finally(() => { if (!cancelled) setLoadingAccounts(false); });
    return () => { cancelled = true; };
  }, [tenantSlug]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/vyron-order/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The link is sent so the server can require this account to belong to
        // this supplier. It never widens what the account can reach.
        body: JSON.stringify({ customerId, pin, tenant: tenantSlug }),
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) {
        setError(body?.error || "We couldn't sign you in.");
        setPin("");
        return;
      }
      onSignedIn(body.customer as SessionCustomer);
    } catch {
      setError("We couldn't sign you in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-slate-950 px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <VyronLogoMark size={56} />
          <h1 className="mt-4 text-2xl font-black tracking-[0.08em] text-white">
            VYRON<span className="text-[#60a5fa]">ORDER</span>
          </h1>
          <p className="mt-1 text-sm font-semibold text-white/60">Place your order in under a minute.</p>
          <p className="mt-3 rounded-full bg-white/10 px-4 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-white/80">
            {tenantName}
          </p>
        </div>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-white/60">Account</span>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              required
              className="mt-1.5 h-14 w-full rounded-2xl border border-white/15 bg-white/5 px-4 text-base font-bold text-white outline-none focus:border-white/40"
            >
              <option value="" disabled>
                {loadingAccounts
                  ? "Loading accounts…"
                  : customers.length === 0
                    ? "No accounts set up yet"
                    : "Select your account…"}
              </option>
              {customers.map((c) => (
                <option key={c.customerId} value={c.customerId} className="text-slate-900">{c.displayName}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-white/60">PIN</span>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              required
              placeholder="••••••"
              className="mt-1.5 h-14 w-full rounded-2xl border border-white/15 bg-white/5 px-4 text-center text-2xl font-black tracking-[0.5em] text-white outline-none placeholder:tracking-[0.3em] placeholder:text-white/25 focus:border-white/40"
            />
          </label>

          {error ? (
            <p role="alert" className="rounded-xl bg-red-500/15 px-4 py-3 text-sm font-bold text-red-200">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={busy || !customerId || pin.length < 4}
            className="h-14 w-full rounded-2xl bg-white text-sm font-black uppercase tracking-[0.14em] text-slate-950 transition disabled:opacity-40"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {!loadingAccounts && customers.length === 0 ? (
          <p className="mt-4 rounded-xl bg-white/5 px-4 py-3 text-center text-xs font-semibold text-white/60">
            No accounts have been set up for {tenantName} yet. Please contact them to have your
            ordering access enabled.
          </p>
        ) : null}

        <p className="mt-6 text-center text-xs font-semibold text-white/40">
          Forgotten your PIN? Contact us and we&apos;ll reset it for you.
        </p>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------- home */

/**
 * The customer home.
 *
 * Structured so the screen answers "what now?" before it offers a menu: a short
 * greeting, one unmistakable primary action, then whatever is genuinely useful
 * — an order in progress, an order on its way, the products this customer
 * actually reorders. Every one of those sections is omitted entirely when there
 * is no data behind it, rather than rendered empty to fill space.
 *
 * On a phone it is a single column of native-feeling controls. From lg it
 * becomes a real two-column portal: actions and usuals on the left, live order
 * state on the right — not a stretched phone.
 */
function Home({
  greeting: greetingText,
  customer,
  cart,
  favouriteCount,
  onNewOrder,
  onFavourites,
  onHistory,
  onResumeCart,
  onOpenOrder,
  onQuickAdd,
}: {
  greeting: string;
  customer: SessionCustomer;
  cart: CartView | null;
  favouriteCount: number;
  onNewOrder: () => void;
  onFavourites: () => void;
  onHistory: () => void;
  onResumeCart: () => void;
  onOpenOrder: (orderId: string) => void;
  onQuickAdd: (productId: string, units: number) => void;
}) {
  const [orders, setOrders] = useState<CustomerOrderSummary[] | null>(null);
  const [usuals, setUsuals] = useState<UsualProduct[]>([]);
  const [added, setAdded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/vyron-order/orders", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/vyron-order/usuals", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]).then(([orderBody, usualBody]) => {
      if (cancelled) return;
      setOrders(orderBody?.ok ? (orderBody.orders as CustomerOrderSummary[]) : []);
      if (usualBody?.ok) setUsuals(usualBody.usuals as UsualProduct[]);
    });
    return () => { cancelled = true; };
  }, []);

  const recent = (orders || []).slice(0, 3);
  /** The most recent order that is still moving — what the customer wants to see. */
  const active = (orders || []).find((o) => !["Completed", "Cancelled"].includes(o.customerStatus)) || null;
  const hasCart = Boolean(cart && cart.itemCount > 0);

  /*
   * One contextual line under the greeting, and only where it is true. No
   * invented encouragement: if there is nothing to say, nothing is said.
   */
  const contextLine = hasCart
    ? "You have an order in progress."
    : active
      ? `Your last order is ${active.customerStatus.toLowerCase()}.`
      : usuals.length > 0
        ? "Your usual products are ready when you are."
        : orders === null
          ? ""
          : "Ready to place your next order?";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 lg:px-6">
      <header className="lg:max-w-2xl">
        <p className="text-2xl font-black tracking-[-0.01em] text-slate-950">{greetingText} 👋</p>
        <p className="mt-1 text-sm font-semibold text-slate-500">{customer.customerName}</p>
        {contextLine ? (
          <p className="mt-3 text-base font-bold text-slate-700">{contextLine}</p>
        ) : null}
      </header>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6">
        {/* ------------------------------------------------ actions + usuals */}
        {/* min-w-0: a grid item will not shrink below its min-content width
            without it, which pushed the whole column past a 390px screen. */}
        <div className="min-w-0 space-y-4">
          <button
            type="button"
            onClick={onNewOrder}
            className="group flex min-h-[92px] w-full items-center justify-between gap-4 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-950 px-6 text-left text-white shadow-lg shadow-slate-900/15 transition hover:shadow-xl hover:shadow-slate-900/25"
          >
            <span>
              <span className="flex items-center gap-2.5 text-lg font-black tracking-[-0.01em]">
                <Plus size={22} strokeWidth={2.5} /> New order
              </span>
              <span className="mt-0.5 block text-xs font-semibold text-white/60">
                Browse the full range and build your order
              </span>
            </span>
            <ChevronRight size={22} className="shrink-0 text-white/40 transition group-hover:translate-x-0.5 group-hover:text-white/70" />
          </button>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <HomeTile
              icon={<RefreshCw size={18} />}
              label="Reorder"
              note={recent.length ? "Your recent orders" : "No past orders"}
              onClick={onHistory}
              disabled={recent.length === 0}
            />
            <HomeTile
              icon={<Star size={18} />}
              label="Favourites"
              note={favouriteCount ? `${favouriteCount} saved` : "None saved yet"}
              onClick={onFavourites}
              disabled={favouriteCount === 0}
            />
            <HomeTile
              icon={<History size={18} />}
              label="My orders"
              note={orders === null ? "Loading…" : `${orders.length} order${orders.length === 1 ? "" : "s"}`}
              onClick={onHistory}
              disabled={orders !== null && orders.length === 0}
            />
          </div>

          {usuals.length > 0 ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-5">
              <h2 className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Your usuals</h2>
              <p className="mt-1 text-xs font-semibold text-slate-400">
                From what you have ordered before. Tap to add your usual quantity.
              </p>
              <div className="mt-3 space-y-2">
                {usuals.map((usual) => (
                  <div key={usual.productId} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">{usual.productName}</p>
                      <p className="text-xs font-semibold text-slate-500">
                        Usually {usual.typicalUnits} units · ordered {usual.timesOrdered}×
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { onQuickAdd(usual.productId, usual.typicalUnits); setAdded((p) => ({ ...p, [usual.productId]: true })); }}
                      className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-4 text-xs font-black uppercase tracking-[0.1em] transition ${
                        added[usual.productId] ? "bg-emerald-600 text-white" : "bg-slate-950 text-white hover:bg-slate-800"
                      }`}
                    >
                      {added[usual.productId] ? <><Check size={14} /> Added</> : <><Plus size={14} /> Add</>}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {/* ------------------------------------------------ live order state */}
        <div className="min-w-0 space-y-4">
          {hasCart && cart ? (
            <button
              type="button"
              onClick={onResumeCart}
              className="w-full rounded-3xl border border-[#2563eb]/30 bg-[#2563eb]/[0.06] p-5 text-left transition hover:bg-[#2563eb]/[0.1]"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-black uppercase tracking-[0.12em] text-[#2563eb]">
                  Order in progress
                </span>
                <ChevronRight size={17} className="shrink-0 text-[#2563eb]" />
              </span>
              <span className="mt-2 block text-2xl font-black tabular-nums text-slate-950">{money(cart.total)}</span>
              <span className="mt-0.5 block text-sm font-semibold text-slate-500">
                {cart.itemCount} item{cart.itemCount === 1 ? "" : "s"} · not yet submitted
              </span>
              <span className="mt-3 block h-11 rounded-xl bg-[#2563eb] pt-3 text-center text-xs font-black uppercase tracking-[0.1em] text-white">
                Continue order
              </span>
            </button>
          ) : null}

          {active ? (
            <button
              type="button"
              onClick={() => onOpenOrder(active.orderId)}
              className="w-full rounded-3xl border border-slate-200 bg-white p-5 text-left transition hover:border-slate-300"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                  Order {active.orderNumber}
                </span>
                <ChevronRight size={17} className="shrink-0 text-slate-400" />
              </span>
              <span className="mt-2 block text-2xl font-black tabular-nums text-slate-950">{money(active.total)}</span>
              <span className="mt-0.5 block text-sm font-semibold text-slate-500">
                {active.requestedDeliveryDate ? `For ${formatDate(active.requestedDeliveryDate)}` : "Delivery date to be confirmed"}
              </span>
              <span className="mt-4 block">
                <OrderProgress status={active.customerStatus} />
              </span>
            </button>
          ) : null}

          <section className="rounded-3xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                <History size={14} /> Recent orders
              </h2>
              {recent.length > 0 ? (
                <button
                  type="button"
                  onClick={onHistory}
                  className="-mr-2 inline-flex h-11 items-center px-2 text-xs font-black uppercase tracking-[0.1em] text-[#2563eb]"
                >
                  See all
                </button>
              ) : null}
            </div>

            {orders === null ? (
              <p className="mt-3 text-sm font-semibold text-slate-400">Loading your orders…</p>
            ) : recent.length === 0 ? (
              <>
                <p className="mt-3 text-sm font-bold text-slate-800">No orders yet</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Your orders will appear here once you have placed your first one.
                </p>
              </>
            ) : (
              <div className="mt-3 space-y-2">
                {recent.map((order) => (
                  <OrderRow key={order.orderId} order={order} onClick={() => onOpenOrder(order.orderId)} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * Where an order has got to, in the customer's language.
 *
 * The steps are a presentation of the engine's own statuses — there is no
 * second status field anywhere. Cancelled is deliberately not a step on the
 * line: it is an exit from it, so it renders as its own state.
 */
const PROGRESS_STEPS = ["Received", "Confirmed", "Being prepared", "Ready", "On the way"] as const;

function OrderProgress({ status }: { status: string }) {
  if (status === "Cancelled") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.1em] text-red-700">
        Cancelled
      </span>
    );
  }
  // Delivered and Completed sit past the end of the line: every step is done.
  const index = PROGRESS_STEPS.indexOf(status as (typeof PROGRESS_STEPS)[number]);
  const reached = index === -1 ? PROGRESS_STEPS.length - 1 : index;

  return (
    <span className="block">
      <span className="flex items-center gap-1.5">
        {PROGRESS_STEPS.map((step, i) => (
          <span
            key={step}
            className={`h-1.5 flex-1 rounded-full transition ${i <= reached ? "bg-[#2563eb]" : "bg-slate-200"}`}
          />
        ))}
      </span>
      <span className="mt-2 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${status === "Completed" || status === "Delivered" ? "bg-emerald-500" : "bg-[#2563eb]"}`} />
        <span className="text-xs font-black uppercase tracking-[0.1em] text-slate-700">{status}</span>
      </span>
    </span>
  );
}

function HomeTile({
  icon, label, note, onClick, disabled,
}: { icon: React.ReactNode; label: string; note: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[76px] flex-col items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-white text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-dashed disabled:border-slate-300 disabled:text-slate-400 disabled:hover:bg-white"
    >
      <span className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.1em]">{icon}{label}</span>
      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{note}</span>
    </button>
  );
}

const STATUS_TONE: Record<string, string> = {
  Received: "bg-slate-100 text-slate-700",
  Confirmed: "bg-blue-50 text-blue-700",
  "Being prepared": "bg-amber-50 text-amber-800",
  Ready: "bg-violet-50 text-violet-700",
  "On the way": "bg-indigo-50 text-indigo-700",
  Delivered: "bg-emerald-50 text-emerald-700",
  Completed: "bg-emerald-50 text-emerald-700",
  Cancelled: "bg-red-50 text-red-700",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${STATUS_TONE[status] || "bg-slate-100 text-slate-700"}`}>
      {status}
    </span>
  );
}

function OrderRow({ order, onClick }: { order: CustomerOrderSummary; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:bg-slate-50"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-black text-slate-950">{order.orderNumber}</p>
          <StatusPill status={order.customerStatus} />
        </div>
        <p className="mt-0.5 text-xs font-semibold text-slate-500">
          {formatDate(order.orderDate)} · {order.lineCount} item{order.lineCount === 1 ? "" : "s"}
          {order.requestedDeliveryDate ? ` · for ${formatDate(order.requestedDeliveryDate)}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-base font-black tabular-nums text-slate-950">{money(order.total)}</span>
        <ChevronRight size={16} className="text-slate-400" />
      </div>
    </button>
  );
}

/* --------------------------------------------------------------- catalogue */

type CartApi = ReturnType<typeof useServerCart>;

function Catalogue({
  cart, favourites, filter, onFilterChange, onToggleFavourite, onBack, onReview,
}: {
  cart: CartApi;
  favourites: string[];
  filter: "all" | "favourites";
  onFilterChange: (filter: "all" | "favourites") => void;
  onToggleFavourite: (productId: string) => void;
  onBack: () => void;
  onReview: () => void;
}) {
  const [data, setData] = useState<CustomerCatalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  /*
   * Entry mode is per product and local to this screen. Quantity is not held
   * here at all — it belongs to the server cart, in UNITS. Box entry multiplies
   * by the verified pack size on the way in, so the box view and the unit view
   * can never disagree and the value sent to the server is unambiguous.
   */
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
    const favouriteSet = new Set(favourites);
    return data.categories
      .map((c) => ({
        ...c,
        products: c.products.filter((p) => {
          if (filter === "favourites" && !favouriteSet.has(p.productId)) return false;
          if (!term) return true;
          return `${p.productName} ${p.sku ?? ""} ${p.category}`.toLowerCase().includes(term);
        }),
      }))
      .filter((c) => c.products.length > 0);
  }, [data, search, filter, favourites]);

  /*
   * The sticky bar has to keep up with typing, so it is computed locally from
   * the prices the server issued with the catalogue. It is an indication only —
   * the review screen and the submitted order both use the server's own cart.
   */
  const totals = useMemo(() => {
    if (!data) return { lines: 0, units: 0, value: 0 };
    const index = new Map<string, CatalogueProduct>();
    data.categories.forEach((c) => c.products.forEach((p) => index.set(p.productId, p)));
    const quantities = new Map<string, number>();
    for (const line of cart.cart?.lines || []) quantities.set(line.productId, line.quantityUnits);
    for (const [productId, quantity] of Object.entries(cart.pending)) quantities.set(productId, quantity);

    let lines = 0, units = 0, value = 0;
    for (const [productId, quantity] of quantities) {
      if (!quantity) continue;
      const product = index.get(productId);
      if (!product) continue;
      lines += 1;
      units += quantity;
      value += quantity * product.sellingPrice;
    }
    return { lines, units, value };
  }, [cart.cart, cart.pending, data]);

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
      <BackBar
        label="Home"
        onBack={onBack}
        right={
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
            {data?.productCount ?? 0} products
          </p>
        }
      />

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

      <div role="group" aria-label="Product filter" className="mt-3 inline-flex overflow-hidden rounded-xl border border-slate-200">
        {(["all", "favourites"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={filter === option}
            onClick={() => onFilterChange(option)}
            className={`h-11 min-w-[104px] px-4 text-xs font-black uppercase tracking-[0.1em] transition ${
              filter === option ? "bg-slate-950 text-white" : "bg-white text-slate-600"
            }`}
          >
            {option === "all" ? "All products" : `Favourites${favourites.length ? ` (${favourites.length})` : ""}`}
          </button>
        ))}
      </div>

      {cart.error ? (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{cart.error}</p>
      ) : null}

      {categories.length === 0 ? (
        <p className="mt-8 text-sm font-bold text-slate-500">
          {filter === "favourites" && !search.trim()
            ? "You haven't saved any favourites yet. Tap the star on a product to save it."
            : "No products match that search."}
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        {categories.map((category) => {
          const isOpen = open[category.category] ?? Boolean(search.trim() || filter === "favourites");
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
                      units={cart.quantityOf(product.productId)}
                      favourite={favourites.includes(product.productId)}
                      onToggleFavourite={() => onToggleFavourite(product.productId)}
                      mode={mode[product.productId] || (product.unitsPerBox ? "boxes" : "units")}
                      onModeChange={(m) => setMode((prev) => ({ ...prev, [product.productId]: m }))}
                      onChange={(nextUnits) =>
                        cart.setLine(
                          product.productId,
                          nextUnits,
                          (mode[product.productId] || (product.unitsPerBox ? "boxes" : "units")) === "boxes" ? "boxes" : "units"
                        )
                      }
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
              <p className="text-xl font-black text-slate-950">
                {money(totals.value)} <span className="text-[11px] font-bold text-slate-400">excl. VAT</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onReview}
              className="h-14 shrink-0 rounded-2xl bg-slate-950 px-6 text-sm font-black uppercase tracking-[0.1em] text-white transition hover:bg-slate-800"
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
  product, units, mode, favourite, onModeChange, onChange, onToggleFavourite,
}: {
  product: CatalogueProduct;
  units: number;
  mode: "boxes" | "units";
  favourite: boolean;
  onModeChange: (mode: "boxes" | "units") => void;
  onChange: (nextUnits: number) => void;
  onToggleFavourite: () => void;
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
        <div className="flex shrink-0 items-start gap-2">
          <div className="text-right">
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
          <button
            type="button"
            onClick={onToggleFavourite}
            aria-pressed={favourite}
            aria-label={`${favourite ? "Remove" : "Save"} ${product.productName} ${favourite ? "from" : "to"} favourites`}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white transition hover:bg-slate-50"
          >
            <Star size={16} className={favourite ? "fill-amber-400 text-amber-500" : "text-slate-400"} />
          </button>
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

/* ------------------------------------------------------------------ review */

/** Delivery-date suggestions, generated on the client only after interaction. */
function deliveryOptions() {
  const today = new Date();
  const options: { label: string; value: string }[] = [];
  for (let offset = 1; offset <= 4; offset += 1) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const value = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    options.push({
      label: offset === 1 ? "Tomorrow" : day.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" }),
      value,
    });
  }
  return options;
}

function Review({
  cart, notice, onDismissNotice, onBack, onAddMore, onSubmitted,
}: {
  cart: CartApi;
  notice: { skipped: { description: string; reason: string }[]; priceChanges: PriceChange[] } | null;
  onDismissNotice: () => void;
  onBack: () => void;
  onAddMore: () => void;
  onSubmitted: (result: Confirmation) => void;
}) {
  const view = cart.cart;
  const [notes, setNotes] = useState(view?.notes || "");
  const [dateError, setDateError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([]);
  const [busy, setBusy] = useState(false);
  const options = useMemo(() => deliveryOptions(), []);

  /*
   * One key for this review session. Every submit attempt — including a retry
   * after a network failure or a price change — carries the same key, so the
   * server can recognise a repeat and return the original order instead of
   * creating a second one. It is only replaced once an order has been placed.
   */
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const chosenDate = view?.requestedDeliveryDate || "";

  async function chooseDate(value: string) {
    setDateError(null);
    const result = await cart.setDelivery({ requestedDeliveryDate: value });
    if (!result.ok) setDateError(result.error);
  }

  async function saveNotes(value: string) {
    await cart.setDelivery({ notes: value });
  }

  async function submit() {
    if (busy || !view) return;
    setBusy(true);
    setSubmitError(null);
    setPriceChanges([]);
    try {
      const res = await fetch("/api/vyron-order/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          // Acknowledged prices are the ones on screen right now, straight from
          // the server's own cart. If any has moved since, the server refuses.
          acknowledgedPrices: view.lines.map((l) => ({ productId: l.productId, sellingPrice: l.sellingPrice })),
        }),
      });
      const body = await res.json();

      if (res.status === 409 && body?.reason === "price_changed") {
        // Refresh first, then announce. The banner tells the customer the
        // totals below are up to date, so it must not appear until they are —
        // on a slow connection the gap was long enough to read.
        await cart.refresh();
        setPriceChanges((body.priceChanges || []) as PriceChange[]);
        return;
      }
      if (!res.ok || !body?.ok) {
        setSubmitError(body?.error || "We couldn't place your order. Please try again.");
        return;
      }

      setIdempotencyKey(newIdempotencyKey());
      await cart.refresh();
      onSubmitted({
        orderNumber: String(body.order.orderNumber),
        total: Number(body.order.total || 0),
        requestedDeliveryDate: body.order.requestedDeliveryDate ?? null,
        duplicate: Boolean(body.order.duplicate),
      });
    } catch {
      // The order may or may not have been created. The same key is kept, so
      // tapping again returns the original order rather than duplicating it.
      setSubmitError("We couldn't reach the server. Check your connection and tap Place order again — it is safe to retry.");
    } finally {
      setBusy(false);
    }
  }

  if (!view || view.lines.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-5">
        <BackBar label="Back" onBack={onBack} />
        <div className="mt-10 rounded-3xl border border-slate-200 bg-white p-8 text-center">
          <ShoppingBag size={28} className="mx-auto text-slate-300" />
          <p className="mt-3 text-base font-black text-slate-900">Your order is empty</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">Add a few products and they will show up here.</p>
          <button type="button" onClick={onAddMore} className="mt-5 h-12 rounded-2xl bg-slate-950 px-6 text-sm font-black uppercase tracking-[0.1em] text-white">
            Browse products
          </button>
        </div>
      </div>
    );
  }

  const canSubmit = Boolean(chosenDate) && !view.hasUnavailable && !busy;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-40 pt-5">
      <BackBar label="Products" onBack={onBack} />

      <h1 className="mt-4 text-2xl font-black text-slate-950">Review your order</h1>
      <p className="mt-1 text-sm font-semibold text-slate-500">
        Check the quantities and choose when you need it.
      </p>

      {notice && (notice.skipped.length > 0 || notice.priceChanges.length > 0) ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.1em] text-amber-800">
            <AlertTriangle size={14} /> Since your last order
          </p>
          <ul className="mt-2 space-y-1 text-sm font-semibold text-amber-900">
            {notice.priceChanges.map((c) => (
              <li key={`p-${c.productId}`}>{c.productName}: {money(c.was)} → {money(c.now)}</li>
            ))}
            {notice.skipped.map((s) => (
              <li key={`s-${s.description}`}>{s.description} — {s.reason.toLowerCase()}, not added</li>
            ))}
          </ul>
          <button type="button" onClick={onDismissNotice} className="mt-2 text-xs font-black uppercase tracking-[0.1em] text-amber-800 underline">
            Got it
          </button>
        </div>
      ) : null}

      {priceChanges.length > 0 ? (
        <div role="alert" className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.1em] text-amber-900">
            <AlertTriangle size={14} /> Prices changed
          </p>
          <p className="mt-1 text-sm font-semibold text-amber-900">
            Your order was not placed. These prices have been updated:
          </p>
          <ul className="mt-2 space-y-1 text-sm font-bold text-amber-900">
            {priceChanges.map((c) => (
              <li key={c.productId}>{c.productName}: {money(c.was)} → {money(c.now)}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm font-semibold text-amber-900">
            The totals below are up to date. Tap Place order to continue at the new prices.
          </p>
        </div>
      ) : null}

      {view.hasUnavailable ? (
        <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
          Some items in your order cannot be priced right now. Please remove them or contact us to order them.
        </div>
      ) : null}

      <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="divide-y divide-slate-100">
          {view.lines.map((line) => {
            const boxMode = line.entryMode === "boxes" && Boolean(line.unitsPerBox);
            const step = boxMode && line.unitsPerBox ? line.unitsPerBox : 1;
            const quantity = cart.quantityOf(line.productId);
            const shown = boxMode && line.unitsPerBox ? Math.round(quantity / line.unitsPerBox) : quantity;
            return (
              <div key={line.productId} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-black text-slate-950">{line.productName}</p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">
                      {money(line.sellingPrice)} / unit
                      {line.unitsPerBox ? ` · box of ${line.unitsPerBox}` : ""}
                    </p>
                    {line.unavailable ? (
                      <p className="mt-1 text-xs font-black text-red-700">{line.unavailableReason || "Unavailable"}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-base font-black tabular-nums text-slate-950">{money(line.lineTotal)}</span>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Decrease ${line.productName}`}
                    onClick={() => cart.setLine(line.productId, quantity - step, line.entryMode)}
                    className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"
                  >
                    <Minus size={18} />
                  </button>
                  <span
                    aria-label={`${line.productName} quantity`}
                    className="inline-flex h-12 min-w-[4.5rem] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-base font-black text-slate-950"
                  >
                    {shown}
                  </span>
                  <button
                    type="button"
                    aria-label={`Increase ${line.productName}`}
                    onClick={() => cart.setLine(line.productId, quantity + step, line.entryMode)}
                    className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"
                  >
                    <Plus size={18} />
                  </button>
                  <span className="text-xs font-bold text-slate-500">
                    {boxMode ? `boxes · ${quantity} units` : "units"}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${line.productName}`}
                    onClick={() => cart.setLine(line.productId, 0, line.entryMode)}
                    className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onAddMore}
          className="flex w-full items-center justify-center gap-2 border-t border-slate-100 py-4 text-sm font-black uppercase tracking-[0.1em] text-[#2563eb]"
        >
          <Plus size={16} /> Add more products
        </button>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
          <CalendarDays size={14} /> When do you need it?
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={chosenDate === option.value}
              onClick={() => void chooseDate(option.value)}
              className={`h-12 rounded-xl px-4 text-sm font-black transition ${
                chosenDate === option.value ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="mt-3 block">
          <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Or pick a date</span>
          <input
            type="date"
            value={chosenDate}
            onChange={(e) => void chooseDate(e.target.value)}
            className="mt-1 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base font-bold text-slate-900 outline-none focus:border-slate-900"
          />
        </label>
        {dateError ? <p role="alert" className="mt-2 text-sm font-bold text-red-700">{dateError}</p> : null}

        <label className="mt-4 block">
          <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Anything we should know?</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 500))}
            onBlur={() => void saveNotes(notes)}
            rows={3}
            placeholder="Delivery instructions, a contact name, a preferred time…"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base font-semibold text-slate-900 outline-none focus:border-slate-900"
          />
        </label>
      </section>

      {/*
        Subtotal, VAT and total are shown separately and all three come from the
        server. The total here is the same figure the confirmation will show, so
        the customer never sees the number change after they commit.
      */}
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-slate-600">
            {view.itemCount} item{view.itemCount === 1 ? "" : "s"} · {view.unitCount} units
          </span>
          <span className="text-sm font-black tabular-nums text-slate-700">{money(view.subtotal)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-slate-600">VAT</span>
          <span className="text-sm font-black tabular-nums text-slate-700">{money(view.vatAmount)}</span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <span className="text-sm font-black uppercase tracking-[0.1em] text-slate-900">Total</span>
          <span className="text-2xl font-black tabular-nums text-slate-950">{money(view.total)}</span>
        </div>
        <p className="mt-1 text-xs font-semibold text-slate-400">
          Totals are calculated by us from your agreed prices and confirmed when we invoice.
        </p>
      </section>

      {submitError ? (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{submitError}</p>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/97 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Total incl. VAT</p>
            <p className="text-xl font-black text-slate-950">{money(view.total)}</p>
          </div>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="h-14 shrink-0 rounded-2xl bg-slate-950 px-6 text-sm font-black uppercase tracking-[0.1em] text-white transition hover:bg-slate-800 disabled:bg-slate-300"
          >
            {busy ? "Placing…" : chosenDate ? "Place order" : "Choose a date"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ confirmation */

function ConfirmationScreen({
  confirmation, onHome, onHistory,
}: { confirmation: Confirmation; onHome: () => void; onHistory: () => void }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-10">
      <div className="rounded-3xl border border-emerald-200 bg-white p-8 text-center">
        <CheckCircle2 size={44} className="mx-auto text-emerald-500" />
        <h1 className="mt-4 text-2xl font-black text-slate-950">
          {confirmation.duplicate ? "Already received" : "Order received"}
        </h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          {confirmation.duplicate
            ? "This order was already placed — here it is again, not a second one."
            : "Thank you. We have your order and will confirm it shortly."}
        </p>

        <div className="mt-6 space-y-3 rounded-2xl bg-slate-50 p-5 text-left">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Order number</span>
            <span className="text-base font-black text-slate-950">{confirmation.orderNumber}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Requested for</span>
            <span className="text-base font-black text-slate-950">{formatDate(confirmation.requestedDeliveryDate)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Total</span>
            <span className="text-base font-black tabular-nums text-slate-950">{money(confirmation.total)}</span>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={onHistory} className="h-14 rounded-2xl border border-slate-200 bg-white text-sm font-black uppercase tracking-[0.1em] text-slate-800">
            View my orders
          </button>
          <button type="button" onClick={onHome} className="h-14 rounded-2xl bg-slate-950 text-sm font-black uppercase tracking-[0.1em] text-white">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- history */

function OrderHistory({ onBack, onOpen }: { onBack: () => void; onOpen: (orderId: string) => void }) {
  const [orders, setOrders] = useState<CustomerOrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/vyron-order/orders", { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body?.ok) setOrders(body.orders as CustomerOrderSummary[]);
        else setError(body?.error || "We couldn't load your orders.");
      })
      .catch(() => { if (!cancelled) setError("We couldn't load your orders."); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-5">
      <BackBar label="Home" onBack={onBack} />
      <h1 className="mt-4 text-2xl font-black text-slate-950">My orders</h1>

      {error ? (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</p>
      ) : orders === null ? (
        <p className="mt-4 text-sm font-semibold text-slate-400">Loading your orders…</p>
      ) : orders.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-8 text-center">
          <History size={28} className="mx-auto text-slate-300" />
          <p className="mt-3 text-base font-black text-slate-900">No orders yet</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">Your orders will appear here once you place one.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {orders.map((order) => (
            <OrderRow key={order.orderId} order={order} onClick={() => onOpen(order.orderId)} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderDetailScreen({
  orderId, onBack, onReorder,
}: {
  orderId: string;
  onBack: () => void;
  onReorder: (orderId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [order, setOrder] = useState<CustomerOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/vyron-order/orders/${orderId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body?.ok) setOrder(body.order as CustomerOrderDetail);
        else setError(body?.error || "We couldn't load that order.");
      })
      .catch(() => { if (!cancelled) setError("We couldn't load that order."); });
    return () => { cancelled = true; };
  }, [orderId]);

  async function reorder() {
    setBusy(true);
    setError(null);
    const result = await onReorder(orderId);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-5">
      <BackBar label="My orders" onBack={onBack} />

      {error ? (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</p>
      ) : null}

      {!order ? (
        <p className="mt-4 text-sm font-semibold text-slate-400">Loading…</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-black text-slate-950">{order.orderNumber}</h1>
            <StatusPill status={order.customerStatus} />
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Placed {formatDate(order.orderDate)}
            {order.requestedDeliveryDate ? ` · requested for ${formatDate(order.requestedDeliveryDate)}` : ""}
          </p>

          <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="divide-y divide-slate-100">
              {order.lines.map((line, index) => (
                <div key={`${line.productId ?? "line"}-${index}`} className="flex items-start justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-950">{line.description}</p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">
                      {line.quantity} {line.unit} × {money(line.sellingPrice)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-black tabular-nums text-slate-950">{money(line.lineTotal)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-4">
              <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Order total</span>
              <span className="text-xl font-black tabular-nums text-slate-950">{money(order.total)}</span>
            </div>
          </section>

          {order.notes ? (
            <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Your note</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-slate-700">{order.notes}</p>
            </section>
          ) : null}

          <button
            type="button"
            onClick={() => void reorder()}
            disabled={busy}
            className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 text-sm font-black uppercase tracking-[0.1em] text-white transition hover:bg-slate-800 disabled:bg-slate-300"
          >
            <RefreshCw size={17} /> {busy ? "Adding to your order…" : "Order this again"}
          </button>
          <p className="mt-2 text-center text-xs font-semibold text-slate-400">
            We&apos;ll check today&apos;s prices and availability before you confirm.
          </p>
        </>
      )}
    </div>
  );
}
