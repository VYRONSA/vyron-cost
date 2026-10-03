import type { Metadata } from "next";
import VoloraLandingPage from "@/components/volora/VoloraLandingPage";
import { VOLORA_DESCRIPTION, VOLORA_SITE_URL, VOLORA_TITLE, VYRONSOFT } from "@/lib/volora-site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  // openGraph merges shallowly, so the homepage restates the layout's values and adds its URL.
  openGraph: {
    type: "website",
    url: "/",
    siteName: "VOLORA",
    title: VOLORA_TITLE,
    description: VOLORA_DESCRIPTION,
    images: [{ url: "/og-volora.png", width: 1200, height: 630, alt: "VOLORA — Turn every cost into a more profitable tomorrow." }],
  },
};

const ORGANIZATION_ID = `${VYRONSOFT.url}#organization`;

// Only facts the site itself states. No logo, sameAs, contact details, offers or
// ratings: none are published for VYRONSOFT or VOLORA yet.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": ORGANIZATION_ID,
      name: VYRONSOFT.name,
      legalName: VYRONSOFT.name,
      url: VYRONSOFT.url,
      slogan: VYRONSOFT.statement,
    },
    {
      "@type": "WebSite",
      "@id": `${VOLORA_SITE_URL}/#website`,
      name: "VOLORA™",
      alternateName: "VOLORA",
      url: `${VOLORA_SITE_URL}/`,
      inLanguage: "en",
      publisher: { "@id": ORGANIZATION_ID },
    },
    {
      "@type": "WebPage",
      "@id": `${VOLORA_SITE_URL}/#webpage`,
      url: `${VOLORA_SITE_URL}/`,
      name: VOLORA_TITLE,
      description: VOLORA_DESCRIPTION,
      inLanguage: "en",
      isPartOf: { "@id": `${VOLORA_SITE_URL}/#website` },
      about: { "@id": `${VOLORA_SITE_URL}/#software` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${VOLORA_SITE_URL}/#software`,
      name: "VOLORA™",
      alternateName: "VOLORA",
      applicationCategory: "BusinessApplication",
      description: VOLORA_DESCRIPTION,
      url: `${VOLORA_SITE_URL}/`,
      featureList: [
        "Cost and margin intelligence",
        "Recipe and BOM costing",
        "Inventory and procurement control",
        "Production and yield analysis",
        "Waste and variance tracking",
        "Customer and product profitability",
        "Xero integration",
        "AI-powered insights and recommendations",
      ],
      creator: { "@id": ORGANIZATION_ID },
      publisher: { "@id": ORGANIZATION_ID },
    },
  ],
};

export default function LandingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\u003c") }} />
      <VoloraLandingPage />
    </>
  );
}
