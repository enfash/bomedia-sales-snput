import { NextResponse } from 'next/server';
import { postgresAuthEnabled } from '@/lib/server/auth-backend';
import { postgresStaffAccessChange, postgresStaffAccessOverview } from '@/lib/server/postgres-auth-routes';

export const dynamic = 'force-dynamic';
const unavailable = () => NextResponse.json({ error: 'Sign-in management needs the Postgres sign-in backend.' }, { status: 501 });

export async function GET() { return postgresAuthEnabled() ? postgresStaffAccessOverview() : unavailable(); }
export async function POST(request: Request) { return postgresAuthEnabled() ? postgresStaffAccessChange(request) : unavailable(); }
