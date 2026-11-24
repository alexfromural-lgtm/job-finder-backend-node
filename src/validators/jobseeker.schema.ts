// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/validators/jobseeker.schema.ts  — Zod schemas for jobseeker endpoints
//
// See auth.schema.ts for a full explanation of Zod and z.infer<>.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { z } from 'zod';

// ── Signup ────────────────────────────────────────────────────────────────────
/**
 * Schema for POST /api/auth/signup/jobseeker.
 * Also re-used as the BASE schema that recruiter.schema extends.
 *
 * EXAMPLE valid input:
 *   { "name": "Alex", "email": "alex@example.com", "password": "mypass123" }
 */
export const signupSchema = z.object({
  // Name must be at least 1 non-whitespace character.
  name: z.string().min(1, 'Name is required'),

  // z.email() is shorthand for z.string().email() in Zod v4.
  // EXAMPLE: "alex@" → fails; "alex@example.com" → passes
  email: z.email('Invalid email'),

  // Password must be at least 6 characters.
  // This is a minimal requirement; real apps should enforce more complexity.
  // EXAMPLE: "abc12" → fails (5 chars); "abc123" → passes (6 chars)
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

// TypeScript type inferred from the schema.
export type SignupInput = z.infer<typeof signupSchema>;

// ── Update Profile ────────────────────────────────────────────────────────────
/**
 * Schema for PATCH /api/jobseeker/profile.
 * All fields are optional — the user can update just one field at a time.
 *
 * EXAMPLE valid partial update:
 *   { "bio": "I love TypeScript", "skills": ["Node.js", "React"] }
 *
 * EXAMPLE with invalid field:
 *   { "resumeUrl": "not-a-url" }
 *   → { message: 'Validation failed', errors: [{ message: 'Invalid URL', path: ['resumeUrl'] }] }
 */
export const updateJobSeekerProfileSchema = z.object({
  // .max(500) limits bio to 500 characters. .optional() means the field can be absent.
  bio: z.string().max(500, 'Bio must be at most 500 characters').optional(),

  location: z.string().max(100, 'Location must be at most 100 characters').optional(),

  // z.array(z.string().min(1)) → an array where each element is a non-empty string.
  // EXAMPLE: ["TypeScript", "Node.js"] → valid; [""] → fails (min(1) on each element)
  skills: z.array(z.string().min(1)).optional(),

  education: z.string().optional(),
  experience: z.string().optional(),

  // z.string().url() validates an HTTPS/HTTP URL.
  // .or(z.literal('')) allows the user to clear the resumeUrl by sending an empty string.
  // EXAMPLE: "https://resume.pdf" → valid; "" → valid (clears URL); "notaurl" → fails
  resumeUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
});

export type UpdateJobSeekerProfileInput = z.infer<typeof updateJobSeekerProfileSchema>;
