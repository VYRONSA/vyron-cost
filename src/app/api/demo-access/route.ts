import { NextResponse } from "next/server";
import { DEMO_ACCESS_COOKIE } from "@/lib/demo-access";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirect = url.searchParams.get("redirect") || "/dashboard";

  const response = NextResponse.redirect(new URL(redirect, request.url));
  response.cookies.set(DEMO_ACCESS_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}
