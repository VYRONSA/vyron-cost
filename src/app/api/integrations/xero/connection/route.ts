import { NextRequest, NextResponse } from "next/server";
import {
  buildXeroOAuthUrl,
  defaultXeroConnection,
  demoXeroConnection,
  type XeroConnectionState,
} from "@/lib/vyron-xero-integration";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

const memoryStore = new Map<string, XeroConnectionState>();

async function readConnection(workspaceId: string): Promise<XeroConnectionState> {
  if (isSupabaseServiceRoleConfigured()) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase
        .from("vyron_xero_workspace_settings")
        .select("connection")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (data?.connection) return data.connection as XeroConnectionState;
    }
  }
  return memoryStore.get(workspaceId) || defaultXeroConnection();
}

async function writeConnection(workspaceId: string, connection: XeroConnectionState) {
  memoryStore.set(workspaceId, connection);
  if (isSupabaseServiceRoleConfigured()) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      await supabase.from("vyron_xero_workspace_settings").upsert({
        workspace_id: workspaceId,
        connection,
        updated_at: new Date().toISOString(),
      });
    }
  }
}

export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("clientId") || "default";
  const connection = await readConnection(workspaceId);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  return NextResponse.json({
    ok: true,
    connection,
    oauthReady: Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET),
    oauthUrl: buildXeroOAuthUrl(appUrl),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const workspaceId = String(body.clientId || "default");
  const action = String(body.action || "");

  if (action === "disconnect") {
    const disconnected = defaultXeroConnection();
    await writeConnection(workspaceId, disconnected);
    return NextResponse.json({ ok: true, connection: disconnected });
  }

  if (action === "connect") {
    const connected = demoXeroConnection(String(body.organisationName || "VYRON COST Client"));
    await writeConnection(workspaceId, connected);
    return NextResponse.json({ ok: true, connection: connected });
  }

  if (action === "touch-sync") {
    const current = await readConnection(workspaceId);
    const updated = { ...current, lastSyncAt: new Date().toISOString() };
    await writeConnection(workspaceId, updated);
    return NextResponse.json({ ok: true, connection: updated });
  }

  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}
