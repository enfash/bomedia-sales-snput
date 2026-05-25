import { NextResponse } from "next/server";
import { signToken } from "@/lib/auth-utils";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    const isProd = process.env.NODE_ENV === "production";
    const expectedEmail = process.env.ADMIN_EMAIL || (isProd ? null : "admin@bomedia.com");
    const expectedPassword = process.env.ADMIN_PASSWORD || (isProd ? null : "secret");

    if (!expectedEmail || !expectedPassword) {
      return NextResponse.json(
        { error: "Admin credentials are not configured on the production server." },
        { status: 500 }
      );
    }

    if (email === expectedEmail && password === expectedPassword) {
      const response = NextResponse.json({ success: true });
      
      // Cryptographically sign the session token
      const token = await signToken({ role: "admin", email });

      // Set an HttpOnly cookie for the session
      response.cookies.set({
        name: "admin_session",
        value: token,
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 1 week
      });

      return response;
    }

    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

