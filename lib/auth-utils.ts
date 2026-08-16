/**
 * Resolves the HMAC key used to sign and verify session tokens.
 *
 * This used to fall back to a hardcoded constant when ADMIN_PASSWORD was
 * unset. In a public repository that meant the signing key was readable by
 * anyone, so a missing environment variable would have let a stranger forge an
 * admin_session cookie. It now refuses to sign anything in production rather
 * than quietly signing with a guessable key — the same fail-closed behaviour
 * the login route already uses for credentials.
 *
 * SESSION_SECRET is preferred, with ADMIN_PASSWORD accepted as a fallback so
 * existing sessions stay valid. They should not stay the same value: the login
 * password and the token signing key are separate concerns, and sharing one
 * means rotating the password silently signs every user out.
 *
 * Resolved per call rather than at module load, so a misconfiguration surfaces
 * as a clear auth failure instead of preventing the app from booting at all.
 */
function getSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (secret) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET is not set. Refusing to sign session tokens with a " +
      "default key in production."
    );
  }

  return "dev-only-insecure-session-secret";
}

async function getSigningKey() {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(getSecret()),
    { name: "HMAC", hash: { name: "SHA-256" } },
    false,
    ["sign", "verify"]
  );
}

/**
 * Creates a cryptographically signed token.
 * @param payload Arbitrary JSON payload
 * @param durationMs Token lifetime in milliseconds (default 7 days)
 */
export async function signToken(payload: any, durationMs: number = 7 * 24 * 60 * 60 * 1000): Promise<string> {
  const enc = new TextEncoder();
  const fullPayload = {
    ...payload,
    exp: Date.now() + durationMs,
  };
  const payloadStr = JSON.stringify(fullPayload);
  const key = await getSigningKey();
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(payloadStr)
  );

  // Convert signature (ArrayBuffer) to hex
  const sigHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Base64 encode the payload safely
  const payloadB64 = btoa(encodeURIComponent(payloadStr));
  return `${payloadB64}.${sigHex}`;
}

/**
 * Verifies a cryptographically signed token.
 * @param token Signed token string
 * @returns Decoded payload if valid, null otherwise
 */
export async function verifyToken(token: string): Promise<any | null> {
  if (!token) return null;
  try {
    const [payloadB64, sigHex] = token.split(".");
    if (!payloadB64 || !sigHex) return null;

    const payloadStr = decodeURIComponent(atob(payloadB64));
    const payload = JSON.parse(payloadStr);

    // Check expiration
    if (payload.exp && Date.now() > payload.exp) {
      return null;
    }

    const enc = new TextEncoder();
    const key = await getSigningKey();

    // Convert hex signature back to Uint8Array
    const sigBytes = new Uint8Array(
      sigHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );

    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      enc.encode(payloadStr)
    );

    return isValid ? payload : null;
  } catch (e) {
    return null;
  }
}
