import { NextResponse } from "next/server";
import { auditorGlobalSearch } from "@/lib/vyron-enterprise-platform";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") || "";
  try {
    const results = await auditorGlobalSearch(q);
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Search failed" }, { status: 500 });
  }
}
