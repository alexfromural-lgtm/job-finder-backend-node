// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/controllers/auth.controller.ts  — Auth HTTP handlers
//
// CONCEPT: Controller layer (MVC pattern)
//   Controllers are the bridge between HTTP (Express) and business logic (services).
//   They:
//     1. Extract data from the request (body, cookies, params).
//     2. Call the appropriate service function.
//     3. Format and send the HTTP response.
//     4. Pass any error to next(err) for the global error handler.
//
//   Controllers should NOT contain business logic (DB queries, password hashing).
//   That belongs in the service layer. This keeps controllers thin and testable.
//
// CONCEPT: try/catch + next(err)
//   Every async controller wraps its logic in try/catch and calls next(err) on failure.
//   This passes the error to errorHandler.middleware.ts, which sends a consistent response.
//
//   EXAMPLE:
//     export const login = async (req, res, next) => {
//       try { ... } catch (err) { next(err); }  ← errors handled centrally
//     };
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Request, Response, NextFunction } from 'express';
import * as AuthService from '../services/auth.service';
import { AuthRequest } from '../middleware/auth.middleware';
import { setRefreshTokenCookie, setAccessTokenCookie } from '../utils/auth.utils';
import { IS_PRODUCTION } from '../config/env';

// ── signupJobSeeker ───────────────────────────────────────────────────────────
/**
 * POST /api/auth/signup/jobseeker
 *
 * EXAMPLE request body (pre-validated by validate(signupSchema)):
 *   { "name": "Alex", "email": "alex@example.com", "password": "mypass123" }
 *
 * EXAMPLE success response (201):
 *   { "message": "Signed up successfully" }
 *   Set-Cookie: accessToken=eyJ…;  HttpOnly; Path=/
 *   Set-Cookie: refreshToken=eyJ…; HttpOnly; Path=/
 */
export const signupJobSeeker = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Destructure validated body (already validated by validate middleware).
    const { name, email, password } = req.body;

    // Delegate business logic to the service layer — no DB code in controllers.
    const { accessToken, refreshToken } = await AuthService.signupJobSeeker(name, email, password);

    // Set both tokens as httpOnly cookies — JS can't read them (XSS protection).
    setRefreshTokenCookie(res, refreshToken);
    setAccessTokenCookie(res, accessToken);

    // 201 Created — a new user resource was created.
    res.status(201).json({ message: 'Signed up successfully' });
  } catch (err) {
    // Pass ANY error to the global error handler (errorHandler.middleware.ts).
    // The handler will inspect the error type and send the appropriate status.
    next(err);
  }
};

// ── signupRecruiter ───────────────────────────────────────────────────────────
/**
 * POST /api/auth/signup/recruiter
 *
 * EXAMPLE request body:
 *   { "name": "Alice", "email": "alice@corp.com", "password": "pass123",
 *     "companyName": "Acme", "industry": "Tech" }
 */
export const signupRecruiter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // req.body is passed as a whole object (recruiterSignupSchema validated it all).
    const { accessToken, refreshToken } = await AuthService.signupRecruiter(req.body);

    setRefreshTokenCookie(res, refreshToken);
    setAccessTokenCookie(res, accessToken);
    res.status(201).json({ message: 'Signed up successfully' });
  } catch (err) {
    next(err);
  }
};

// ── upgradeToRecruiter ────────────────────────────────────────────────────────
/**
 * POST /api/auth/upgrade/recruiter
 * Adds the RECRUITER role to an existing JOB_SEEKER account.
 *
 * Uses AuthRequest (not plain Request) because requireAuth sets req.userId.
 * req.userId! — the `!` asserts it's definitely defined (safe because requireAuth
 * already ran and would have rejected the request if userId wasn't set).
 */
export const upgradeToRecruiter = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!; // non-null assertion: requireAuth guarantees this is set
    const { user, tokens } = await AuthService.upgradeToRecruiter(userId, req.body);

    // Re-issue cookies so the RECRUITER role is active immediately (no re-login needed).
    // The new tokens embed both JOB_SEEKER and RECRUITER roles.
    setRefreshTokenCookie(res, tokens.refreshToken);
    setAccessTokenCookie(res, tokens.accessToken);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
};

// ── login ─────────────────────────────────────────────────────────────────────
/**
 * POST /api/auth/login
 *
 * EXAMPLE success response (200):
 *   { "message": "Logged in successfully" }
 *   + two httpOnly cookies set
 */
export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const { accessToken, refreshToken } = await AuthService.login(email, password);

    setRefreshTokenCookie(res, refreshToken);
    setAccessTokenCookie(res, accessToken);
    res.status(200).json({ message: 'Logged in successfully' });
  } catch (err) {
    next(err);
  }
};

// ── refreshTokens ─────────────────────────────────────────────────────────────
/**
 * POST /api/auth/refresh
 * Uses the refreshToken cookie to issue a fresh pair of access + refresh tokens.
 * Called automatically by the client when it receives a 401 (access token expired).
 *
 * EXAMPLE flow:
 *   1. Client's access token expires → GET /api/auth/me returns 401
 *   2. Client sends POST /api/auth/refresh (refresh token is in the cookie)
 *   3. Server verifies refresh token → issues new cookies → 200 OK
 *   4. Client retries the original request with the new access token
 */
export const refreshTokens = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // The refresh token lives in an httpOnly cookie, not the request body.
    const token = req.cookies?.refreshToken;

    if (!token) {
      // No cookie → not logged in (or cookie expired/cleared).
      res.status(401).json({ error: 'No refresh token provided' });
      return;
    }

    const { accessToken, refreshToken } = await AuthService.refreshTokens(token);

    setRefreshTokenCookie(res, refreshToken);
    setAccessTokenCookie(res, accessToken);
    res.status(200).json({ message: 'Token refreshed' });
  } catch (err) {
    next(err);
  }
};

// ── logout ────────────────────────────────────────────────────────────────────
/**
 * POST /api/auth/logout
 * Clears both auth cookies, effectively logging the user out.
 *
 * NOTE: res.clearCookie() must specify the SAME options (httpOnly, secure, path)
 * that were used when setting the cookie. If path: '/' is omitted, the browser
 * won't clear the cookie because the paths don't match.
 */
export const logout = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // The cookie options must match exactly what was used in Set-Cookie.
    // Mismatch → browser keeps the old cookie → user appears still logged in.
    const cookieOpts = {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: 'lax' as const,  // `as const` narrows the type from string to 'lax'
      path: '/',
    };
    res.clearCookie('refreshToken', cookieOpts);
    res.clearCookie('accessToken', cookieOpts);

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

// ── getMe ─────────────────────────────────────────────────────────────────────
/**
 * GET /api/auth/me
 * Returns the currently authenticated user's data.
 *
 * EXAMPLE response:
 *   { "user": { "id": "uuid", "name": "Alex", "email": "alex@example.com",
 *               "roles": ["JOB_SEEKER"], "isActive": true, "createdAt": "..." } }
 */
export const getMe = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    // The service fetches the user and strips sensitive fields (like password).
    const user = await AuthService.getCurrentUser(userId);
    res.json({ user });
  } catch (err) {
    next(err);
  }
};
