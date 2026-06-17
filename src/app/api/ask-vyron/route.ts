import { NextResponse } from "next/server";
import {
  answerAskVyronQuestion,
  buildNoWorkspaceAnswer,
  loadAskVyronContext,
} from "@/lib/vyron-ask-vyron";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireWorkspacePermission("reports.view");

    const body = await request.json().catch(() => ({}));
    const question = String(body.question || "").trim();
    if (!question) {
      return NextResponse.json({ ok: false, error: "question required" }, { status: 400 });
    }

    const context = await loadAskVyronContext();
    if (!context.hasWorkspace || !context.input) {
      return NextResponse.json({ ok: true, answer: buildNoWorkspaceAnswer() });
    }

    const answer = answerAskVyronQuestion(question, context.input);
    return NextResponse.json({ ok: true, answer });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Ask VYRON request failed.");
  }
}
