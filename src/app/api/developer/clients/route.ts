import { NextRequest, NextResponse } from "next/server";
import { createClientWorkspace, listClientWorkspaces, type CreateClientInput } from "@/lib/vyron-saas-workspace";

export const runtime = "nodejs";

function serializeServerError(error: unknown) {
  if (error instanceof Error) {
    const e = error as Error & { step?: string; cause?: unknown };
    return {
      step: e.step || "unknown",
      message: e.message,
      cause:
        e.cause instanceof Error
          ? e.cause.message
          : typeof e.cause === "string"
            ? e.cause
            : e.cause
              ? JSON.stringify(e.cause)
              : null,
      stack: e.stack || null,
    };
  }

  return {
    step: "unknown",
    message: typeof error === "string" ? error : "Client creation failed.",
    cause: null,
    stack: null,
  };
}

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
  console.log("[developer/clients][POST] start");
  try {
    const body = (await request.json()) as CreateClientInput;
    console.log("[developer/clients][POST] payload parsed", {
      companyName: body.companyName,
      tradingName: body.tradingName,
      adminEmail: body.admin?.email,
      loginMethod: body.loginSetup?.method,
    });

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
    const details = serializeServerError(error);
    const rawError = error instanceof Error ? error.toString() : String(error);
    console.error("[developer/clients][POST] failed", details);
    return NextResponse.json(
      {
        ok: false,
        step: details.step,
        message: details.message,
        cause: details.cause,
        stack: details.stack,
        error: rawError,
      },
      { status: 400 }
    );
  } finally {
    console.log("[developer/clients][POST] end");
  }
}
