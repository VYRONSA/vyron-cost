import { NextResponse } from "next/server";
import { enterpriseGlobalSearch } from "@/lib/vyron-enterprise-platform-architecture";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") || "";
  try {
    const results = await enterpriseGlobalSearch(q);
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
