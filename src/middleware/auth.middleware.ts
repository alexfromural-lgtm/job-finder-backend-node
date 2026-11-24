// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/middleware/auth.middleware.ts  — Authentication & authorization middleware
//
// CONCEPT: Express Middleware
//   Middleware is a function with the signature (req, res, next) => void.
//   It sits between the incoming request and the final route handler.
//   It can inspect/modify req & res, or call next() to continue the chain,
//   or call next(err) to jump to the error handler, or send a response itself.
//
//   Request lifecycle with auth middleware:
//   POST /api/jobs  →  requireAuth  →  authorizeRoles('RECRUITER')  →  createJob handler
//                        ↑ verifies JWT    ↑ checks role in req.roles
//
// WHY TWO SEPARATE MIDDLEWARES (requireAuth + authorizeRoles)?
//   • requireAuth  answers: "Is this user logged in at all?"
//   • authorizeRoles answers: "Does this logged-in user have permission?"
//   Keeping them separate lets you use requireAuth alone on routes where any
//   logged-in user is allowed (e.g. GET /api/auth/me).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/token';
import { Role } from '@prisma/client';

// ── Extended Request type ─────────────────────────────────────────────────────
// Express's Request type does not have userId or roles by default.
// We extend it here so TypeScript knows these properties exist on authenticated requests.
// EXAMPLE:
//   export const getProfile = (req: AuthRequest, res: Response) => {
//     const id = req.userId!;  // ← TypeScript knows this exists after requireAuth
//   };
export interface AuthRequest extends Request {
  userId?: string;  // set by requireAuth; undefined before auth runs
  roles?: Role[];   // set by requireAuth; e.g. ['JOB_SEEKER'] or ['RECRUITER']
}

// ── requireAuth ───────────────────────────────────────────────────────────────
/**
 * Middleware that blocks unauthenticated requests.
 * Reads the accessToken from the httpOnly cookie, verifies it, and
 * attaches userId + roles to the request object for downstream handlers.
 *
 * USAGE IN ROUTE:
 *   router.get('/profile', requireAuth, ProfileController.getProfile);
 *
 * EXAMPLE flows:
 *   • No cookie present  → 401 { error: 'Missing access token' }
 *   • Token expired      → 401 { error: 'Invalid or expired access token' }
 *   • Token valid        → req.userId = 'uuid', req.roles = ['JOB_SEEKER'], next()
 */
export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  // req.cookies is populated by the cookie-parser middleware (registered in index.ts).
  // The optional chaining ?. prevents a crash if cookies is somehow undefined.
  const token = req.cookies?.accessToken;

  // Guard clause: reject early if no token is present.
  if (!token) {
    // We return here (after sending the response) to stop further execution.
    // Without `return`, next() could also be called, causing a "headers already sent" error.
    res.status(401).json({ error: 'Missing access token' });
    return;
  }

  try {
    // verifyAccessToken() throws if the token is expired, malformed, or has a bad signature.
    const payload = verifyAccessToken(token);

    // Attach user identity to the request so downstream middleware/controllers can use it.
    // EXAMPLE: req.userId = 'a1b2c3'; req.roles = ['JOB_SEEKER'];
    req.userId = payload.userId;
    req.roles = payload.roles;

    // Call next() to pass control to the next middleware or the route handler.
    next();
  } catch {
    // Any JWT error (expired, invalid signature, malformed) → 401 Unauthorized.
    res.status(401).json({ error: 'Invalid or expired access token' });
  }
};

// ── authorizeRoles ────────────────────────────────────────────────────────────
/**
 * Middleware FACTORY that returns a middleware checking for specific roles.
 * Must be used AFTER requireAuth (which sets req.roles).
 *
 * USAGE IN ROUTE:
 *   router.post('/jobs', requireAuth, authorizeRoles('RECRUITER'), createJob);
 *   router.get('/profile', requireAuth, authorizeRoles('JOB_SEEKER'), getProfile);
 *
 * EXAMPLE flows:
 *   • req.roles = ['JOB_SEEKER'], authorizeRoles('RECRUITER') → 403 Access denied
 *   • req.roles = ['RECRUITER'],  authorizeRoles('RECRUITER') → next() ✓
 *   • req.roles = ['JOB_SEEKER', 'RECRUITER'], authorizeRoles('RECRUITER') → next() ✓
 *
 * The spread parameter `...roles` lets you pass multiple allowed roles:
 *   authorizeRoles('RECRUITER', 'ADMIN')
 */
export const authorizeRoles = (...roles: Role[]) => {
  // Returns a middleware closure that captures the `roles` argument above.
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    // .some() returns true if at least ONE of req.roles is in the allowed `roles` array.
    // This supports users with multiple roles (e.g. JOB_SEEKER + RECRUITER after upgrade).
    // EXAMPLE: req.roles = ['JOB_SEEKER', 'RECRUITER'], roles = ['RECRUITER']
    //   → req.roles.some(r => ['RECRUITER'].includes(r)) → true
    if (!req.roles || !req.roles.some((role) => roles.includes(role))) {
      res.status(403).json({ message: 'Access denied.' });
      return;
    }
    next();
  };
};
