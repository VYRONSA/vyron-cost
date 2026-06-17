import { NextResponse } from "next/server";
import {
  getXeroOAuthScopes,
  getXeroRedirectUri,
} from "@/lib/vyron-xero-integration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    scopes: getXeroOAuthScopes(),
    redirectUri: getXeroRedirectUri(),
    hasClientId: Boolean(process.env.XERO_CLIENT_ID?.trim()),
    hasClientSecret: Boolean(process.env.XERO_CLIENT_SECRET?.trim()),
    nodeEnv: process.env.NODE_ENV || "development",
  });
}
