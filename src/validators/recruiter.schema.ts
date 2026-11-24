// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/validators/recruiter.schema.ts  — Zod schema for recruiter signup
//
// CONCEPT: Zod schema extension with .extend()
//   Instead of re-writing all the base fields (name, email, password) again,
//   we import the jobseeker signupSchema and EXTEND it with recruiter-specific fields.
//   .extend() merges the new fields into the existing schema, producing a new schema.
//
//   EXAMPLE:
//     const baseSchema = z.object({ name: z.string() });
//     const extendedSchema = baseSchema.extend({ age: z.number() });
//     // extendedSchema validates: { name: string; age: number }
//
//   This is the Zod equivalent of TypeScript interface extension:
//     interface Base { name: string }
//     interface Extended extends Base { age: number }
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { z } from 'zod';
// Import the base jobseeker schema to extend it rather than duplicating fields.
import { signupSchema } from './jobseeker.schema';

/**
 * Schema for POST /api/auth/signup/recruiter and POST /api/auth/upgrade/recruiter.
 * Extends the base signup schema (name, email, password) with company details.
 *
 * EXAMPLE valid input:
 *   {
 *     "name": "Alice",
 *     "email": "alice@corp.com",
 *     "password": "securepass",
 *     "companyName": "Acme Corp",
 *     "companyWebsite": "https://acme.com",
 *     "industry": "Technology"
 *   }
 */
export const recruiterSignupSchema = signupSchema.extend({
  // companyName is required for a recruiter account.
  // EXAMPLE: "" → fails; "Acme Corp" → passes
  companyName: z.string().min(1, 'Company name is required'),

  // z.url() validates the string is a well-formed URL (must include the protocol).
  // .optional() means the field can be absent entirely.
  // EXAMPLE: "https://acme.com" → valid; "acme.com" → fails (missing protocol)
  companyWebsite: z.url('Invalid URL').optional(),

  // Free-text fields — just check it's a string; no length restriction enforced here.
  description: z.string().optional(),
  industry: z.string().optional(),
});

// TypeScript type inferred from the schema.
// Includes all fields from signupSchema PLUS the recruiter-specific ones.
// EXAMPLE: RecruiterSignupInput = { name, email, password, companyName, companyWebsite?, description?, industry? }
export type RecruiterSignupInput = z.infer<typeof recruiterSignupSchema>;
