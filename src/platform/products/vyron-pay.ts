import type { VyronProductDefinition } from "@/platform/types";

export const VYRON_PAY_PRODUCT: VyronProductDefinition = {
  id: "vyron_pay",
  name: "VOLORA Pay",
  shortName: "PAY",
  tagline: "Payments, collections and finance operations for VOLORA tenants.",
  theme: {
    primary: "#3E9B52",
    accent: "#8B5CF6",
    label: "PAY",
  },
  packages: ["professional", "enterprise"],
  landingPath: "/",
  status: "planned",
};
