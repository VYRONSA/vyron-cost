import { NextRequest, NextResponse } from "next/server";
import { markConnectionConnecting } from "@/lib/vyron-xero-connection-store";
import { buildXeroOAuthUrl, isXeroOAuthConfigured } from "@/lib/vyron-xero-integration";
import { requireXeroWorkspaceContext, xeroContextFromRequest } from "@/lib/vyron-xero-api-context";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

function xeroRedirect(appUrl: string, params: Record<string, string>) {
  const url = new URL("/integrations/xero", appUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

  try {
    await requireWorkspacePermission("xero.connect");
    const { workspaceId, companyId } = await requireXeroWorkspaceContext(xeroContextFromRequest(request));

    if (!isXeroOAuthConfigured()) {
      return xeroRedirect(appUrl, {
        xero: "error",
        message: "Xero OAuth is not configured. Set XERO_CLIENT_ID, XERO_CLIENT_SECRET and XERO_REDIRECT_URI.",
      });
    }

    const oauthUrl = buildXeroOAuthUrl(workspaceId, companyId);
    if (!oauthUrl) {
      return xeroRedirect(appUrl, {
        xero: "error",
        message: "Unable to start Xero OAuth.",
      });
    }

    await markConnectionConnecting(workspaceId, "user", companyId);
    return NextResponse.redirect(oauthUrl);
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Xero connect failed.");
  }
}
