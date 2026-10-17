import { postgresAuthEnabled } from '@/lib/server/auth-backend';
import { postgresLogout } from '@/lib/server/postgres-auth-routes';
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function POST() {
  if (postgresAuthEnabled()) return postgresLogout();
  const response = NextResponse.json({ success: true });
  
  response.cookies.delete("admin_session");
  response.cookies.delete("cashier_session");

  return response;
}

