// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/validators/recruiter-profile.schema.ts  — Zod schema for profile updates
//
// Unlike the signup schema, ALL fields here are optional (partial update pattern).
// A recruiter can update just companyName without touching any other field.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { z } from 'zod';

/**
 * Schema for PATCH /api/recruiter/profile.
 * All fields are optional so a partial update is always valid.
 *
 * EXAMPLE valid body (partial update — only industry changes):
 *   { "industry": "FinTech" }
 *
 * EXAMPLE valid body (full update):
 *   { "companyName": "NewCo", "companyWebsite": "https://newco.io", "industry": "SaaS" }
 */
export const updateRecruiterProfileSchema = z.object({
  // .min(1) prevents sending an empty string to clear the company name.
  // Combined with .optional(), the field can be absent but not blank.
  // EXAMPLE: undefined → OK (field skipped); "" → fails; "ACME" → passes
  companyName: z.string().min(1, 'Company name is required').optional(),

  companyWebsite: z.url('Invalid URL').optional(),
  description: z.string().optional(),
  industry: z.string().optional(),
});

export type UpdateRecruiterProfileInput = z.infer<typeof updateRecruiterProfileSchema>;
