// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/config/env.ts  — Centralised, validated environment configuration
//
// PROBLEM this solves:
//   process.env always returns `string | undefined`. Accessing DATABASE_URL
//   anywhere in the codebase gives you an untyped string — or silently undefined.
//   If a required variable is missing the app crashes deep in business logic,
//   not at startup, making bugs hard to diagnose.
//
// SOLUTION: Zod schema validation at boot time.
//   1. Define the shape (and types) of every env var in a Zod schema.
//   2. Parse process.env through the schema.
//   3. If validation fails → print a human-readable error and exit immediately.
//   4. If it passes → export a fully-typed, immutable ENV object.
//   The rest of the codebase imports ENV.PORT (number!) instead of process.env.PORT.
//
// CONCEPT: "Fail fast" — crash loudly at startup rather than silently later.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Zod is a TypeScript-first schema declaration and validation library.
// Every z.* call builds a schema object that knows how to validate a value
// and infer a TypeScript type from it.
import { z } from 'zod';

// ── Schema definition ─────────────────────────────────────────────────────────
// z.object() creates a schema that matches a plain JS object.
// Each key is validated independently.
const envSchema = z.object({
  // z.enum(['a','b','c']) means the value must be exactly one of those strings.
  // .default('development') means: if the env var is absent, use 'development'.
  // EXAMPLE: NODE_ENV=production  → valid
  //          NODE_ENV=staging     → ❌ fails: "staging" is not in the enum
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // z.coerce.number() first converts the string "5002" to the number 5002,
  // then validates it as a number. Without coerce you'd get a type error
  // because process.env.PORT is a string.
  // EXAMPLE: PORT="5002" → 5002 (number)
  //          PORT="abc"  → ❌ fails: cannot coerce to number
  PORT: z.coerce.number().default(5002),

  // z.string().min(1) means: must be a string AND at least 1 character long.
  // The second argument to .min() is the error message shown to the developer.
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // JWT secrets must be at least 16 characters for minimal cryptographic strength.
  // EXAMPLE: ACCESS_TOKEN_SECRET="mysupersecret16c" → valid
  //          ACCESS_TOKEN_SECRET="short"            → ❌ fails validation
  ACCESS_TOKEN_SECRET: z.string().min(16, 'ACCESS_TOKEN_SECRET must be at least 16 characters'),

  // JWT expiry strings are passed directly to jsonwebtoken, which understands
  // "15m" (15 minutes), "7d" (7 days), "1h" (1 hour), etc.
  ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_SECRET: z.string().min(16, 'REFRESH_TOKEN_SECRET must be at least 16 characters'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // .optional() means the key may be absent (undefined).
  // EXAMPLE: CORS_ORIGIN= (empty) → undefined (not an error)
  CORS_ORIGIN: z.string().optional(),

  // Cookie maxAge expects milliseconds. We pre-calculate them here so the rest
  // of the codebase doesn't repeat the same arithmetic.
  // EXAMPLE: 15 * 60 * 1000 = 900_000 ms = 15 minutes
  ACCESS_TOKEN_MAX_AGE_MS: z.coerce.number().default(15 * 60 * 1000),   // 15 minutes
  REFRESH_TOKEN_MAX_AGE_MS: z.coerce.number().default(7 * 24 * 60 * 60 * 1000), // 7 days

  // Number of Bull jobs the worker processes in parallel.
  // EXAMPLE: QUEUE_CONCURRENCY=10 → 10 DB writes can happen simultaneously.
  QUEUE_CONCURRENCY: z.coerce.number().default(5),
});

// ── Validation ────────────────────────────────────────────────────────────────
// safeParse() returns { success: true, data: ... } or { success: false, error: ... }
// (Unlike parse() which throws on failure — safeParse lets us handle the error ourselves.)
// EXAMPLE:
//   const result = z.string().safeParse(42);
//   result.success === false
//   result.error.issues[0].message === 'Expected string, received number'
const parsed = envSchema.safeParse(process.env);

// Fail fast: if any variable is missing or invalid, print exactly which ones
// and exit with a non-zero code (signals failure to Docker / CI / systemd).
if (!parsed.success) {
  console.error(
    '❌ Invalid or missing environment variables:\n',
    // .flatten().fieldErrors turns Zod's error tree into { fieldName: ['message'] }
    // JSON.stringify with indent 2 makes it human-readable in the terminal.
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2)
  );
  // process.exit(1) terminates the Node.js process with exit code 1.
  // Any non-zero code signals failure to the OS / Docker.
  // EXAMPLE: `echo $?` after a failed start → prints 1
  process.exit(1);
}

// ── Exports ───────────────────────────────────────────────────────────────────
/**
 * Centralised, validated environment configuration.
 * All process.env reads live here — the rest of the codebase
 * works with typed constants rather than raw string comparisons.
 * The app exits immediately at startup if required vars are missing or invalid.
 *
 * USAGE EXAMPLE:
 *   import { ENV } from '../config/env';
 *   const port = ENV.PORT; // number, guaranteed defined
 */
export const ENV = parsed.data;

// Convenience booleans — avoids string comparisons scattered across the codebase.
// EXAMPLE: if (IS_PRODUCTION) { app.use(compression()); }
// Without these you'd write: if (process.env.NODE_ENV === 'production') { ... }
// everywhere, which is error-prone (typos, unvalidated string).
export const IS_PRODUCTION = ENV.NODE_ENV === 'production';
export const IS_DEVELOPMENT = ENV.NODE_ENV === 'development';
