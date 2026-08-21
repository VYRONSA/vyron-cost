import { getServerActiveWorkspace } from "@/lib/vyron-workspace-server";

/**
 * The company name a report is produced for.
 *
 * Reports are client deliverables, so the company has to appear on the document
 * itself. It is read from the active workspace the operator is signed into —
 * never hard-coded, and never inferred from the data, so a workspace with no
 * rows still prints under the right name.
 */
export async function getReportCompanyName(): Promise<string> {
  const workspace = await getServerActiveWorkspace();
  return workspace?.companyName || workspace?.tradingName || "VYRON COST Workspace";
}
