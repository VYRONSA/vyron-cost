import { readActiveClient } from "@/lib/vyron-developer-client";

export function poApiWorkspaceContext() {
  const client = readActiveClient();
  const params = new URLSearchParams();
  const body: Record<string, string> = {};
  if (client?.id) {
    params.set("workspaceId", client.id);
    body.workspaceId = client.id;
  }
  if (client?.companyId) {
    params.set("companyId", client.companyId);
    body.companyId = client.companyId;
  }
  const query = params.toString();
  return { query: query ? `?${query}` : "", body };
}
