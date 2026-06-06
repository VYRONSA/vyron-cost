import {
  calculateGpPercent,
  calculateSuggestedPrice,
  formatMoney,
  getIngredients,
  getProducts,
  getRecipes,
  getSuppliers,
} from "@/lib/vyron-cost-data";

export type AiRecommendation = {
  title: string;
  detail: string;
  impact: string;
  href: string;
  tone: "red" | "amber" | "emerald";
};

export type AiAnswer = {
  question: string;
  summary: string;
  bullets: string[];
  recommendations: AiRecommendation[];
};

export const suggestedQuestions = [
  "Which products are below target GP?",
  "Which suppliers increased prices?",
  "What can we recover?",
  "Which BOM needs review?",
  "Which invoices look suspicious?",
  "What should I do today?",
  "Create a Chicken Pie BOM",
  "Explain potential recovery",
];

export async function answerVyronQuestion(question: string): Promise<AiAnswer> {
  const normalized = question.trim().toLowerCase();
  const [products, suppliers, recipes, ingredients] = await Promise.all([
    getProducts(120),
    getSuppliers(120),
    getRecipes(120),
    getIngredients(120),
  ]);


  if (normalized.includes("create") && (normalized.includes("bom") || normalized.includes("recipe"))) {
    const productName = normalized.includes("chicken")
      ? "Chicken Pie"
      : normalized.includes("pepper")
        ? "Pepper Steak Pie"
        : "New Pie Product";

    return {
      question,
      summary: `I can guide the BOM creation for ${productName}. Open the BOM Builder and create the recipe using the Handcrafted Foods pie structure.`,
      bullets: [
        "Step 1: Open BOM Builder.",
        "Step 2: Add protein ingredient, pastry/flour ingredients, packaging and labour.",
        "Step 3: Enter yield quantity, waste percentage and target GP.",
        "Step 4: Save BOM and link it to a finished product.",
      ],
      recommendations: [
        {
          title: `Create ${productName} BOM`,
          detail: "Open the BOM Builder with ingredients, packaging, labour, overhead and wastage.",
          impact: "Build costing foundation",
          href: "/recipes/new",
          tone: "emerald" as const,
        },
        {
          title: "Open Ingredients",
          detail: "Check ingredient costs before creating the BOM.",
          impact: "Protect margin",
          href: "/ingredients",
          tone: "amber" as const,
        },
      ],
    };
  }

  if (normalized.includes("explain") && normalized.includes("recover")) {
    return {
      question,
      summary: "Potential recovery must be explained using leakage type, cause, formula, monthly value and annual value.",
      bullets: [
        "Supplier recovery = price movement exposure × recoverable negotiation rate.",
        "Margin recovery = GP gap value × monthly sales exposure.",
        "Duplicate invoice recovery = duplicate invoice exposure × 100% recoverable rate.",
        "Wastage recovery = excess wastage value × controllable recovery rate.",
      ],
      recommendations: [
        {
          title: "Open Financial Leakage",
          detail: "Click Explain on any leakage finding to see the full recovery formula.",
          impact: "Client-ready explanation",
          href: "/financial-leakage",
          tone: "emerald" as const,
        },
      ],
    };
  }


  if (normalized.includes("below target gp") || normalized.includes("below gp")) {
    const atRisk = products
      .map((p) => ({
        ...p,
        gp: calculateGpPercent(Number(p.selling_price), Number(p.total_cost)),
      }))
      .filter((p) => Number(p.selling_price) > 0 && p.gp < Number(p.target_gp || 40))
      .sort((a, b) => a.gp - b.gp)
      .slice(0, 8);

    return {
      question,
      summary: `${atRisk.length} products are currently below their target GP threshold.`,
      bullets: atRisk.map(
        (p) =>
          `${p.product_name}: ${p.gp.toFixed(1)}% GP vs ${Number(p.target_gp || 40)}% target · cost ${formatMoney(Number(p.total_cost))}`
      ),
      recommendations: atRisk.slice(0, 5).map((p) => ({
        title: `Review ${p.product_name}`,
        detail: `Increase price toward ${formatMoney(calculateSuggestedPrice(Number(p.total_cost), Number(p.target_gp || 40)))} or reduce cost.`,
        impact: formatMoney(Number(p.selling_price) - Number(p.total_cost)),
        href: `/products/${p.id}`,
        tone: p.gp < 30 ? "red" : "amber",
      })),
    };
  }

  if (normalized.includes("supplier") && (normalized.includes("hurt") || normalized.includes("increase") || normalized.includes("increased"))) {
    const ranked = [...suppliers]
      .sort((a, b) => Number(b.last_price_movement || 0) - Number(a.last_price_movement || 0))
      .slice(0, 8);
    const linkedIngredients = ingredients.filter((i) =>
      ranked.some((s) => s.category === i.category)
    );

    return {
      question,
      summary: `${ranked[0]?.supplier_name || "Top supplier"} shows the highest recent price movement.`,
      bullets: ranked.map(
        (s) =>
          `${s.supplier_name}: ${Number(s.last_price_movement || 0).toFixed(1)}% movement · risk ${s.risk_status}`
      ),
      recommendations: ranked.slice(0, 5).map((s) => ({
        title: s.supplier_name,
        detail: `${linkedIngredients.filter((i) => i.category === s.category).length} linked ingredients in ${s.category}.`,
        impact: `${Number(s.last_price_movement || 0).toFixed(1)}%`,
        href: `/suppliers/${s.id}`,
        tone: /high|critical/i.test(s.risk_status) ? "red" : "amber",
      })),
    };
  }

  if (normalized.includes("increase pricing") || normalized.includes("pricing on")) {
    const candidates = products
      .map((p) => ({
        product: p,
        gp: calculateGpPercent(Number(p.selling_price), Number(p.total_cost)),
        suggested: calculateSuggestedPrice(Number(p.total_cost), Number(p.target_gp || 40)),
      }))
      .filter((row) => row.suggested > Number(row.product.selling_price))
      .sort((a, b) => b.suggested - Number(b.product.selling_price) - (a.suggested - Number(a.product.selling_price)))
      .slice(0, 8);

    return {
      question,
      summary: `${candidates.length} products have room to increase selling price to protect GP.`,
      bullets: candidates.map(
        ({ product, gp, suggested }) =>
          `${product.product_name}: current ${formatMoney(Number(product.selling_price))} → suggested ${formatMoney(suggested)} (${gp.toFixed(1)}% GP)`
      ),
      recommendations: candidates.slice(0, 5).map(({ product, suggested }) => ({
        title: product.product_name,
        detail: `Move selling price toward ${formatMoney(suggested)}.`,
        impact: formatMoney(suggested - Number(product.selling_price)),
        href: `/products/${product.id}`,
        tone: "emerald",
      })),
    };
  }

  if (normalized.includes("losing margin") || normalized.includes("margin")) {
    const leaks = products
      .map((p) => ({
        ...p,
        gp: calculateGpPercent(Number(p.selling_price), Number(p.total_cost)),
        gap: Number(p.target_gp || 40) - calculateGpPercent(Number(p.selling_price), Number(p.total_cost)),
      }))
      .filter((p) => p.gap > 0)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 8);

    return {
      question,
      summary: `Margin leakage is concentrated in ${leaks.length} products with GP gaps above target.`,
      bullets: leaks.map((p) => `${p.product_name}: ${p.gap.toFixed(1)}% below target GP`),
      recommendations: leaks.slice(0, 5).map((p) => ({
        title: p.product_name,
        detail: "Review recipe cost, supplier movement and selling price.",
        impact: `${p.gp.toFixed(1)}% GP`,
        href: `/products/${p.id}`,
        tone: p.gap > 8 ? "red" : "amber",
      })),
    };
  }

  if (normalized.includes("recover") || normalized.includes("what can we recover")) {
    const atRisk = products.filter((p) => {
      const gp = calculateGpPercent(Number(p.selling_price), Number(p.total_cost));
      return Number(p.selling_price) > 0 && gp < Number(p.target_gp || 40);
    });
    const monthly = atRisk.reduce((sum, p) => sum + (Number(p.selling_price) - Number(p.total_cost)) * 40, 0);
    return {
      question,
      summary: `Estimated recoverable value ≈ ${formatMoney(monthly * 12)} per year using avoidable monthly loss × 12.`,
      bullets: [
        "Below-target GP recovery = (Target GP margin gap × monthly product sales) × 12",
        "Supplier negotiation recovery = (Current supplier price variance × expected monthly usage) × 12",
        "Packaging saving recovery = (Packaging cost reduction per unit × monthly units sold) × 12",
      ],
      recommendations: atRisk.slice(0, 5).map((p) => ({
        title: p.product_name,
        detail: "Open recovery opportunity detail for formula and approval.",
        impact: formatMoney((Number(p.selling_price) - Number(p.total_cost)) * 40 * 12),
        href: "/recovery-opportunities/ro-reprice",
        tone: "emerald" as const,
      })),
    };
  }

  if (normalized.includes("invoice") || normalized.includes("suspicious")) {
    return {
      question,
      summary: "Review invoice forensics and document intelligence for duplicate and variance flags.",
      bullets: [
        "Duplicate invoice risk from repeated supplier references",
        "PO invoice variance above approved expected total",
        "Extracted lines not matching ingredient or product master",
      ],
      recommendations: [
        { title: "Invoice Forensics", detail: "Review flagged invoices and duplicate risk.", impact: "High", href: "/invoice-forensics", tone: "red" as const },
        { title: "Document Intelligence", detail: "Upload and approve extracted supplier documents.", impact: "Medium", href: "/document-intelligence", tone: "amber" as const },
      ],
    };
  }

  if (normalized.includes("today") || normalized.includes("what should i do")) {
    return {
      question,
      summary: "Today's priority queue: below-target GP products, supplier movement and open recovery approvals.",
      bullets: [
        `${products.filter((p) => calculateGpPercent(Number(p.selling_price), Number(p.total_cost)) < Number(p.target_gp || 40)).length} products below target GP`,
        `${suppliers.filter((s) => Number(s.last_price_movement || 0) > 5).length} suppliers with notable price movement`,
        "Open recovery opportunities and approve repricing actions",
      ],
      recommendations: [
        { title: "Action Centre", detail: "Urgent and review queue.", impact: "Now", href: "/action-centre", tone: "red" as const },
        { title: "Recovery Opportunities", detail: "Approve recoverable value with formula shown.", impact: "High", href: "/recovery-opportunities", tone: "emerald" as const },
        { title: "Supplier Intelligence", detail: "Review negotiation opportunities.", impact: "Medium", href: "/supplier-intelligence", tone: "amber" as const },
      ],
    };
  }

  if (normalized.includes("bom") || normalized.includes("recipe")) {
    const review = recipes
      .map((r) => ({
        ...r,
        gp: calculateGpPercent(Number(r.selling_price || 0), Number(r.total_cost || 0)),
      }))
      .filter((r) => Number(r.selling_price || 0) > 0 && r.gp < Number(r.target_gp || 40))
      .slice(0, 8);

    return {
      question,
      summary: `${review.length} recipes need BOM or pricing review.`,
      bullets: review.map(
        (r) =>
          `${r.recipe_name}: ${r.gp.toFixed(1)}% GP · cost ${formatMoney(Number(r.total_cost))} · ${r.recipe_type}`
      ),
      recommendations: review.slice(0, 5).map((r) => ({
        title: r.recipe_name,
        detail: r.version_note || "Open BOM builder and validate ingredient costs.",
        impact: formatMoney(Number(r.total_cost)),
        href: `/recipes/${r.id}/edit`,
        tone: "amber",
      })),
    };
  }

  const fallbackProducts = products.slice(0, 5);
  return {
    question,
    summary: "VYRON analysed your live costing data and surfaced the highest-impact actions.",
    bullets: fallbackProducts.map(
      (p) => `${p.product_name} · ${p.category} · GP ${calculateGpPercent(Number(p.selling_price), Number(p.total_cost)).toFixed(1)}%`
    ),
    recommendations: fallbackProducts.map((p) => ({
      title: p.product_name,
      detail: "Open product detail for cost lines and margin status.",
      impact: formatMoney(Number(p.selling_price) - Number(p.total_cost)),
      href: `/products/${p.id}`,
      tone: "emerald" as const,
    })),
  };
}
