import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    // Validate input
    if (!email || !password) {
      console.log("[v0] Login attempt with missing credentials");
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const expectedEmail = process.env.ADMIN_EMAIL || "admin@bomedia.com";
    const expectedPassword = process.env.ADMIN_PASSWORD || "secret";

    // Log login attempts (without passwords)
    console.log(`[v0] Login attempt for email: ${email}`);

    if (email === expectedEmail && password === expectedPassword) {
      console.log(`[v0] Login successful for: ${email}`);
      const response = NextResponse.json({ success: true });
      
      // Set an HttpOnly cookie for the session
      response.cookies.set({
        name: "admin_session",
        value: "authenticated",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 1 week
      });

      return response;
    }

    console.log(`[v0] Login failed - invalid credentials for: ${email}`);
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  } catch (error) {
    console.error("[v0] Login endpoint error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
