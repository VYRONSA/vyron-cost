import { NextRequest, NextResponse } from "next/server";
import { createClientWorkspace, listClientWorkspaces, type CreateClientInput } from "@/lib/vyron-saas-workspace";

export const runtime = "nodejs";

export async function GET() {
  try {
    const workspaces = await listClientWorkspaces();
    return NextResponse.json({ ok: true, workspaces });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Client list failed." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateClientInput;
    const result = await createClientWorkspace(body);

    const email = result.ownerDetails.email;
    const loginNote = !result.authProvisioned
      ? `NO LOGIN CREATED for ${email}.`
      : result.ownerDetails.loginStatus === "invited"
        ? `Invitation email sent to ${email}.`
        : `LOGIN ACTIVE — ${email} can sign in with the temporary password.`;

    return NextResponse.json({
      ok: true,
      workspace: result.workspace,
      owner: result.owner,
      ownerDetails: result.ownerDetails,
      authProvisioned: result.authProvisioned,
      message: `Workspace created. ${loginNote}`,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Client creation failed." },
      { status: 400 }
    );
  }
}
