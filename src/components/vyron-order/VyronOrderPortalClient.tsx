"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown, ChevronRight, Minus, Plus, Search, ShoppingBag, Star,
  History, RefreshCw, CalendarDays, CheckCircle2, AlertTriangle, Trash2, ArrowLeft, Check,
} from "lucide-react";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";
import VyronOrderShell, { VyronOrderAuthShell } from "@/components/vyron-order/VyronOrderShell";
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
/** Which slice of the catalogue is on screen. A view, never a different catalogue. */
type CatalogueFilter = "all" | "usuals" | "favourites";

type Confirmation = {
  /*
   * The order the server created. submitCart already returns it and the route
   * already passes it through, so "View order" opens the real record rather
   * than a list the customer then has to search.
   */
  orderId: string;
  orderNumber: string;
  total: number;
  requestedDeliveryDate: string | null;
  duplicate: boolean;
};

const M = VYRON_MASTER;

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
  const [catalogueFilter, setCatalogueFilter] = useState<CatalogueFilter>("all");
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

  const openCatalogue = useCallback((filter: CatalogueFilter) => {
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
      <main className={`${M.page} flex min-h-dvh items-center justify-center px-6`}>
        <p className="text-sm font-semibold text-[#64748B]">Loading VYRON ORDER…</p>
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
    <VyronOrderShell
      customerName={customer.customerName}
      onSignOut={signOut}
      onOrders={() => setView("history")}
      onNewOrder={() => openCatalogue("all")}
    >
      {view === "home" ? (
        <Home
          greeting={greeting}
          customer={customer}
          cart={cart.cart}
          favourites={favourites}
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
          onViewOrder={() => {
            const placed = confirmation.orderId;
            setConfirmation(null);
            // Older sessions could hold a confirmation without an id; the
            // order list is then the honest destination rather than a blank
            // detail screen.
            if (placed) { setActiveOrderId(placed); setView("order"); }
            else setView("history");
          }}
          onPlaceAnother={() => { setConfirmation(null); openCatalogue("all"); }}
        />
      ) : null}

      {view === "history" ? (
        <OrderHistory
          onBack={() => setView("home")}
          onOpen={(id) => { setActiveOrderId(id); setView("order"); }}
        />
      ) : null}

      {view === "order" && activeOrderId ? (
        <OrderCentreDetail orderId={activeOrderId} onBack={() => setView("history")} onReorder={reorder} />
      ) : null}
    </VyronOrderShell>
  );
}

/* --------------------------------------------------------------- nav bits */

function BackBar({ label, onBack, right }: { label: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <button type="button" onClick={onBack} className={`${M.ghostBtn} -ml-2 h-11 gap-1.5 px-2.5 text-sm`}>
        <ArrowLeft size={16} /> {label}
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
    <VyronOrderAuthShell>
      <p className="vyron-status vyron-status-info mx-auto mt-4 w-fit">{tenantName}</p>

      <form onSubmit={submit} className={`${M.lightCard} mt-6 space-y-4 p-6`}>
        <label className="block">
          <span className={M.label}>Account</span>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            required
            className={`${M.input} mt-1.5 h-12 py-0 font-semibold`}
          >
            <option value="" disabled>
              {loadingAccounts
                ? "Loading accounts…"
                : customers.length === 0
                  ? "No accounts set up yet"
                  : "Select your account…"}
            </option>
            {customers.map((c) => (
              <option key={c.customerId} value={c.customerId}>{c.displayName}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={M.label}>PIN</span>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            required
            placeholder="••••••"
            className={`${M.input} mt-1.5 h-12 py-0 text-center text-xl font-black tracking-[0.45em] placeholder:tracking-[0.3em]`}
          />
        </label>

        {error ? (
          <p role="alert" className="vyron-alert vyron-alert-error text-sm font-semibold">{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={busy || !customerId || pin.length < 4}
          className={`${M.primaryBtn} h-12 w-full text-sm tracking-[0.02em] disabled:opacity-45`}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {!loadingAccounts && customers.length === 0 ? (
        <p className="mt-4 rounded-xl border border-[rgba(15,23,42,0.07)] bg-white/70 px-4 py-3 text-center text-xs font-medium text-[#64748B]">
          No accounts have been set up for {tenantName} yet. Please contact them to have your
          ordering access enabled.
        </p>
      ) : null}

      <p className="mt-5 text-center text-xs font-medium text-[#94A3B8]">
        Forgotten your PIN? Contact us and we&apos;ll reset it for you.
      </p>
    </VyronOrderAuthShell>
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
  favourites,
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
  favourites: string[];
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
  /** Quantities the customer has dialled on this screen, keyed by product. */
  const [qty, setQty] = useState<Record<string, number>>({});
  /**
   * The catalogue, used here only to look up a price and a pack size for
   * products the customer already buys.
   *
   * Usuals and favourites are stored as product ids; the price a given customer
   * pays is resolved by the server per catalogue request. Rather than duplicate
   * that resolution, the home screen reads the same catalogue the ordering
   * screen reads and looks the product up. Anything absent from it — delisted,
   * or with no price for this customer — simply does not appear.
   */
  const [byId, setById] = useState<Map<string, CatalogueProduct> | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/vyron-order/orders", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/vyron-order/usuals", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/vyron-order/catalogue", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]).then(([orderBody, usualBody, catalogueBody]) => {
      if (cancelled) return;
      setOrders(orderBody?.ok ? (orderBody.orders as CustomerOrderSummary[]) : []);
      if (usualBody?.ok) {
        const list = usualBody.usuals as UsualProduct[];
        setUsuals(list);
        setQty((prev) => {
          const next = { ...prev };
          for (const u of list) if (next[u.productId] === undefined) next[u.productId] = u.typicalUnits;
          return next;
        });
      }
      if (catalogueBody?.ok) {
        const map = new Map<string, CatalogueProduct>();
        for (const category of (catalogueBody.catalogue as CustomerCatalogue).categories) {
          for (const product of category.products) map.set(product.productId, product);
        }
        setById(map);
      } else {
        setById(new Map());
      }
    });
    return () => { cancelled = true; };
  }, []);

  /** Add what the stepper currently shows, and confirm it in place. */
  const addToOrder = (productId: string, units: number) => {
    if (units <= 0) return;
    onQuickAdd(productId, units);
    setAdded((prev) => ({ ...prev, [productId]: true }));
  };

  const step = (productId: string, by: number, floor = 1) =>
    setQty((prev) => ({ ...prev, [productId]: Math.max(floor, (prev[productId] ?? floor) + by) }));

  /*
   * Saved products, in catalogue order, with the price and pack size the
   * customer would actually pay. Favourites are ids only; one that no longer
   * resolves is dropped rather than rendered without a price.
   */
  const favouriteProducts = byId
    ? favourites.map((id) => byId.get(id)).filter((p): p is CatalogueProduct => Boolean(p) && !p!.priceUnavailable)
    : [];

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
    <div>
      <header className="max-w-2xl">
        <p className="vyron-t-display text-[1.65rem] text-[#0F172A] md:text-[2rem]">{greetingText} 👋</p>
        <p className="mt-1.5 text-base font-semibold text-[#334155]">{customer.customerName}</p>
        {contextLine ? (
          <p className="mt-2 text-sm font-medium text-[#64748B]">{contextLine}</p>
        ) : null}
      </header>

      <div className="mt-6 grid gap-5 md:mt-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start">
        {/* ------------------------------------------------ actions + usuals */}
        <div className="min-w-0 space-y-4">
          {/* The obvious first action, in the platform's own gradient. */}
          <button
            type="button"
            onClick={onNewOrder}
            className="group relative flex w-full items-center justify-between gap-4 overflow-hidden rounded-2xl vyron-grad-surface px-6 py-6 text-left text-white shadow-[var(--vyron-elev-brand)] transition hover:brightness-[1.06] hover:shadow-[var(--vyron-elev-4)] md:py-7"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-2.5 vyron-t-display text-[1.3rem] md:text-[1.5rem]">
                <Plus size={22} strokeWidth={2.6} /> New order
              </span>
              <span className="mt-1 block text-sm font-medium text-white/75">
                Browse products and build your order
              </span>
            </span>
            <ChevronRight size={22} className="shrink-0 text-white/50 transition group-hover:translate-x-0.5 group-hover:text-white/85" />
          </button>

          {/*
            Three across even on a 390px phone. Stacked full-width they were
            three tall cards that pushed the usuals — the thing a returning
            customer actually came for — below the fold.
          */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            <HomeTile
              icon={<RefreshCw size={18} />}
              label="Reorder"
              note={recent.length ? "From a recent order" : "No past orders yet"}
              onClick={onHistory}
              disabled={recent.length === 0}
            />
            <HomeTile
              icon={<Star size={18} />}
              label="Favourites"
              note={favourites.length ? `${favourites.length} saved product${favourites.length === 1 ? "" : "s"}` : "None saved yet"}
              onClick={onFavourites}
              disabled={favourites.length === 0}
            />
            <HomeTile
              icon={<History size={18} />}
              label="My orders"
              note={orders === null ? "Loading…" : `${orders.length} order${orders.length === 1 ? "" : "s"}`}
              onClick={onHistory}
              disabled={orders !== null && orders.length === 0}
            />
          </div>

          {/*
            With no usuals yet, say why rather than leaving the column short.
            This is an empty state, not invented data — the threshold it
            describes is the real one the server applies.
          */}
          {usuals.length === 0 && orders !== null ? (
            <section className={`${M.lightCard} p-5 md:p-6`}>
              <h2 className="vyron-t-display text-base text-[#0F172A]">Your usual products</h2>
              <p className="mt-1.5 text-sm font-medium text-[#64748B]">
                Once you have placed a few orders, the products you buy regularly will appear here so
                you can add them in one tap.
              </p>
              <button type="button" onClick={onNewOrder} className={`${M.secondaryBtn} mt-4 h-11 px-5 text-sm`}>
                Browse products
              </button>
            </section>
          ) : null}

          {usuals.length > 0 ? (
            <section className={`${M.lightCard} p-5 md:p-6`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="vyron-t-display text-base text-[#0F172A]">Your usuals</h2>
                  <p className="mt-1 text-xs font-medium text-[#64748B]">Based on your recent orders</p>
                </div>
                <button type="button" onClick={onNewOrder} className={`${M.ghostBtn} -mr-2 h-11 shrink-0 gap-1 px-2.5 text-xs`}>
                  See all <ChevronRight size={14} />
                </button>
              </div>

              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {usuals.map((usual) => {
                  const product = byId?.get(usual.productId) || null;
                  const units = qty[usual.productId] ?? usual.typicalUnits;
                  return (
                    <div
                      key={usual.productId}
                      className="flex flex-col rounded-xl border border-[rgba(15,23,42,0.06)] bg-[rgba(15,23,42,0.02)] p-4"
                    >
                      <p className="text-sm font-bold leading-snug text-[#0F172A]">{usual.productName}</p>
                      <p className="mt-1 text-xs font-medium text-[#64748B]">
                        Usually {usual.typicalUnits} units · ordered {usual.timesOrdered}×
                      </p>
                      {/* Price only where the catalogue gives one. Never estimated. */}
                      {product && !product.priceUnavailable ? (
                        <p className="mt-2 text-sm font-black tabular-nums text-[#0F172A]">
                          {money(product.sellingPrice)}{" "}
                          <span className="text-xs font-semibold text-[#64748B]">each</span>
                          {product.unitsPerBox ? (
                            <span className="text-xs font-semibold text-[#64748B]"> · box of {product.unitsPerBox}</span>
                          ) : null}
                        </p>
                      ) : null}

                      <div className="mt-3 flex items-center gap-2">
                        <div className="flex items-center rounded-xl border border-[rgba(15,23,42,0.10)] bg-white/85">
                          <button
                            type="button"
                            aria-label={`Fewer ${usual.productName}`}
                            onClick={() => step(usual.productId, -1)}
                            className="flex h-11 w-11 items-center justify-center rounded-l-xl text-[#64748B] transition hover:bg-[rgba(15,23,42,0.04)] hover:text-[#0F172A]"
                          >
                            <Minus size={15} />
                          </button>
                          <span className="min-w-[2.75rem] text-center text-sm font-black tabular-nums text-[#0F172A]">
                            {units}
                          </span>
                          <button
                            type="button"
                            aria-label={`More ${usual.productName}`}
                            onClick={() => step(usual.productId, 1)}
                            className="flex h-11 w-11 items-center justify-center rounded-r-xl text-[#64748B] transition hover:bg-[rgba(15,23,42,0.04)] hover:text-[#0F172A]"
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => addToOrder(usual.productId, units)}
                          className={`${added[usual.productId] ? "vyron-status vyron-status-success h-11 flex-1" : `${M.primaryBtn} h-11 flex-1 text-xs`} gap-1.5`}
                        >
                          {added[usual.productId] ? <><Check size={14} /> Added</> : <><Plus size={14} /> Add to order</>}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/*
            Saved products, with the price and pack the customer would pay.
            Hidden entirely when nothing is saved — the tile above already
            explains the feature, and an empty list would say less than nothing.
          */}
          {favouriteProducts.length > 0 ? (
            <section className={`${M.lightCard} p-5 md:p-6`}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="vyron-t-display text-base text-[#0F172A]">Favourites</h2>
                <button type="button" onClick={onFavourites} className={`${M.ghostBtn} -mr-2 h-11 shrink-0 gap-1 px-2.5 text-xs`}>
                  See all <ChevronRight size={14} />
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {favouriteProducts.slice(0, 5).map((product) => (
                  <div
                    key={product.productId}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(15,23,42,0.06)] bg-[rgba(15,23,42,0.02)] px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Star size={15} className="shrink-0 fill-[#F59E0B] text-[#F59E0B]" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#0F172A]">{product.productName}</p>
                        <p className="mt-0.5 text-xs font-medium tabular-nums text-[#64748B]">
                          {money(product.sellingPrice)} each
                          {product.unitsPerBox ? ` · box of ${product.unitsPerBox}` : ""}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Add ${product.productName}`}
                      onClick={() => addToOrder(product.productId, product.unitsPerBox || 1)}
                      className={`${added[product.productId] ? "vyron-status vyron-status-success h-11 px-3.5" : `${M.secondaryBtn} h-11 px-3.5 text-xs`} shrink-0 gap-1.5`}
                    >
                      {added[product.productId] ? <><Check size={14} /> Added</> : <><Plus size={14} /> Add</>}
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
              className={`${M.lightCard} ${M.lightCardHover} w-full border-[var(--vyron-brand-edge)] bg-[var(--vyron-brand-wash)] p-5 text-left`}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="vyron-t-label text-[10px] text-[#4F46E5]">Order in progress</span>
                <ChevronRight size={17} className="shrink-0 text-[#4F46E5]" />
              </span>
              <span className="mt-2 block vyron-t-display text-[1.6rem] tabular-nums text-[#0F172A]">{money(cart.total)}</span>
              <span className="mt-0.5 block text-sm font-medium text-[#64748B]">
                {cart.itemCount} item{cart.itemCount === 1 ? "" : "s"} · not yet submitted
              </span>
              <span className={`${M.primaryBtn} mt-4 h-11 w-full text-xs`}>Continue order</span>
            </button>
          ) : null}

          {active ? (
            <button
              type="button"
              onClick={() => onOpenOrder(active.orderId)}
              className={`${M.lightCard} ${M.lightCardHover} w-full p-5 text-left`}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="vyron-t-label text-[10px] text-[#64748B]">Order {active.orderNumber}</span>
                <ChevronRight size={17} className="shrink-0 text-[#94A3B8]" />
              </span>
              <span className="mt-2 block vyron-t-display text-[1.6rem] tabular-nums text-[#0F172A]">{money(active.total)}</span>
              <span className="mt-0.5 block text-sm font-medium text-[#64748B]">
                {active.requestedDeliveryDate ? `For ${formatDate(active.requestedDeliveryDate)}` : "Delivery date to be confirmed"}
                {active.lineCount ? ` · ${active.lineCount} product${active.lineCount === 1 ? "" : "s"}` : ""}
              </span>
              <span className="mt-4 block">
                <OrderProgress status={active.customerStatus} showStages />
              </span>
              <span className="mt-4 flex items-center justify-between gap-2 border-t border-[rgba(15,23,42,0.07)] pt-3 vyron-t-label text-[10px] text-[#4F46E5]">
                View order <ChevronRight size={14} />
              </span>
            </button>
          ) : null}

          <section className={`${M.lightCard} p-5`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="vyron-t-display text-sm text-[#0F172A]">Recent orders</h2>
              {recent.length > 0 ? (
                <button type="button" onClick={onHistory} className={`${M.ghostBtn} -mr-2 h-11 px-2.5 text-xs`}>
                  See all
                </button>
              ) : null}
            </div>

            {orders === null ? (
              <p className="mt-3 text-sm font-medium text-[#94A3B8]">Loading your orders…</p>
            ) : recent.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-[rgba(15,23,42,0.10)] bg-[rgba(15,23,42,0.02)] p-6 text-center">
                <ShoppingBag size={22} className="mx-auto text-[#CBD5E1]" />
                <p className="mt-2.5 text-sm font-bold text-[#0F172A]">No orders yet</p>
                <p className="mt-1 text-xs font-medium text-[#64748B]">
                  Your orders will appear here once you place your first one.
                </p>
              </div>
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
 * A quick action.
 *
 * An icon in the platform's gradient container, a name, and a line that says
 * something true about the customer's own data — never a generic caption.
 */
function HomeTile({
  icon, label, note, onClick, disabled,
}: { icon: React.ReactNode; label: string; note: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${M.lightCard} ${disabled ? "opacity-55" : M.lightCardHover} flex min-h-[5.5rem] flex-col items-start gap-2 p-3.5 text-left disabled:cursor-not-allowed sm:flex-row sm:items-center sm:gap-3.5 sm:p-4`}
    >
      <span className={`${disabled ? "bg-[rgba(15,23,42,0.05)] text-[#94A3B8]" : "vyron-grad-surface text-white shadow-[var(--vyron-elev-brand)]"} flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-bold leading-tight text-[#0F172A] sm:text-sm">{label}</span>
        {/* The qualifying line is real data, so it stays wherever it fits. */}
        <span className="mt-0.5 block truncate text-[11px] font-medium text-[#64748B] sm:text-xs">{note}</span>
      </span>
    </button>
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

function OrderProgress({ status, showStages }: { status: string; showStages?: boolean }) {
  if (status === "Cancelled") {
    return <span className="vyron-status vyron-status-error">Cancelled</span>;
  }
  // Delivered and Completed sit past the end of the line: every step is done.
  const index = PROGRESS_STEPS.indexOf(status as (typeof PROGRESS_STEPS)[number]);
  const reached = index === -1 ? PROGRESS_STEPS.length - 1 : index;
  const done = status === "Completed" || status === "Delivered";

  return (
    <span className="block">
      <span className="flex items-center gap-1">
        {PROGRESS_STEPS.map((step, i) => (
          <span
            key={step}
            className={`h-1.5 flex-1 rounded-full transition ${
              i <= reached ? (done ? "bg-[var(--vyron-success-solid)]" : "vyron-grad-surface") : "bg-[rgba(15,23,42,0.08)]"
            }`}
          />
        ))}
      </span>
      <span className="mt-2.5 flex items-center justify-between gap-2">
        <span className="vyron-t-label text-[10px] text-[#0F172A]">{status}</span>
        <span className="text-[10px] font-semibold text-[#94A3B8]">
          Step {reached + 1} of {PROGRESS_STEPS.length}
        </span>
      </span>
      {/*
        Every stage named, so the customer can see what is still to come and not
        only where the order is now. Hidden on the narrowest screens, where five
        labels across would be too small to read.
      */}
      {showStages ? (
        <span className="mt-2 hidden items-start gap-1 sm:flex">
          {PROGRESS_STEPS.map((step, i) => (
            <span
              key={step}
              className={`flex-1 text-center text-[9px] font-semibold leading-tight ${
                i <= reached ? "text-[#334155]" : "text-[#94A3B8]"
              }`}
            >
              {step}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}

/**
 * A vertical version for the order detail, where there is room to show every
 * step and which one the order is on.
 */
function OrderTimeline({ status }: { status: string }) {
  if (status === "Cancelled") {
    return (
      <div className="vyron-alert vyron-alert-error">
        <p className="text-sm font-semibold">This order was cancelled.</p>
      </div>
    );
  }
  const index = PROGRESS_STEPS.indexOf(status as (typeof PROGRESS_STEPS)[number]);
  const reached = index === -1 ? PROGRESS_STEPS.length - 1 : index;

  return (
    <ol className="space-y-0">
      {PROGRESS_STEPS.map((step, i) => {
        const isDone = i < reached;
        const isCurrent = i === reached;
        return (
          <li key={step} className="flex gap-3">
            <span className="flex flex-col items-center">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  isDone
                    ? "border-transparent bg-[var(--vyron-success-solid)] text-white"
                    : isCurrent
                      ? "border-transparent vyron-grad-surface text-white shadow-[var(--vyron-elev-brand)]"
                      : "border-[rgba(15,23,42,0.12)] bg-white"
                }`}
              >
                {isDone ? <Check size={12} strokeWidth={3} /> : isCurrent ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
              </span>
              {i < PROGRESS_STEPS.length - 1 ? (
                <span className={`w-0.5 flex-1 ${i < reached ? "bg-[var(--vyron-success-solid)]" : "bg-[rgba(15,23,42,0.09)]"}`} />
              ) : null}
            </span>
            <span className={`pb-5 ${i === PROGRESS_STEPS.length - 1 ? "pb-0" : ""}`}>
              <span className={`block text-sm ${isCurrent ? "font-bold text-[#0F172A]" : isDone ? "font-semibold text-[#334155]" : "font-medium text-[#94A3B8]"}`}>
                {step}
              </span>
              {isCurrent ? (
                <span className="mt-0.5 block text-xs font-medium text-[#64748B]">Your order is here now</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Customer-facing status mapped onto the platform's own badge styles. */
const STATUS_TONE: Record<string, string> = {
  Received: "vyron-status vyron-status-info",
  Confirmed: "vyron-status vyron-status-info",
  "Being prepared": "vyron-status vyron-status-warning",
  Ready: "vyron-status vyron-status-info",
  "On the way": "vyron-status vyron-status-info",
  Delivered: "vyron-status vyron-status-success",
  Completed: "vyron-status vyron-status-success",
  Cancelled: "vyron-status vyron-status-error",
};

function StatusPill({ status }: { status: string }) {
  return <span className={STATUS_TONE[status] || "vyron-status vyron-status-neutral"}>{status}</span>;
}

function OrderRow({ order, onClick }: { order: CustomerOrderSummary; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-[rgba(15,23,42,0.07)] bg-white/80 px-4 py-3.5 text-left transition hover:border-[rgba(15,23,42,0.12)] hover:bg-white hover:shadow-[var(--vyron-elev-2)]"
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-bold text-[#0F172A]">{order.orderNumber}</span>
          <StatusPill status={order.customerStatus} />
        </span>
        <span className="mt-1 block text-xs font-medium text-[#64748B]">
          {formatDate(order.orderDate)} · {order.lineCount} product{order.lineCount === 1 ? "" : "s"}
          {order.requestedDeliveryDate ? ` · for ${formatDate(order.requestedDeliveryDate)}` : ""}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2.5">
        <span className="text-sm font-black tabular-nums text-[#0F172A]">{money(order.total)}</span>
        <ChevronRight size={16} className="text-[#94A3B8]" />
      </span>
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
  filter: CatalogueFilter;
  onFilterChange: (filter: CatalogueFilter) => void;
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
  /** Product ids the customer orders regularly, for the Your usuals filter. */
  const [usualIds, setUsualIds] = useState<string[]>([]);
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

  useEffect(() => {
    // Usuals only decide which products are shown; the catalogue itself, and
    // every price in it, still comes from the catalogue request above.
    let cancelled = false;
    fetch("/api/vyron-order/usuals", { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled || !body?.ok) return;
        setUsualIds((body.usuals as UsualProduct[]).map((u) => u.productId));
      })
      .catch(() => { /* the filter simply stays empty */ });
    return () => { cancelled = true; };
  }, []);

  const categories = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    const favouriteSet = new Set(favourites);
    const usualSet = new Set(usualIds);
    return data.categories
      .map((c) => ({
        ...c,
        products: c.products.filter((p) => {
          if (filter === "favourites" && !favouriteSet.has(p.productId)) return false;
          if (filter === "usuals" && !usualSet.has(p.productId)) return false;
          if (!term) return true;
          return `${p.productName} ${p.sku ?? ""} ${p.category}`.toLowerCase().includes(term);
        }),
      }))
      .filter((c) => c.products.length > 0);
  }, [data, search, filter, favourites, usualIds]);

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
    return (
      <div className="space-y-3">
        <div className="h-10 w-40 animate-pulse rounded-xl bg-[rgba(15,23,42,0.06)]" />
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${M.lightCard} h-24 animate-pulse`} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${M.moduleEmptyState}`}>
        <AlertTriangle size={24} className="mx-auto text-[#B45309]" />
        <p className="mt-3 vyron-t-display text-base text-[#0F172A]">We couldn&apos;t load your products</p>
        <p className="mt-1 text-sm font-medium text-[#64748B]">{error}</p>
        <button type="button" onClick={() => void load()} className={`${M.primaryBtn} mt-5 h-11 px-6 text-sm`}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="pb-28">
      <BackBar
        label="Home"
        onBack={onBack}
        right={
          <span className="vyron-t-label text-[10px] text-[#64748B]">
            {data?.productCount ?? 0} products
          </span>
        }
      />

      <h1 className="mt-4 vyron-t-display text-[1.5rem] text-[#0F172A]">Products</h1>
      <p className="mt-1 text-sm font-medium text-[#64748B]">
        Your prices, ready to order.
      </p>

      <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
        <label className="relative flex-1">
          <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <span className="sr-only">Search products</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className={`${M.input} h-12 py-0 pl-11 font-medium`}
          />
        </label>

        <div role="group" aria-label="Product filter" className="flex gap-2 overflow-x-auto pb-0.5">
          {/*
            Usuals and favourites are offered only once there is something
            behind them, so the row never presents a filter that would empty
            the screen.
          */}
          {(["all", "usuals", "favourites"] as const)
            .filter((option) => (option === "usuals" ? usualIds.length > 0 : option === "favourites" ? favourites.length > 0 : true))
            .map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              onClick={() => onFilterChange(option)}
              className={
                filter === option
                  ? `${M.primaryBtn} h-12 shrink-0 px-4 text-xs`
                  : `${M.secondaryBtn} h-12 shrink-0 px-4 text-xs`
              }
            >
              {/*
                Shorter on a phone so all three chips fit at 390px. A chip
                clipped at the edge reads as a broken layout, not as something
                you can scroll.
              */}
              {option === "all" ? (
                <>All<span className="hidden sm:inline">&nbsp;products</span></>
              ) : option === "usuals" ? (
                <><span className="hidden sm:inline">Your&nbsp;</span>Usuals ({usualIds.length})</>
              ) : (
                <>Favourites ({favourites.length})</>
              )}
            </button>
          ))}
        </div>
      </div>

      {cart.error ? (
        <p role="alert" className="vyron-alert vyron-alert-error mt-4 text-sm font-semibold">{cart.error}</p>
      ) : null}

      {categories.length === 0 ? (
        /*
         * An empty screen always says which of the two reasons it is — a filter
         * with nothing behind it, or a search that matched nothing — and a
         * filtered empty state always offers the way back to everything.
         */
        <div className={`${M.moduleEmptyState} mt-6`}>
          {filter === "favourites" ? <Star size={24} className="mx-auto text-[#CBD5E1]" /> : <Search size={24} className="mx-auto text-[#CBD5E1]" />}
          <p className="mt-3 vyron-t-display text-base text-[#0F172A]">
            {search.trim()
              ? "Nothing matches that search"
              : filter === "favourites"
                ? "No favourites yet"
                : filter === "usuals"
                  ? "No usual products yet"
                  : "No products available"}
          </p>
          <p className="mt-1 text-sm font-medium text-[#64748B]">
            {search.trim()
              ? "Try a different product name."
              : filter === "favourites"
                ? "Tap the star on a product to save it for faster ordering."
                : filter === "usuals"
                  ? "Once you have placed a few orders, the products you buy regularly appear here."
                  : "Your supplier has not published a price list for your account yet."}
          </p>
          {filter !== "all" && !search.trim() ? (
            <button type="button" onClick={() => onFilterChange("all")} className={`${M.primaryBtn} mt-5 h-11 px-6 text-sm`}>
              Browse all products
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {categories.map((category, categoryIndex) => {
          /*
           * The first category is open on arrival so the screen shows products
           * rather than a stack of closed headers; the rest stay shut so a long
           * catalogue is still navigable. Searching or filtering opens
           * everything, because then every remaining row is a match.
           */
          const isOpen =
            open[category.category] ?? Boolean(search.trim() || filter !== "all" || categoryIndex === 0);
          return (
            <section key={category.category} className={`${M.lightCard} overflow-hidden p-0`}>
              <button
                type="button"
                onClick={() => setOpen((prev) => ({ ...prev, [category.category]: !isOpen }))}
                aria-expanded={isOpen}
                className="flex min-h-[3.75rem] w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-[rgba(15,23,42,0.02)]"
              >
                <span className="flex items-center gap-2.5">
                  <span className="vyron-t-display text-base text-[#0F172A]">{category.category}</span>
                  <span className="rounded-full bg-[rgba(15,23,42,0.05)] px-2 py-0.5 text-[11px] font-bold text-[#64748B]">
                    {category.products.length}
                  </span>
                </span>
                <ChevronDown size={18} className={`shrink-0 text-[#94A3B8] transition ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen ? (
                <div className="divide-y divide-[rgba(15,23,42,0.06)] border-t border-[rgba(15,23,42,0.06)]">
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
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[rgba(15,23,42,0.07)] bg-white/85 px-4 py-3 backdrop-blur-xl backdrop-saturate-150 md:px-8">
          <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="vyron-t-label text-[10px] text-[#64748B]">
                {totals.lines} product{totals.lines === 1 ? "" : "s"} · {totals.units} units
              </p>
              <p className="mt-0.5 vyron-t-display text-[1.25rem] tabular-nums text-[#0F172A]">
                {money(totals.value)}
                <span className="ml-1.5 text-[11px] font-semibold text-[#94A3B8]">excl. VAT</span>
              </p>
            </div>
            <button type="button" onClick={onReview} className={`${M.primaryBtn} h-12 shrink-0 gap-2 px-5 text-sm`}>
              View cart <ChevronRight size={17} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * One product, ready to order.
 *
 * Price hierarchy first — the customer decides on price per unit or per box —
 * then the controls. Deliberately not a bordered box of its own: it sits inside
 * the category card, separated by a hairline, so a long list reads as one
 * surface instead of a stack of rectangles.
 */
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
  const inCart = units > 0;

  return (
    <div className={`px-5 py-4 transition ${inCart ? "bg-[var(--vyron-brand-wash)]" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.95rem] font-bold leading-snug text-[#0F172A]">{product.productName}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-[#64748B]">
            {product.sku ? <span>{product.sku}</span> : null}
            {perBox ? (
              <span className="rounded-md bg-[rgba(15,23,42,0.05)] px-1.5 py-0.5 font-semibold">
                Box of {perBox}
              </span>
            ) : (
              <span>Sold per unit</span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-start gap-2">
          <div className="text-right">
            {unavailable ? (
              <span className="vyron-status vyron-status-warning">Price unavailable</span>
            ) : (
              <>
                <p className="vyron-t-display text-[1.05rem] tabular-nums text-[#0F172A]">
                  {money(boxMode && product.pricePerBox !== null ? product.pricePerBox : product.sellingPrice)}
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-[#94A3B8]">
                  {boxMode ? "per box" : "per unit"}
                </p>
                {perBox ? (
                  <p className="mt-0.5 text-[11px] font-medium text-[#94A3B8]">
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
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[#94A3B8] transition hover:bg-[rgba(15,23,42,0.04)]"
          >
            <Star size={17} className={favourite ? "fill-[#F59E0B] text-[#F59E0B]" : ""} />
          </button>
        </div>
      </div>

      {unavailable ? (
        <p className="vyron-alert vyron-alert-warning mt-3 text-xs font-medium">
          Pricing is currently unavailable for this product. Please contact us to order it.
        </p>
      ) : (
        <>
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            {perBox ? (
              <div
                role="group"
                aria-label={`${product.productName} ordering unit`}
                className="inline-flex overflow-hidden rounded-xl border border-[rgba(15,23,42,0.09)] bg-white/80 p-0.5"
              >
                {(["boxes", "units"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={mode === option}
                    onClick={() => onModeChange(option)}
                    className={`h-11 min-w-[4.25rem] rounded-lg px-3 text-xs font-bold transition ${
                      mode === option ? "vyron-grad-surface text-white shadow-[var(--vyron-elev-1)]" : "text-[#64748B] hover:text-[#334155]"
                    }`}
                  >
                    {option === "boxes" ? "Boxes" : "Units"}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="inline-flex items-center gap-1 rounded-xl border border-[rgba(15,23,42,0.09)] bg-white/80 p-0.5">
              <button
                type="button"
                aria-label={`Decrease ${product.productName}`}
                onClick={() => onChange(units - step)}
                disabled={units <= 0}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#334155] transition hover:bg-[rgba(15,23,42,0.05)] disabled:opacity-35"
              >
                <Minus size={17} />
              </button>
              <input
                value={shown}
                onChange={(e) => {
                  const entered = Number(e.target.value.replace(/\D/g, "")) || 0;
                  onChange(boxMode && perBox ? entered * perBox : entered);
                }}
                inputMode="numeric"
                aria-label={`${product.productName} quantity in ${boxMode ? "boxes" : "units"}`}
                className="h-11 w-14 rounded-lg border-0 bg-transparent text-center text-base font-black tabular-nums text-[#0F172A] outline-none focus:bg-[rgba(79,70,229,0.06)]"
              />
              <button
                type="button"
                aria-label={`Increase ${product.productName}`}
                onClick={() => onChange(units + step)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#334155] transition hover:bg-[rgba(15,23,42,0.05)]"
              >
                <Plus size={17} />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {[2, 5, 10].map((bump) => (
                <button
                  key={bump}
                  type="button"
                  onClick={() => onChange(units + bump * step)}
                  className="h-11 min-w-[2.75rem] rounded-lg border border-[rgba(15,23,42,0.07)] bg-white/70 px-2 text-xs font-bold text-[#4F46E5] transition hover:border-[var(--vyron-brand-edge)] hover:bg-[var(--vyron-brand-wash)]"
                >
                  +{bump}
                </button>
              ))}
            </div>

            {inCart ? (
              <span className="ml-auto vyron-t-display text-[1.05rem] tabular-nums text-[#0F172A]">{money(lineTotal)}</span>
            ) : null}
          </div>

          {inCart && boxMode && perBox ? (
            <p className="mt-2 text-xs font-medium text-[#64748B]">
              {shown} box{shown === 1 ? "" : "es"} × {perBox} = <span className="font-bold text-[#0F172A]">{units} units</span>
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
        orderId: String(body.order.orderId || ""),
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
      <div>
        <BackBar label="Back" onBack={onBack} />
        <div className={`${M.moduleEmptyState} mt-6`}>
          <ShoppingBag size={26} className="mx-auto text-[#CBD5E1]" />
          <p className="mt-3 vyron-t-display text-base text-[#0F172A]">Your order is empty</p>
          <p className="mt-1 text-sm font-medium text-[#64748B]">Add a few products and they will show up here.</p>
          <button type="button" onClick={onAddMore} className={`${M.primaryBtn} mt-5 h-11 px-6 text-sm`}>
            Browse products
          </button>
        </div>
      </div>
    );
  }

  const canSubmit = Boolean(chosenDate) && !view.hasUnavailable && !busy;

  return (
    <div className="pb-28">
      <BackBar label="Products" onBack={onBack} />

      <h1 className="mt-4 vyron-t-display text-[1.5rem] text-[#0F172A]">Review your order</h1>
      <p className="mt-1 text-sm font-medium text-[#64748B]">
        Check the quantities and choose when you need it.
      </p>

      {notice && (notice.skipped.length > 0 || notice.priceChanges.length > 0) ? (
        <div className="vyron-alert vyron-alert-warning mt-5">
          <p className="flex items-center gap-2 text-sm font-bold">
            <AlertTriangle size={15} /> Since your last order
          </p>
          <ul className="mt-2 space-y-1 text-sm font-medium">
            {notice.priceChanges.map((c) => (
              <li key={`p-${c.productId}`}>{c.productName}: {money(c.was)} → {money(c.now)}</li>
            ))}
            {notice.skipped.map((x) => (
              <li key={`s-${x.description}`}>{x.description} — {x.reason.toLowerCase()}, not added</li>
            ))}
          </ul>
          <button type="button" onClick={onDismissNotice} className="mt-2 text-xs font-bold underline">
            Got it
          </button>
        </div>
      ) : null}

      {priceChanges.length > 0 ? (
        <div role="alert" className="vyron-alert vyron-alert-warning mt-5">
          <p className="flex items-center gap-2 text-sm font-bold">
            <AlertTriangle size={15} /> Prices changed
          </p>
          <p className="mt-1 text-sm font-medium">Your order was not placed. These prices have been updated:</p>
          <ul className="mt-2 space-y-1 text-sm font-bold">
            {priceChanges.map((c) => (
              <li key={c.productId}>{c.productName}: {money(c.was)} → {money(c.now)}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm font-medium">
            The totals below are up to date. Tap Place order to continue at the new prices.
          </p>
        </div>
      ) : null}

      {view.hasUnavailable ? (
        <div role="alert" className="vyron-alert vyron-alert-error mt-5 text-sm font-semibold">
          Some items in your order cannot be priced right now. Please remove them or contact us to order them.
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 space-y-4">
          <section className={`${M.lightCard} overflow-hidden p-0`}>
            <div className="divide-y divide-[rgba(15,23,42,0.06)]">
              {view.lines.map((line) => {
                const boxMode = line.entryMode === "boxes" && Boolean(line.unitsPerBox);
                const step = boxMode && line.unitsPerBox ? line.unitsPerBox : 1;
                const quantity = cart.quantityOf(line.productId);
                const shown = boxMode && line.unitsPerBox ? Math.round(quantity / line.unitsPerBox) : quantity;
                return (
                  <div key={line.productId} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[0.95rem] font-bold text-[#0F172A]">{line.productName}</p>
                        <p className="mt-0.5 text-xs font-medium text-[#64748B]">
                          {money(line.sellingPrice)} / unit
                          {line.unitsPerBox ? ` · box of ${line.unitsPerBox}` : ""}
                        </p>
                        {line.unavailable ? (
                          <p className="mt-1 text-xs font-bold text-[#BE123C]">{line.unavailableReason || "Unavailable"}</p>
                        ) : null}
                      </div>
                      <span className="shrink-0 vyron-t-display text-[1.05rem] tabular-nums text-[#0F172A]">{money(line.lineTotal)}</span>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <div className="inline-flex items-center gap-1 rounded-xl border border-[rgba(15,23,42,0.09)] bg-white/80 p-0.5">
                        <button
                          type="button"
                          aria-label={`Decrease ${line.productName}`}
                          onClick={() => cart.setLine(line.productId, quantity - step, line.entryMode)}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#334155] transition hover:bg-[rgba(15,23,42,0.05)]"
                        >
                          <Minus size={17} />
                        </button>
                        <span
                          aria-label={`${line.productName} quantity`}
                          className="inline-flex h-11 min-w-[3.25rem] items-center justify-center text-base font-black tabular-nums text-[#0F172A]"
                        >
                          {shown}
                        </span>
                        <button
                          type="button"
                          aria-label={`Increase ${line.productName}`}
                          onClick={() => cart.setLine(line.productId, quantity + step, line.entryMode)}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#334155] transition hover:bg-[rgba(15,23,42,0.05)]"
                        >
                          <Plus size={17} />
                        </button>
                      </div>
                      <span className="text-xs font-medium text-[#64748B]">
                        {boxMode ? `boxes · ${quantity} units` : "units"}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${line.productName}`}
                        onClick={() => cart.setLine(line.productId, 0, line.entryMode)}
                        className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#94A3B8] transition hover:bg-[rgba(190,18,60,0.07)] hover:text-[#BE123C]"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onAddMore}
              className="flex w-full items-center justify-center gap-2 border-t border-[rgba(15,23,42,0.06)] py-4 text-sm font-bold text-[#4F46E5] transition hover:bg-[var(--vyron-brand-wash)]"
            >
              <Plus size={16} /> Add more products
            </button>
          </section>

          <section className={`${M.lightCard} p-5`}>
            <h2 className="flex items-center gap-2 vyron-t-display text-sm text-[#0F172A]">
              <CalendarDays size={15} className="text-[#4F46E5]" /> When do you need it?
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={chosenDate === option.value}
                  onClick={() => void chooseDate(option.value)}
                  className={chosenDate === option.value ? `${M.primaryBtn} h-11 px-4 text-sm` : `${M.secondaryBtn} h-11 px-4 text-sm`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <label className="mt-3.5 block">
              <span className={M.label}>Or pick a date</span>
              <input
                type="date"
                value={chosenDate}
                onChange={(e) => void chooseDate(e.target.value)}
                className={`${M.input} mt-1.5 h-11 py-0 font-semibold`}
              />
            </label>
            {dateError ? <p role="alert" className="mt-2 text-sm font-semibold text-[#BE123C]">{dateError}</p> : null}

            <label className="mt-4 block">
              <span className={M.label}>Anything we should know?</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                onBlur={() => void saveNotes(notes)}
                rows={3}
                placeholder="Delivery instructions, a contact name, a preferred time…"
                className={`${M.input} mt-1.5 font-medium`}
              />
            </label>
          </section>
        </div>

        {/* Financial summary, in the platform's own hierarchy. */}
        <div className="min-w-0 lg:sticky lg:top-24">
          <section className={`${M.lightCard} p-5`}>
            <h2 className="vyron-t-display text-sm text-[#0F172A]">Order summary</h2>
            <dl className="mt-4 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm font-medium text-[#64748B]">
                  Subtotal
                  <span className="mt-0.5 block text-xs text-[#94A3B8]">
                    {view.itemCount} product{view.itemCount === 1 ? "" : "s"} · {view.unitCount} units
                  </span>
                </dt>
                <dd className="text-sm font-bold tabular-nums text-[#334155]">{money(view.subtotal)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm font-medium text-[#64748B]">VAT</dt>
                <dd className="text-sm font-bold tabular-nums text-[#334155]">{money(view.vatAmount)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-[rgba(15,23,42,0.08)] pt-3">
                <dt className="vyron-t-label text-[11px] text-[#0F172A]">Total</dt>
                <dd className="vyron-t-display text-[1.5rem] tabular-nums text-[#0F172A]">{money(view.total)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs font-medium text-[#94A3B8]">
              Totals are calculated by us from your agreed prices and confirmed when we invoice.
            </p>

            {submitError ? (
              <p role="alert" className="vyron-alert vyron-alert-error mt-4 text-sm font-semibold">{submitError}</p>
            ) : null}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit}
              className={`${M.primaryBtn} mt-4 hidden h-12 w-full text-sm disabled:opacity-45 lg:inline-flex`}
            >
              {busy ? "Placing…" : chosenDate ? "Place order" : "Choose a date"}
            </button>
          </section>
        </div>
      </div>

      {/* Phone and tablet keep the action within thumb reach. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[rgba(15,23,42,0.07)] bg-white/85 px-4 py-3 backdrop-blur-xl backdrop-saturate-150 lg:hidden">
        <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="vyron-t-label text-[10px] text-[#64748B]">Total incl. VAT</p>
            <p className="mt-0.5 vyron-t-display text-[1.25rem] tabular-nums text-[#0F172A]">{money(view.total)}</p>
          </div>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className={`${M.primaryBtn} h-12 shrink-0 px-5 text-sm disabled:opacity-45`}
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
  confirmation, onViewOrder, onPlaceAnother,
}: { confirmation: Confirmation; onViewOrder: () => void; onPlaceAnother: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-6">
      <div className={`${M.lightCard} overflow-hidden p-0 text-center`}>
        <div className="vyron-grad-surface px-6 py-8 text-white">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur">
            <CheckCircle2 size={30} strokeWidth={2.2} />
          </span>
          <h1 className="mt-4 vyron-t-display text-[1.4rem]">
            {confirmation.duplicate ? "Already received" : "Order received"}
          </h1>
          <p className="mt-1.5 text-sm font-medium text-white/80">
            {confirmation.duplicate
              ? "This order was already placed — here it is again, not a second one."
              : "Thank you. We have your order and will confirm it shortly."}
          </p>
        </div>

        <div className="p-6">
          <dl className="space-y-3 text-left">
            <div className="flex items-center justify-between gap-3">
              <dt className="vyron-t-label text-[10px] text-[#64748B]">Order number</dt>
              <dd className="text-sm font-black text-[#0F172A]">{confirmation.orderNumber}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="vyron-t-label text-[10px] text-[#64748B]">Requested for</dt>
              <dd className="text-sm font-bold text-[#0F172A]">{formatDate(confirmation.requestedDeliveryDate)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[rgba(15,23,42,0.08)] pt-3">
              <dt className="vyron-t-label text-[11px] text-[#0F172A]">Total</dt>
              <dd className="vyron-t-display text-[1.4rem] tabular-nums text-[#0F172A]">{money(confirmation.total)}</dd>
            </div>
          </dl>

          <div className="mt-6 rounded-xl border border-[rgba(15,23,42,0.06)] bg-[rgba(15,23,42,0.02)] p-4 text-left">
            <p className="vyron-t-label text-[10px] text-[#64748B]">What happens next</p>
            <ol className="mt-2.5 space-y-1.5">
              {PROGRESS_STEPS.map((step, i) => (
                <li key={step} className="flex items-center gap-2.5 text-sm">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
                    i === 0 ? "vyron-grad-surface text-white" : "bg-[rgba(15,23,42,0.06)] text-[#94A3B8]"
                  }`}>
                    {i === 0 ? <Check size={11} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className={i === 0 ? "font-bold text-[#0F172A]" : "font-medium text-[#64748B]"}>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <p className="mt-4 text-xs font-medium text-[#94A3B8]">
            Your order has been sent to the team.
          </p>

          {/*
            Primary opens the order that was just placed; secondary starts the
            next one. Both are full-height targets on a phone.
          */}
          <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={onPlaceAnother}
              className={`${M.secondaryBtn} order-2 h-12 text-xs font-bold uppercase tracking-[0.1em] sm:order-1`}
            >
              Place another order
            </button>
            <button
              type="button"
              onClick={onViewOrder}
              className={`${M.primaryBtn} order-1 h-12 text-xs uppercase tracking-[0.1em] sm:order-2`}
            >
              View order
            </button>
          </div>
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
    <div>
      <BackBar label="Home" onBack={onBack} />
      <h1 className="mt-4 vyron-t-display text-[1.5rem] text-[#0F172A]">My orders</h1>
      <p className="mt-1 text-sm font-medium text-[#64748B]">Track and reorder anything you have placed.</p>

      {error ? (
        <p role="alert" className="vyron-alert vyron-alert-error mt-5 text-sm font-semibold">{error}</p>
      ) : orders === null ? (
        <div className="mt-5 space-y-2.5">
          {[0, 1, 2].map((i) => <div key={i} className={`${M.lightCard} h-20 animate-pulse`} />)}
        </div>
      ) : orders.length === 0 ? (
        <div className={`${M.moduleEmptyState} mt-6`}>
          <History size={26} className="mx-auto text-[#CBD5E1]" />
          <p className="mt-3 vyron-t-display text-base text-[#0F172A]">No orders yet</p>
          <p className="mt-1 text-sm font-medium text-[#64748B]">Your orders will appear here once you place one.</p>
        </div>
      ) : (
        <div className="mt-5 grid gap-2.5 md:grid-cols-2">
          {orders.map((order) => (
            <button
              key={order.orderId}
              type="button"
              onClick={() => onOpen(order.orderId)}
              className={`${M.lightCard} ${M.lightCardHover} flex items-center justify-between gap-3 p-4 text-left`}
            >
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-[#0F172A]">{order.orderNumber}</span>
                  <StatusPill status={order.customerStatus} />
                </span>
                <span className="mt-1 block text-xs font-medium text-[#64748B]">
                  {order.requestedDeliveryDate ? `For ${formatDate(order.requestedDeliveryDate)}` : formatDate(order.orderDate)}
                  {` · ${order.lineCount} product${order.lineCount === 1 ? "" : "s"}`}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2.5">
                <span className="vyron-t-display text-[1.05rem] tabular-nums text-[#0F172A]">{money(order.total)}</span>
                <ChevronRight size={16} className="text-[#94A3B8]" />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One order, as the customer sees it.
 *
 * Built like a VYRON document: a header that states what and when, a timeline
 * that answers "where is it", the products as clean lines, and the financial
 * summary in the same hierarchy the rest of the platform uses. No cost, no GP,
 * no margin — those never leave the staff side.
 */
function OrderCentreDetail({
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

  if (error && !order) {
    return (
      <div>
        <BackBar label="My orders" onBack={onBack} />
        <p role="alert" className="vyron-alert vyron-alert-error mt-5 text-sm font-semibold">{error}</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div>
        <BackBar label="My orders" onBack={onBack} />
        <div className="mt-5 space-y-3">
          <div className={`${M.lightCard} h-28 animate-pulse`} />
          <div className={`${M.lightCard} h-64 animate-pulse`} />
        </div>
      </div>
    );
  }

  // Straight from the order the engine wrote — never derived from the lines.
  const subtotal = order.subtotal;
  const vatAmount = order.vatAmount;

  return (
    <div>
      <BackBar label="My orders" onBack={onBack} />

      {error ? (
        <p role="alert" className="vyron-alert vyron-alert-error mt-4 text-sm font-semibold">{error}</p>
      ) : null}

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 space-y-4">
          <header className={`${M.lightCard} p-5 md:p-6`}>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="vyron-t-display text-[1.5rem] text-[#0F172A]">{order.orderNumber}</h1>
              <StatusPill status={order.customerStatus} />
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="vyron-t-label text-[10px] text-[#64748B]">Placed</dt>
                <dd className="mt-1 text-sm font-bold text-[#0F172A]">{formatDate(order.orderDate)}</dd>
              </div>
              <div>
                <dt className="vyron-t-label text-[10px] text-[#64748B]">Requested for</dt>
                <dd className="mt-1 text-sm font-bold text-[#0F172A]">{formatDate(order.requestedDeliveryDate)}</dd>
              </div>
              <div>
                <dt className="vyron-t-label text-[10px] text-[#64748B]">Products</dt>
                <dd className="mt-1 text-sm font-bold text-[#0F172A]">{order.lineCount}</dd>
              </div>
            </dl>
          </header>

          <section className={`${M.lightCard} overflow-hidden p-0`}>
            <h2 className="border-b border-[rgba(15,23,42,0.06)] px-5 py-4 vyron-t-display text-sm text-[#0F172A]">
              Products
            </h2>
            <div className="divide-y divide-[rgba(15,23,42,0.06)]">
              {order.lines.map((line, index) => (
                <div key={`${line.productId ?? "line"}-${index}`} className="flex items-start justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#0F172A]">{line.description}</p>
                    <p className="mt-0.5 text-xs font-medium text-[#64748B]">
                      {line.quantity} {line.unit} × {money(line.sellingPrice)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-black tabular-nums text-[#0F172A]">{money(line.lineTotal)}</span>
                </div>
              ))}
            </div>
            <dl className="space-y-2.5 border-t border-[rgba(15,23,42,0.08)] bg-[rgba(15,23,42,0.02)] px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm font-medium text-[#64748B]">Subtotal</dt>
                <dd className="text-sm font-bold tabular-nums text-[#334155]">{money(subtotal)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm font-medium text-[#64748B]">VAT</dt>
                <dd className="text-sm font-bold tabular-nums text-[#334155]">{money(vatAmount)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-[rgba(15,23,42,0.08)] pt-2.5">
                <dt className="vyron-t-label text-[11px] text-[#0F172A]">Total</dt>
                <dd className="vyron-t-display text-[1.4rem] tabular-nums text-[#0F172A]">{money(order.total)}</dd>
              </div>
            </dl>
          </section>

          {order.notes ? (
            <section className={`${M.lightCard} p-5`}>
              <h2 className="vyron-t-label text-[10px] text-[#64748B]">Your note</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm font-medium text-[#334155]">{order.notes}</p>
            </section>
          ) : null}
        </div>

        <div className="min-w-0 space-y-4 lg:sticky lg:top-24">
          <section className={`${M.lightCard} p-5`}>
            <h2 className="vyron-t-display text-sm text-[#0F172A]">Order progress</h2>
            <div className="mt-4">
              <OrderTimeline status={order.customerStatus} />
            </div>
          </section>

          <section className={`${M.lightCard} p-5`}>
            <button
              type="button"
              onClick={() => void reorder()}
              disabled={busy}
              className={`${M.primaryBtn} h-12 w-full gap-2 text-sm disabled:opacity-45`}
            >
              <RefreshCw size={16} /> {busy ? "Adding to your order…" : "Order this again"}
            </button>
            <p className="mt-2.5 text-center text-xs font-medium text-[#94A3B8]">
              We&apos;ll check today&apos;s prices and availability before you confirm.
            </p>
            <button type="button" onClick={onBack} className={`${M.secondaryBtn} mt-3 h-11 w-full text-sm`}>
              Back to orders
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
