# Security, Authentication & Login Fix Guide

## Overview

This document covers the comprehensive fixes applied to the login system and security hardening implemented in the BOMedia Sales application.

## Issues Fixed

### 1. **Blank Screen on App Load**
- **Root Cause**: PWAManager dynamic import pattern was incorrectly attempting to access `.PWAManager` from default export
- **Solution**: Fixed dynamic import to use proper default export pattern with `ssr: false` and loading fallback
- **File**: `/app/layout.tsx`

### 2. **Login Redirect Race Condition**
- **Root Cause**: `router.push()` and `router.refresh()` were called immediately without waiting for cookie to be set in browser
- **Solution**: Added 100ms delay after login API call before redirect, and 200ms before refresh
- **Files**: `/app/bom03/login/page.tsx`

### 3. **Missing Error Handling & Logging**
- **Root Cause**: Login endpoint had minimal validation and no audit trail
- **Solution**: Added request validation, comprehensive logging, and audit event tracking
- **File**: `/app/api/auth/login/route.ts`

## Security Enhancements

### 1. **Rate Limiting**
- **Implementation**: In-memory rate limiter with 5 failed attempts per 15 minutes
- **Lockout**: 30-minute lockout after exceeding max attempts
- **File**: `/lib/rate-limit.ts`

### 2. **Audit Logging**
- **Events Tracked**: Login attempts, successes, failures, rate limiting, unauthorized access
- **Details**: Email, IP address, user agent, timestamp, severity level
- **File**: `/lib/audit-logger.ts`

### 3. **Authentication Utilities**
- **Password Hashing**: bcryptjs with 10 salt rounds (prepared for future implementation)
- **JWT Tokens**: Token generation and verification for secure sessions (prepared for future implementation)
- **File**: `/lib/auth-utils.ts`

### 4. **Enhanced Login Page**
- **Feedback**: Displays remaining attempts before lockout
- **Warnings**: Orange warning box appears when ≤2 attempts remaining
- **Error Messages**: Specific messages for rate limiting vs invalid credentials
- **File**: `/app/bom03/login/page.tsx`

## Testing Plan

### Phase 1: Local Development Testing

#### 1.1 Test Blank Screen Fix
```bash
# The app should now load without a blank screen
# Verify the following:
- Check console for any errors
- Verify PWAManager loads correctly (check Service Worker registration)
- Test on both desktop and mobile viewports
```

#### 1.2 Test Login Form Rendering
```
- Navigate to /bom03/login
- Verify form displays correctly with all fields
- Test that form validation works for empty fields
- Check that submit button is properly enabled/disabled
```

#### 1.3 Test Successful Login Flow
```
Credentials: admin@bomedia.com / secret

Steps:
1. Enter valid email and password
2. Click "Sign In"
3. Verify success toast appears
4. Verify redirect to /bom03 occurs within 2 seconds
5. Check that session cookie is set (admin_session)
6. Verify middleware allows access to protected routes
```

#### 1.4 Test Failed Login & Rate Limiting
```
1. Enter invalid password 5 times
2. On attempts 3-4, verify warning message appears
3. After 5 failed attempts:
   - Verify "Too many failed attempts" message appears
   - Verify HTTP 429 status code returned
   - Verify user cannot login for 30 minutes
4. Check console logs for audit events
```

#### 1.5 Test Protected Routes
```
1. Try accessing /bom03 without admin_session cookie
2. Verify redirect to /bom03/login occurs
3. Login successfully
4. Verify access to /bom03 is granted
5. Try accessing /bom03/records, /bom03/inventory, etc.
```

#### 1.6 Test Logout
```
1. After successful login, navigate to /api/auth/logout
2. Verify admin_session cookie is removed
3. Verify next access to /bom03 redirects to login
```

### Phase 2: Staging Environment Testing

#### 2.1 Production-like Configuration
```
Set environment variables:
- ADMIN_EMAIL=your-admin@example.com
- ADMIN_PASSWORD=your-secure-password
- NODE_ENV=production
- JWT_SECRET=your-secret-key
```

#### 2.2 Cross-Browser Testing
- Chrome/Chromium
- Firefox
- Safari
- Edge
- Mobile Safari (iOS)
- Chrome Mobile (Android)

#### 2.3 Performance Testing
```
- Measure login page load time
- Verify no layout shift
- Check network requests (expect 1 POST to /api/auth/login)
- Verify no memory leaks in browser
```

#### 2.4 Security Testing
```
1. CSRF Protection: Verify origin checks
2. Cookie Security: Verify HttpOnly, Secure, SameSite flags
3. Password Handling: Verify password never logged
4. Session Expiration: Verify 7-day expiration works
5. IP Blocking: Verify rate limiting works per email
```

#### 2.5 Error Scenarios
```
- Network timeout
- Server error (500)
- Invalid JSON response
- Concurrent login attempts
- Browser storage disabled
```

### Phase 3: Production Deployment

#### 3.1 Pre-Deployment Checklist
- [ ] All tests pass in staging
- [ ] Environment variables configured
- [ ] SSL/TLS certificate valid
- [ ] Database backed up
- [ ] Rollback plan documented
- [ ] Monitoring configured
- [ ] Error tracking enabled

#### 3.2 Deployment Steps
```bash
# 1. Build for production
npm run build

# 2. Run production tests
npm run test

# 3. Deploy to production
npm run deploy

# 4. Monitor logs
tail -f /var/log/app.log

# 5. Smoke tests
curl https://yourdomain.com/bom03/login
curl -X POST https://yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@bomedia.com","password":"secret"}'
```

#### 3.3 Monitoring & Alerts
```
Monitor these metrics:
- Login success rate (should be >95%)
- Rate limit triggers (should be low for legitimate users)
- Login page load time (should be <1s)
- Failed request count
- Audit log events

Set alerts for:
- >10 rate limit blocks per hour
- Login failure rate >20%
- API response time >5s
- Error rate >1%
```

## Configuration

### Environment Variables Required
```
# Required
ADMIN_EMAIL=admin@bomedia.com
ADMIN_PASSWORD=secret

# Optional (recommended for production)
JWT_SECRET=your-secret-key-here
NODE_ENV=production
```

### Cookie Settings
```
Name: admin_session
Value: authenticated
HttpOnly: true
Secure: true (production only)
SameSite: lax
Path: /
MaxAge: 604800 (7 days)
```

## Future Improvements

### 1. Database-Backed Credentials
```typescript
// Replace hardcoded credentials with database queries
const user = await db.admins.findOne({ email });
const isValid = await comparePasswords(password, user.passwordHash);
```

### 2. JWT Implementation
```typescript
// Use JWT tokens instead of simple session strings
const token = generateToken(email);
response.cookies.set({
  name: "admin_token",
  value: token,
  httpOnly: true,
  // ...
});
```

### 3. Multi-Factor Authentication
```typescript
// Add 2FA support
if (user.mfaEnabled) {
  // Send OTP to registered device
  // Verify OTP before granting access
}
```

### 4. Redis-Based Rate Limiting
```typescript
// Distributed rate limiting for multi-server deployments
import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();
// Use redis for tracking attempts across servers
```

### 5. External Audit Log Service
```typescript
// Send audit logs to Sentry, DataDog, or CloudWatch
import * as Sentry from "@sentry/nextjs";
Sentry.captureEvent(auditEvent);
```

## Troubleshooting

### Issue: Blank Screen on Load
```
Solution: Check browser console for errors
- Look for PWAManager errors
- Check if Service Worker registration fails
- Verify layout.tsx dynamic import is correct
```

### Issue: Login Always Fails
```
Solution: Verify credentials and environment variables
- Check ADMIN_EMAIL matches input email
- Check ADMIN_PASSWORD matches input password
- Check for console errors in login endpoint
```

### Issue: Rate Limit Not Working
```
Solution: Check rate limit store in memory
- Rate limits reset on server restart (use Redis for persistence)
- Verify email is being tracked correctly
- Check rate limit utility is imported in login route
```

### Issue: Redirect Doesn't Work
```
Solution: Check router and cookie timing
- Verify delay between API call and router.push()
- Check if cookie is actually being set (DevTools -> Application -> Cookies)
- Look for middleware blocking redirect
```

## Support

For issues or questions:
1. Check the console logs for [v0] debug messages
2. Review audit logs in /tmp/audit.log
3. Check middleware logs for routing issues
4. Enable verbose logging: `DEBUG=* npm run dev`

---

**Last Updated**: April 25, 2026
**Version**: 1.0.0
