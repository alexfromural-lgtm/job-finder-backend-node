// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/utils/auth.utils.ts  — Shared auth helpers (cookie setting, token generation, etc.)
//
// WHY UTILITY HELPERS?
//   Auth logic (setting cookies, generating tokens, error mapping) is needed in
//   multiple places (signup, login, token refresh, role upgrade).
//   Extracting these into a utils file avoids duplicating the same 10-line
//   blocks in every controller and keeps each function testable in isolation.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Response } from 'express';
import { Role } from '@prisma/client';
import { AppError } from '../errors/AppError';
import { generateAccessToken, generateRefreshToken } from './token';
import { IS_PRODUCTION, ENV } from '../config/env';
import prisma from '../prisma/client';

// ── Credential validation ─────────────────────────────────────────────────────

/**
 * Throws an AppError if the email or password is empty.
 * Called BEFORE any database lookup to avoid an unnecessary round-trip.
 *
 * EXAMPLE:
 *   validateCredentials('', 'pass') → throws AppError('Email is required', 400)
 *   validateCredentials('a@b.com', '') → throws AppError('Password is required', 400)
 *   validateCredentials('a@b.com', 'pass') → no-op (passes silently)
 */
export const validateCredentials = (email: string, password: string): void => {
  // .trim() removes surrounding whitespace, so '   ' is treated as empty.
  if (!email?.trim()) throw new AppError('Email is required', 400);
  if (!password?.trim()) throw new AppError('Password is required', 400);
};

// ── Error mapping helpers ─────────────────────────────────────────────────────
// These are used by some older controller error-handling paths.
// New code should use next(err) → global errorHandler instead.

/**
 * Generic controller error handler.
 * Prefers AppError statusCode; falls back to text-matching for plain errors.
 *
 * EXAMPLE:
 *   } catch (err: any) {
 *     handleControllerError(err, res);
 *   }
 */
export const handleControllerError = (
  err: any,
  res: Response,
  options?: { keyword: string; keywordStatus: number }
) => {
  // AppError → use its statusCode directly (locale-safe, no string matching needed).
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  // Fallback for plain Error: guess the status from message text.
  let status = err.message.includes('not authorized') ? 403 : 400;
  if (options && err.message.includes(options.keyword)) {
    status = options.keywordStatus;
  }
  res.status(status).json({ error: err.message });
};

/**
 * Maps auth controller errors to semantically correct HTTP status codes.
 * If the error is an AppError, its statusCode is used directly — no message
 * parsing needed, making this handler locale-safe.
 * Falls back to text-matching only for plain Error objects thrown by
 * third-party libraries (Prisma, jsonwebtoken) that we cannot control.
 * - 401 for invalid credentials or expired tokens
 * - 403 for role/permission violations
 * - 404 for missing users/resources
 * - 409 for duplicate resource conflicts (e.g. email already exists)
 * - 400 for all other validation errors
 *
 * EXAMPLE:
 *   handleAuthControllerError(new AppError('User not found', 404), res)
 *   // → res.status(404).json({ error: 'User not found' })
 */
export const handleAuthControllerError = (err: any, res: Response) => {
  const msg: string = err?.message ?? 'Unknown error';

  // Prefer structured status code — locale-safe, no string matching needed.
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: msg });
  }

  // Fallback: match against known third-party library messages (English only).
  // jsonwebtoken throws these in English regardless of locale.
  if (
    msg.includes('jwt expired') ||
    msg.includes('invalid token') ||
    msg.includes('jwt malformed')
  ) {
    return res.status(401).json({ error: msg });
  }

  // Prisma unique constraint violation (P2002) — not locale-dependent.
  // EXAMPLE: inserting a duplicate email triggers P2002.
  if ((err as any)?.code === 'P2002') {
    return res.status(409).json({ error: 'A record with that value already exists.' });
  }

  // Any remaining plain errors default to 400 (client mistake).
  return res.status(400).json({ error: msg });
};

// ── Business logic helpers ────────────────────────────────────────────────────

/**
 * Checks if a user already exists by email.
 * Throws AppError 409 if found (conflict — email is taken).
 *
 * EXAMPLE:
 *   await checkUserExistsByEmail('alex@example.com');
 *   // → throws if alex@example.com is already registered
 */
export const checkUserExistsByEmail = async (email: string) => {
  // findUnique returns null if not found — no exception thrown.
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) throw new AppError('User already exists', 409);
};

/**
 * Generates both access and refresh JWT tokens for a user.
 * Returned as an object so callers can destructure what they need.
 *
 * EXAMPLE:
 *   const { accessToken, refreshToken } = await generateTokensForUser(user.id, user.roles);
 *   setAccessTokenCookie(res, accessToken);
 *   setRefreshTokenCookie(res, refreshToken);
 */
export const generateTokensForUser = async (userId: string, roles: Role[]) => {
  const accessToken = generateAccessToken(userId, roles);
  const refreshToken = generateRefreshToken(userId, roles);
  return { accessToken, refreshToken };
};

// ── Cookie helpers ────────────────────────────────────────────────────────────
// CONCEPT: httpOnly cookies
//   An httpOnly cookie cannot be read by JavaScript (document.cookie).
//   This is the primary defence against XSS attacks stealing auth tokens.
//   The browser sends the cookie automatically on every request to the domain.

/**
 * Sets the refresh token as a long-lived httpOnly cookie (7 days).
 *
 * EXAMPLE (what the browser sees):
 *   Set-Cookie: refreshToken=eyJ…; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800
 */
export function setRefreshTokenCookie(res: Response, refreshToken: string) {
  res.cookie('refreshToken', refreshToken, {
    // httpOnly: true → the cookie is invisible to JavaScript, defeating XSS token theft.
    httpOnly: true,

    // secure: true → cookie is only sent over HTTPS. We only need this in production;
    // in development we're on http://localhost.
    secure: IS_PRODUCTION,

    // sameSite: 'lax' → the cookie is sent on top-level navigations from external sites
    // (e.g. clicking a link in an email, OAuth redirect) but NOT on cross-site
    // sub-resource requests (e.g. a form POST from a different domain).
    // "lax" is the right balance between CSRF protection and usability.
    // "strict" would block OAuth callbacks and magic-link redirects.
    // "none" would require `secure: true` and opens CSRF risk on all origins.
    sameSite: 'lax',

    // path: '/' means the cookie is sent with every request to this domain.
    // Without it, the cookie is scoped to the current request path, which
    // would break refreshes called from different URL paths.
    path: '/',

    // maxAge is in milliseconds; the browser removes the cookie after this duration.
    // 7 * 24 * 60 * 60 * 1000 = 604_800_000 ms = 7 days
    maxAge: ENV.REFRESH_TOKEN_MAX_AGE_MS,
  });
}

/**
 * Sets the access token as a short-lived httpOnly cookie (15 min).
 * JS cannot read this cookie, eliminating XSS-based token theft.
 *
 * EXAMPLE:
 *   setAccessTokenCookie(res, accessToken);
 *   // → Set-Cookie: accessToken=eyJ…; HttpOnly; SameSite=Lax; Path=/; Max-Age=900
 */
export function setAccessTokenCookie(res: Response, accessToken: string) {
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax',  // same reasoning as refresh token above
    path: '/',
    maxAge: ENV.ACCESS_TOKEN_MAX_AGE_MS, // 15 minutes
  });
}
