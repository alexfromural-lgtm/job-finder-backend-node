// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/validators/application.schema.ts  — Zod schemas for job applications
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { z } from 'zod';

// ── Apply to Job ──────────────────────────────────────────────────────────────
/**
 * Schema for POST /api/jobseeker/apply/:jobId request body.
 * Only coverLetter is in the body — jobId comes from the URL parameter.
 *
 * EXAMPLE valid body:
 *   { "coverLetter": "I am excited to apply because..." }
 *
 * EXAMPLE valid body (cover letter omitted — it's optional):
 *   {}
 *
 * EXAMPLE invalid body:
 *   { "coverLetter": "a".repeat(2001) }
 *   → { message: 'Validation failed', errors: [{ message: 'Cover letter must be at most 2000 characters' }] }
 */
export const applicationSchema = z.object({
  // .max(2000) limits cover letter length to 2000 characters.
  // .optional() means the user can apply without writing a cover letter.
  coverLetter: z.string().max(2000, 'Cover letter must be at most 2000 characters').optional(),
});

export type ApplicationInput = z.infer<typeof applicationSchema>;

// ── Update Application Status (Recruiter) ─────────────────────────────────────
/**
 * Schema for PATCH /api/recruiter/applications/:id/status request body.
 * Only a recruiter can call this endpoint (enforced in the route with authorizeRoles).
 *
 * CONCEPT: z.enum()
 *   z.enum(['a', 'b', 'c']) creates a schema that accepts ONLY those literal values.
 *   This maps directly to the ApplicationStatus Prisma enum.
 *   If the client sends an invalid status string the request is rejected before
 *   hitting the database.
 *
 * EXAMPLE valid body:
 *   { "status": "shortlisted" }
 *
 * EXAMPLE invalid body:
 *   { "status": "approved" }
 *   → 400 { errors: [{ message: 'Status must be one of: submitted, shortlisted, rejected, under_review' }] }
 */
export const applicationStatusSchema = z.object({
  // The values here must match the ApplicationStatus enum in prisma/schema.prisma.
  // If you add a new status to Prisma, add it here too.
  status: z.enum(['submitted', 'shortlisted', 'rejected', 'under_review'], {
    error: 'Status must be one of: submitted, shortlisted, rejected, under_review',
  }),
});

export type ApplicationStatusInput = z.infer<typeof applicationStatusSchema>;
