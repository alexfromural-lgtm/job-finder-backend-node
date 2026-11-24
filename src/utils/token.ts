// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/utils/token.ts  — JWT generation and verification helpers
//
// CONCEPT: JSON Web Tokens (JWT)
//   A JWT is a compact, self-contained token that proves identity without
//   hitting the database on every request.
//   Structure: <base64 header>.<base64 payload>.<signature>
//   EXAMPLE: "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiIxMjMifQ.abc123"
//
//   The server signs the payload with a secret key. Anyone can read the payload
//   (it's just base64), but only the server can create a valid signature.
//   On each request the server verifies the signature — no DB lookup needed.
//
// TWO-TOKEN PATTERN (Access + Refresh):
//   • Access token  → short-lived (15 min). Stored in an httpOnly cookie.
//     Used to authenticate every API call.
//   • Refresh token → long-lived (7 days). Stored in a separate httpOnly cookie.
//     Used ONLY to get a new access token when the old one expires.
//     This limits the blast radius if an access token is ever stolen.
//
// COOKIE STRATEGY (not localStorage):
//   Both tokens are stored in httpOnly cookies. JavaScript cannot read httpOnly
//   cookies, so XSS attacks cannot steal the tokens.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { ENV } from '../config/env';

// ── Token payload type ────────────────────────────────────────────────────────
// This is the data we embed inside every JWT.
// userId lets us look up the user, roles let us skip a DB lookup for auth checks.
// EXAMPLE payload (decoded): { userId: "uuid-123", roles: ["JOB_SEEKER"], iat: 1700000000, exp: 1700000900 }
export interface TokenPayload {
  userId: string;
  roles: Role[];  // e.g. ['JOB_SEEKER'] or ['RECRUITER'] or ['JOB_SEEKER', 'RECRUITER']
}

// ── Access Token ──────────────────────────────────────────────────────────────

/**
 * Creates a short-lived JWT access token.
 * Short lifespan (15 min) limits damage if the token is somehow compromised.
 *
 * EXAMPLE:
 *   const token = generateAccessToken('user-uuid', ['JOB_SEEKER']);
 *   // → "eyJ…" (a signed JWT string)
 */
export const generateAccessToken = (userId: string, roles: Role[]): string => {
  // jwt.sign(payload, secret, options) → token string
  // expiresIn adds an `exp` claim to the payload automatically.
  // EXAMPLE: expiresIn: '15m' → token expires 15 minutes from now
  return jwt.sign(
    { userId, roles } satisfies TokenPayload,  // payload embedded in the token
    ENV.ACCESS_TOKEN_SECRET,                    // secret used to sign (kept on server)
    { expiresIn: ENV.ACCESS_TOKEN_EXPIRES_IN }  // '15m'
  );
};

/**
 * Verifies an access token and returns its decoded payload.
 * Throws if the token is expired, malformed, or signed with the wrong secret.
 *
 * EXAMPLE:
 *   try {
 *     const payload = verifyAccessToken(req.cookies.accessToken);
 *     req.userId = payload.userId; // 'user-uuid'
 *   } catch {
 *     res.status(401).json({ error: 'Invalid token' });
 *   }
 */
export const verifyAccessToken = (token: string): TokenPayload => {
  // jwt.verify() throws JsonWebTokenError or TokenExpiredError on failure.
  // The `as TokenPayload` cast is safe here because we control what we sign.
  return jwt.verify(token, ENV.ACCESS_TOKEN_SECRET) as TokenPayload;
};

// ── Refresh Token ─────────────────────────────────────────────────────────────

/**
 * Creates a long-lived JWT refresh token (7 days).
 * Sent only to POST /api/auth/refresh — never used for resource access directly.
 *
 * EXAMPLE:
 *   const refresh = generateRefreshToken('user-uuid', ['RECRUITER']);
 */
export const generateRefreshToken = (userId: string, roles: Role[]): string => {
  return jwt.sign(
    { userId, roles } satisfies TokenPayload,
    ENV.REFRESH_TOKEN_SECRET,                    // different secret from access token
    { expiresIn: ENV.REFRESH_TOKEN_EXPIRES_IN }  // '7d'
  );
};

/**
 * Verifies a refresh token and returns its payload.
 * Uses the REFRESH_TOKEN_SECRET — a different secret from access tokens,
 * so a leaked access secret cannot be used to forge refresh tokens.
 *
 * EXAMPLE:
 *   const payload = verifyRefreshToken(req.cookies.refreshToken);
 *   const newTokens = await generateTokensForUser(payload.userId, payload.roles);
 */
export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, ENV.REFRESH_TOKEN_SECRET) as TokenPayload;
};
