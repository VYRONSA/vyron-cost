"use client";

import { createContext, useContext } from "react";
import type { CompanyBranding } from "@/lib/platform/branding/BrandingTypes";

const BrandingContext = createContext<CompanyBranding | null>(null);

export function BrandingProvider({
  branding,
  children,
}: {
  branding: CompanyBranding;
  children: React.ReactNode;
}) {
  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
