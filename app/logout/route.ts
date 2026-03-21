import { NextResponse } from "next/server";
import { clearAdminSession } from "@/src/lib/auth";

export async function GET(request: Request) {
  await clearAdminSession();

  const url = new URL("/", request.url);
  return NextResponse.redirect(url);
}