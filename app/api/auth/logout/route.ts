import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ success: true });
  
  response.cookies.delete("admin_session");
  response.cookies.delete("cashier_session");

  return response;
}

