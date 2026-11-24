// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/index.ts  — Application entry point
//
// This is the FIRST file Node.js runs when the server starts.
// Its job: create the Express app, attach middleware, mount routes, and listen.
//
// CONCEPT: Express request lifecycle
//   Browser ──► middleware stack (helmet → cors → json → cookies)
//           ──► route handler (auth / jobs / …)
//           ──► global error handler
//           ──► response back to browser
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Imports ───────────────────────────────────────────────────────────────────

// `express` is a web framework. It wraps Node's raw http module so you can write
// routes and middleware without handling raw TCP buffers.
// EXAMPLE: const app = express(); app.get('/hello', (req, res) => res.send('Hi!'));
import express from 'express';

// `helmet` sets security-related HTTP response headers automatically.
// EXAMPLE: adds  Content-Security-Policy, X-Frame-Options, X-XSS-Protection …
// Without it, browsers have no server-side hints on how to protect the page.
import helmet from 'helmet';

// `compression` gzip-encodes response bodies, reducing transfer size.
// EXAMPLE: a 100 KB JSON payload shrinks to ~15 KB over the wire.
// Only enabled in production because dev tools can't inspect compressed bodies easily.
import compression from 'compression';

// `cookie-parser` parses the Cookie header and populates req.cookies as an object.
// EXAMPLE: Cookie: "accessToken=abc123" → req.cookies.accessToken === 'abc123'
// Without this, req.cookies would be undefined.
import cookieParser from 'cookie-parser';

// `cors` handles Cross-Origin Resource Sharing.
// A browser blocks fetch() to a different origin by default (same-origin policy).
// EXAMPLE: frontend on http://localhost:3000 calling API on http://localhost:5002
// would fail without CORS headers telling the browser "that origin is allowed".
import cors from 'cors';

// `dotenv` reads .env file and merges keys into process.env.
// EXAMPLE: .env → DATABASE_URL=postgres://... → process.env.DATABASE_URL
// Must be called BEFORE any code that reads process.env (like config/env.ts).
import dotenv from 'dotenv';

// Route modules — each is an Express Router covering one resource area.
// Splitting routes into separate files keeps index.ts focused on wiring, not logic.
import authRoutes from './routes/auth.route';
import jobseekerRoutes from './routes/jobseeker.route';
import recruiterRoutes from './routes/recruiter.route';
import jobRoutes from './routes/job.route';
import queueRoutes from './routes/queue.route';

// Side-effect import: just executing this file starts the Bull queue worker process.
// No value is exported; we only care that the worker registers its processor.
// EXAMPLE: import './queue/worker'; // starts listening on the Bull queue
import './queue/worker'; // start the worker on server boot

// Typed, validated constants from our central config module.
// ENV.PORT is a number (not a string) thanks to Zod's z.coerce.number().
import { ENV, IS_PRODUCTION, IS_DEVELOPMENT } from './config/env';

// Global error-handler middleware. Must be the LAST middleware added.
import { errorHandler } from './middleware/errorHandler.middleware';

// ── Bootstrap ─────────────────────────────────────────────────────────────────

// dotenv must run before any process.env read; calling it here as a safety net.
// (config/env.ts also reads process.env, so this must stay at the top of the file.)
dotenv.config();

// ── Environment constants ──────────────────────────────────────────────────────
// CORS_ORIGIN controls which frontend URL the browser is allowed to call from.
// In development the frontend dev-server runs on localhost:3000 by default.
// In production CORS_ORIGIN must be explicitly set via an env variable.
// EXAMPLE: CORS_ORIGIN=https://myfrontend.com npm start
const CORS_ORIGIN = ENV.CORS_ORIGIN ?? (IS_DEVELOPMENT ? 'http://localhost:3000' : undefined);

// ── App setup ─────────────────────────────────────────────────────────────────

// express() creates the application object.  You call app.use() to register
// middleware and app.get/post/put/delete to register route handlers.
const app = express();

// Security: helmet sets safe HTTP headers (should be FIRST so every response benefits).
// EXAMPLE header added: X-Content-Type-Options: nosniff
//   This prevents the browser from MIME-sniffing a response away from the declared type.
app.use(helmet());

// Performance: gzip compression in production only.
// EXAMPLE: response body "{ "jobs": [...1000 items...] }" → ~80% smaller over the wire.
if (IS_PRODUCTION) {
  app.use(compression());
}

// cors({ credentials: true }) allows cookies to be sent in cross-origin requests.
// Without `credentials: true`, Set-Cookie headers are silently ignored by the browser.
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));

// express.json() parses bodies with Content-Type: application/json.
// EXAMPLE: POST body '{"email":"a@b.com"}' → req.body.email === 'a@b.com'
// Without this, req.body would be undefined for JSON requests.
app.use(express.json());

// cookieParser() parses the Cookie header and makes cookies available as req.cookies.
// EXAMPLE: Cookie: accessToken=xyz → req.cookies.accessToken === 'xyz'
app.use(cookieParser());

// ── Routes ────────────────────────────────────────────────────────────────────
// app.use(prefix, router) mounts a Router at a URL prefix.
// EXAMPLE: GET /api/auth/me → matched by authRoutes, specifically router.get('/me', ...)
// All auth endpoints live under /api/auth — separating concerns from /api/jobs, etc.
app.use('/api/auth', authRoutes);
app.use('/api/jobseeker', jobseekerRoutes);
app.use('/api/recruiter', recruiterRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/queue', queueRoutes);

// ── Global error handler (must be LAST, after all routes) ─────────────────────
// Express identifies a 4-argument middleware as an error handler.
// When any route calls next(err), Express skips all normal middleware
// and jumps directly here.
// EXAMPLE: in a controller:  } catch (err) { next(err); }
//          → errorHandler receives that err and sends the right HTTP status.
app.use(errorHandler);

// ── Start listening ───────────────────────────────────────────────────────────
// app.listen() opens a TCP socket on the given port.
// ENV.PORT comes from .env (default 5002) and is already a number (Zod coerces it).
// EXAMPLE: Server is running on http://localhost:5002 [development]
app.listen(ENV.PORT, () => {
  console.log(`Server is running on http://localhost:${ENV.PORT} [${ENV.NODE_ENV}]`);
});
