import { NextResponse } from "next/server";
import { isRateLimited, recordFailedAttempt, clearRateLimit, getRemainingAttempts } from "@/lib/rate-limit";
import { logAuditEvent, AuditEventType, getClientIP, getUserAgent, getEventSeverity } from "@/lib/audit-logger";

export async function POST(request: Request) {
  const clientIP = getClientIP(request);
  const userAgent = getUserAgent(request);

  try {
    const { email, password } = await request.json();

    // Validate input
    if (!email || !password) {
      console.log("[v0] Login attempt with missing credentials");
      logAuditEvent({
        type: AuditEventType.LOGIN_ATTEMPT,
        email: email || "unknown",
        ipAddress: clientIP,
        userAgent,
        details: { reason: "missing_credentials" },
        severity: getEventSeverity(AuditEventType.LOGIN_ATTEMPT),
      });
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    // Check rate limiting
    if (isRateLimited(email)) {
      console.log(`[v0] Login rate limited for: ${email}`);
      logAuditEvent({
        type: AuditEventType.LOGIN_RATE_LIMITED,
        email,
        ipAddress: clientIP,
        userAgent,
        severity: getEventSeverity(AuditEventType.LOGIN_RATE_LIMITED),
      });
      return NextResponse.json(
        { error: "Too many failed attempts. Please try again later." },
        { status: 429 }
      );
    }

    const expectedEmail = process.env.ADMIN_EMAIL || "admin@bomedia.com";
    const expectedPassword = process.env.ADMIN_PASSWORD || "secret";

    // Log login attempts (without passwords)
    console.log(`[v0] Login attempt for email: ${email}`);
    logAuditEvent({
      type: AuditEventType.LOGIN_ATTEMPT,
      email,
      ipAddress: clientIP,
      userAgent,
      severity: getEventSeverity(AuditEventType.LOGIN_ATTEMPT),
    });

    if (email === expectedEmail && password === expectedPassword) {
      console.log(`[v0] Login successful for: ${email}`);
      
      // Clear rate limit on successful login
      clearRateLimit(email);
      
      logAuditEvent({
        type: AuditEventType.LOGIN_SUCCESS,
        email,
        ipAddress: clientIP,
        userAgent,
        severity: getEventSeverity(AuditEventType.LOGIN_SUCCESS),
      });
      
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

    // Record failed attempt
    const attempts = recordFailedAttempt(email);
    const remaining = getRemainingAttempts(email);
    
    console.log(`[v0] Login failed - invalid credentials for: ${email} (attempt ${attempts})`);
    
    logAuditEvent({
      type: AuditEventType.LOGIN_FAILURE,
      email,
      ipAddress: clientIP,
      userAgent,
      details: { attemptNumber: attempts, remainingAttempts: remaining },
      severity: getEventSeverity(AuditEventType.LOGIN_FAILURE),
    });
    
    return NextResponse.json(
      { 
        error: "Invalid credentials",
        attemptsRemaining: remaining
      }, 
      { status: 401 }
    );
  } catch (error) {
    console.error("[v0] Login endpoint error:", error);
    logAuditEvent({
      type: AuditEventType.LOGIN_FAILURE,
      ipAddress: clientIP,
      userAgent,
      details: { error: error instanceof Error ? error.message : "unknown" },
      severity: "critical",
    });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
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
