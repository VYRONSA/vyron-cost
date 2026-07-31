import type { VyronProductDefinition } from "@/platform/types";

export const VYRON_PAY_PRODUCT: VyronProductDefinition = {
  id: "vyron_pay",
  name: "VYRON PAY",
  shortName: "PAY",
  tagline: "Payments, collections and finance operations for VYRON tenants.",
  theme: {
    primary: "#059669",
    accent: "#8B5CF6",
    label: "PAY",
  },
  packages: ["professional", "enterprise"],
  landingPath: "/",
  status: "planned",
};
