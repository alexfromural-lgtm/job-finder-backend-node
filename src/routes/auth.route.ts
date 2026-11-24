// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/routes/auth.route.ts  — Authentication route definitions
//
// CONCEPT: Express Router
//   Router() creates a mini-application that holds a group of route definitions.
//   It is mounted in index.ts with a prefix: app.use('/api/auth', authRouter)
//   So router.post('/login', ...) becomes POST /api/auth/login for clients.
//
// CONCEPT: Rate limiting
//   Rate limiting rejects requests when a client makes too many in a time window.
//   It protects against brute-force attacks (trying many passwords) and
//   signup spam (creating hundreds of fake accounts).
//
//   EXAMPLE: authLimiter allows 10 requests per 15 min per IP.
//     Client sends 11 login attempts in 15 min → 429 Too Many Requests.
//
// MIDDLEWARE CHAIN on a route:
//   router.post('/login', authLimiter, validate(loginSchema), login)
//   Request → authLimiter (rate check) → validate (body check) → login (handler)
//   Each step calls next() to continue, or sends a response to stop the chain.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Router } from 'express';
// express-rate-limit limits requests per IP per time window.
import rateLimit from 'express-rate-limit';
import {
  signupJobSeeker,
  signupRecruiter,
  upgradeToRecruiter,
  login,
  logout,
  refreshTokens,
  getMe,
} from '../controllers/auth.controller';
import { authorizeRoles, requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { recruiterSignupSchema } from '../validators/recruiter.schema';
import { signupSchema } from '../validators/jobseeker.schema';
import { loginSchema } from '../validators/auth.schema';

// Router() creates a new router instance. Routes registered here are
// automatically prefixed with /api/auth when mounted in index.ts.
const router = Router();

// ── Rate limiters ─────────────────────────────────────────────────────────────

// authLimiter: protects login and token refresh from brute-force attacks.
// EXAMPLE: an attacker trying 100 passwords → blocked after 10 attempts in 15 min.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute sliding window
  max: 10,                   // max 10 requests per IP per window
  standardHeaders: true,     // sets RateLimit-* headers in the response (RFC 6585)
  legacyHeaders: false,      // disables the old X-RateLimit-* headers
  // Response sent when the limit is exceeded (HTTP 429 Too Many Requests):
  message: { error: 'Too many attempts, please try again later.' },
});

// signupLimiter: protects signup from account-creation spam.
// More generous (5 per hour) since legitimate users rarely create multiple accounts quickly.
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1-hour window
  max: 5,                    // max 5 signups per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many accounts created, please try again later.' },
});

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/auth/signup/jobseeker
// Middleware chain: signupLimiter → validate(signupSchema) → signupJobSeeker
// 1. signupLimiter: reject if IP has signed up 5+ times in the past hour
// 2. validate: reject if body doesn't match signupSchema (name, email, password)
// 3. signupJobSeeker: create user + issue cookies
router.post('/signup/jobseeker', signupLimiter, validate(signupSchema), signupJobSeeker);

// POST /api/auth/signup/recruiter
// Same flow but validates against recruiterSignupSchema (adds companyName, etc.)
router.post('/signup/recruiter', signupLimiter, validate(recruiterSignupSchema), signupRecruiter);

// POST /api/auth/upgrade/recruiter
// Requires the user to be logged in AND to be a JOB_SEEKER.
// Adds the RECRUITER role to their existing account without re-registering.
// EXAMPLE: a job seeker decides to also post jobs → they upgrade instead of making a new account.
router.post(
  '/upgrade/recruiter',
  requireAuth,                     // 1. must be logged in
  authorizeRoles('JOB_SEEKER'),    // 2. must currently be a job seeker (not already a recruiter)
  validate(recruiterSignupSchema), // 3. validate company info
  upgradeToRecruiter               // 4. handler
);

// POST /api/auth/login
router.post('/login', authLimiter, validate(loginSchema), login);

// POST /api/auth/logout
// No auth required — logging out is always allowed (clears cookies).
router.post('/logout', logout);

// POST /api/auth/refresh
// No validate middleware — the refresh token comes from the cookie, not the body.
router.post('/refresh', authLimiter, refreshTokens);

// GET /api/auth/me
// Returns the currently logged-in user's data (requires a valid access token cookie).
router.get('/me', requireAuth, getMe);

export default router;
