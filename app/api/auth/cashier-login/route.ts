import { NextResponse } from "next/server";
import { getDoc } from "@/lib/google-sheets";
import { signToken } from "@/lib/auth-utils";

export const dynamic = 'force-dynamic';

const SHEET_TITLE = 'Cashiers';

export async function POST(request: Request) {
  try {
    const { name, passcode } = await request.json();

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const doc = await getDoc();
    const sheet = doc.sheetsByTitle[SHEET_TITLE];
    if (!sheet) {
      return NextResponse.json({ error: "Cashier configuration not found on server." }, { status: 500 });
    }

    const rows = await sheet.getRows();
    const row = rows.find((r: any) => r.get('Name')?.trim() === name.trim());
    if (!row) {
      return NextResponse.json({ error: "Cashier not found." }, { status: 404 });
    }

    const rawSheetPasscode = (row.get('Passcode') || '').toString().trim();
    const sheetPasscode = rawSheetPasscode.startsWith("'") ? rawSheetPasscode.slice(1) : rawSheetPasscode;

    // Verification check:
    // If a PIN is configured in the sheet, it must match.
    // If no PIN is configured in the sheet (empty), we allow login for a seamless transition.
    if (sheetPasscode !== "") {
      if (!passcode || passcode.toString().trim() !== sheetPasscode) {
        return NextResponse.json({ error: "Invalid PIN. Please try again." }, { status: 401 });
      }
    }

    // Cryptographically sign the cashier session token
    const token = await signToken({ role: "cashier", name });

    const response = NextResponse.json({ success: true, name });

    // Set HttpOnly signed session cookie
    response.cookies.set({
      name: "cashier_session",
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });

    return response;
  } catch (error: any) {
    console.error("Cashier Login Route Error:", error);
    return NextResponse.json({ error: "Internal server authentication error" }, { status: 500 });
  }
}
