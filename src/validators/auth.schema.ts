// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/validators/auth.schema.ts  — Zod validation schemas for auth endpoints
//
// CONCEPT: Zod schemas
//   A Zod schema defines the shape, types, and constraints of data.
//   Call schema.parse(data)       → returns validated data or throws.
//   Call schema.safeParse(data)   → returns { success, data } or { success, error }.
//   Call z.infer<typeof schema>   → derives a TypeScript type from the schema.
//
// WHY USE ZOD IN ADDITION TO TYPESCRIPT?
//   TypeScript types are erased at runtime — they don't validate HTTP request bodies.
//   Zod validates at RUNTIME (when the request arrives) and also gives you a
//   static TypeScript type for free via z.infer<>.
//   EXAMPLE:
//     const loginSchema = z.object({ email: z.string().email(), password: z.string() });
//     type LoginInput = z.infer<typeof loginSchema>;
//     // LoginInput is { email: string; password: string } at compile time
//     // AND the schema validates that exact shape at runtime.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { z } from 'zod';

// ── Login ─────────────────────────────────────────────────────────────────────
/**
 * Schema for POST /api/auth/login request body.
 *
 * EXAMPLE valid input:
 *   { "email": "alex@example.com", "password": "secret123" }
 *
 * EXAMPLE invalid input → validation errors:
 *   { "email": "not-an-email" } → "Invalid email address" on email field,
 *                                 "Password is required" on password field
 */
export const loginSchema = z.object({
  // z.string().email() checks the string matches the email format (RFC 5321).
  // The string in email() is the custom error message if validation fails.
  // EXAMPLE: "not-valid" → { message: 'Invalid email address', path: ['email'] }
  email: z.string().email('Invalid email address'),

  // z.string().min(1) means: must be a string with at least 1 character.
  // We use min(1) instead of min(6) here because the wrong-password error
  // from the service is more informative than a Zod min-length error.
  password: z.string().min(1, 'Password is required'),
});

// z.infer<> extracts the TypeScript type that the schema validates.
// This is used to type controller and service function parameters.
// EXAMPLE: const body: LoginInput = req.body; body.email is string ✓
export type LoginInput = z.infer<typeof loginSchema>;
