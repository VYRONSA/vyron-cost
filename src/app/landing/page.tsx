import type { Metadata } from "next";
import VoloraLandingPage from "@/components/volora/VoloraLandingPage";

// Same page as the homepage; point search engines at the one public URL.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function LandingPage() {
  return <VoloraLandingPage />;
}
