/**
 * Public identity of the VOLORA website and the VYRONSOFT software ecosystem.
 * Shared by the root metadata, the homepage JSON-LD, robots/sitemap and the
 * landing-page footer so every surface states the same names and URLs.
 */

export const VOLORA_SITE_URL = "https://www.volora.co.za";

export const VOLORA_TITLE = "VOLORA™ | Cost Intelligence for Manufacturing & Food Manufacturing";

export const VOLORA_DESCRIPTION =
  "VOLORA™ is Cost Intelligence for manufacturing and food manufacturing businesses — recipe and BOM costing, inventory and procurement control, production and yield analysis, and margin visibility in one platform.";

export const VYRONSOFT = {
  name: "VYRONSOFT (Pty) Ltd",
  url: "https://www.vyronsoft.co.za/",
  statement: "BUSINESS INTELLIGENCE FOR A STRONGER TOMORROW.",
} as const;

/** Identical on every VYRONSOFT product site; order and wording are fixed. */
export const VYRONSOFT_ECOSYSTEM = [
  { name: "VOLORA™", descriptor: "Cost Intelligence", url: "https://www.volora.co.za/" },
  { name: "UMORA™", descriptor: "Human & Workforce Intelligence", url: "https://www.umora.co.za/" },
  { name: "LAVORARE™", descriptor: "Workforce & Payroll Intelligence", url: "https://www.lavorare.co.za/" },
  { name: "SAFENZA™", descriptor: "Safety Intelligence", url: "https://www.safenza.co.za/" },
  { name: "PROVENA™", descriptor: "Sustainability & Compliance Intelligence", url: "https://www.provena.co.za/" },
  { name: "PRECISIA™", descriptor: "Finance Intelligence", url: "https://www.precisia.co.za/" },
] as const;
