import { NextResponse } from "next/server";
import { answerEnterpriseAi } from "@/lib/vyron-enterprise-platform-architecture";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const question = String(body.question || "").trim();
    if (!question) return NextResponse.json({ ok: false, error: "question required" }, { status: 400 });
    const answer = await answerEnterpriseAi(question);
    return NextResponse.json({ ok: true, answer });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
