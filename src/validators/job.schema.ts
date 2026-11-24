// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/validators/job.schema.ts  — Zod schemas for job CRUD endpoints
//
// CONCEPT: Partial schemas with jobSchema.partial()
//   .partial() converts every field in the schema to optional.
//   This is used for PUT/PATCH endpoints where only some fields may be provided.
//
//   EXAMPLE:
//     const jobSchema    = z.object({ title: z.string(), location: z.string() });
//     const partialSchema = jobSchema.partial();
//     // partialSchema validates: { title?: string; location?: string }
//
//   We don't need to write a separate update schema — we derive it from the full one.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { z } from 'zod';

/**
 * Schema for POST /api/jobs (create) and base for PUT /api/jobs/:id (update).
 *
 * EXAMPLE valid input:
 *   {
 *     "title": "Senior Node.js Developer",
 *     "description": "We are looking for...",
 *     "requirements": "5+ years of Node.js...",
 *     "location": "Remote",
 *     "salaryRange": "$90k-$120k",
 *     "category": "Engineering"
 *   }
 */
export const jobSchema = z.object({
  // Required fields
  title:        z.string().min(1, 'Title is required').max(100),   // max(100) keeps titles concise
  description:  z.string().min(1, 'Description is required'),
  requirements: z.string().min(1, 'Requirements are required'),
  location:     z.string().min(1, 'Location is required'),

  // Optional fields — can be omitted from the request body.
  // EXAMPLE: a job listing might not include salary info.
  salaryRange: z.string().optional(),
  category:    z.string().optional(),
});

// Full schema type — used for job creation.
export type JobInput = z.infer<typeof jobSchema>;

// Derived partial type — used for job updates (PUT /api/jobs/:id).
// jobSchema.partial() makes ALL fields optional so callers can send just the
// fields they want to change.
// ReturnType<typeof jobSchema.partial> captures the TypeScript type of the
// object returned by calling .partial() on jobSchema.
// EXAMPLE: { "title": "Updated Title" }  → valid partial update
export type JobUpdateInput = z.infer<ReturnType<typeof jobSchema.partial>>;
