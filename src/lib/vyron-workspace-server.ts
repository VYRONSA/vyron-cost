import { HANDCRAFTED_COMPANY_ID } from "@/lib/vyron-handcrafted-intelligence";
import { isHandcraftedDataReady, isHandcraftedTenantEnabled } from "@/lib/handcrafted-tenant";
import { ACTIVE_CLIENT_KEY, readActiveClient, type ActiveClient } from "@/lib/vyron-developer-client";
import { isDemoWorkspace } from "@/lib/vyron-workspace-context";
import { parseCookieJsonValue } from "@/lib/vyron-workspace-cookie-parse";

export function parseActiveClient(raw: string | null | undefined): ActiveClient | null {
  return parseCookieJsonValue<ActiveClient>(raw);
}

export async function getServerActiveWorkspace(): Promise<ActiveClient | null> {
  if (typeof window !== "undefined") {
    return readActiveClient();
  }
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    return parseActiveClient(cookieStore.get(ACTIVE_CLIENT_KEY)?.value);
  } catch {
    return null;
  }
}

export async function shouldUseWorkspaceDemoData(): Promise<boolean> {
  const client = await getServerActiveWorkspace();
  return isHandcraftedTenantEnabled() && isHandcraftedDataReady() && isDemoWorkspace(client);
}

export async function getWorkspaceCompanyId(): Promise<string | null> {
  const client = await getServerActiveWorkspace();
  if (!client) return null;

  if (isDemoWorkspace(client)) {
    return HANDCRAFTED_COMPANY_ID;
  }

  if (client.companyId) {
    return client.companyId;
  }

  if (client.id) {
    const { getSupabaseAdmin, isSupabaseServiceRoleConfigured } = await import("@/lib/supabase-server");
    const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
    if (supabase) {
      const { data } = await supabase
        .from("vyron_workspaces")
        .select("company_id")
        .eq("id", client.id)
        .maybeSingle();
      if (data?.company_id) return String(data.company_id);
    }
    if (!client.id.startsWith("client-")) {
      return client.id;
    }
  }

  return null;
}

export async function getWorkspaceTenantId(): Promise<string | null> {
  const client = await getServerActiveWorkspace();
  if (!client || !isDemoWorkspace(client)) return null;
  return HANDCRAFTED_COMPANY_ID;
}
