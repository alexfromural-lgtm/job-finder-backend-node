// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/middleware/errorHandler.middleware.ts  — Global Express error handler
//
// CONCEPT: Centralised error handling in Express
//   Instead of writing try/catch + res.status().json() in every controller,
//   controllers call `next(err)` and this single middleware handles ALL errors.
//
//   Benefits:
//   1. Consistent error response shape across the whole API.
//   2. One place to decide what to log vs what to expose to clients.
//   3. Keeps controllers focused on the happy path.
//
// HOW DOES EXPRESS KNOW THIS IS AN ERROR HANDLER?
//   Express identifies a 4-argument middleware (err, req, res, next) as an error handler.
//   It is ONLY invoked when next(err) is called — not on normal requests.
//   It MUST be registered AFTER all other routes (see index.ts).
//
// EXAMPLE FLOW:
//   controller:    } catch (err) { next(err); }
//   errorHandler:  receives err → checks type → sends appropriate status + message
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';

/**
 * Global Express error handler.
 * Must be mounted AFTER all routes in index.ts.
 * All controllers should call next(err) instead of sending their own error responses.
 *
 * EXAMPLE with AppError:
 *   throw new AppError('User not found', 404)
 *   → res.status(404).json({ error: 'User not found' })
 *
 * EXAMPLE with Prisma unique constraint:
 *   Prisma throws { code: 'P2002' } on duplicate email
 *   → res.status(409).json({ error: 'A record with that value already exists.' })
 *
 * EXAMPLE with JWT error:
 *   jsonwebtoken throws Error('jwt expired')
 *   → res.status(401).json({ error: 'jwt expired' })
 */
export const errorHandler = (
  err: unknown,   // `unknown` forces us to narrow the type before using it (safer than `any`)
  _req: Request,  // underscore prefix convention = "parameter required by signature but unused"
  res: Response,
  _next: NextFunction  // must be in the signature even if unused — 4 args = error handler
): void => {

  // ── Branch 1: Our own structured error ──────────────────────────────────────
  // AppError carries a typed statusCode — no message inspection needed.
  // This is locale-safe (works with translated messages).
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // ── Narrow type for the branches below ──────────────────────────────────────
  // err is `unknown`; we cast to `any` once for the remaining checks.
  const msg: string = (err as any)?.message ?? 'Unknown error';

  // ── Branch 2: Prisma unique constraint violation (P2002) ────────────────────
  // When you try to insert a record that breaks a @unique constraint (e.g. duplicate email),
  // Prisma throws an error with code 'P2002'. We map it to 409 Conflict.
  // This check is NOT locale-dependent (Prisma error codes are stable).
  // EXAMPLE: creating a user with an already-registered email triggers P2002.
  if ((err as any)?.code === 'P2002') {
    res.status(409).json({ error: 'A record with that value already exists.' });
    return;
  }

  // ── Branch 3: JWT errors from jsonwebtoken library ──────────────────────────
  // jsonwebtoken throws plain Error objects with these English message strings.
  // We can't control the library, so string matching is the only option here.
  // These messages are stable (not locale-dependent — the library is English-only).
  // EXAMPLE: jwt.verify('expired_token', secret) → Error: 'jwt expired'
  if (
    msg.includes('jwt expired') ||
    msg.includes('invalid token') ||
    msg.includes('jwt malformed')
  ) {
    res.status(401).json({ error: msg });
    return;
  }

  // ── Branch 4: Unexpected errors ─────────────────────────────────────────────
  // Log the full error server-side (for debugging/monitoring), but send a
  // generic message to the client (avoid leaking stack traces or internal details).
  // EXAMPLE: a database connection failure would reach here.
  console.error('[Unhandled Error]', err);
  res.status(500).json({ error: 'Internal server error' });
};
