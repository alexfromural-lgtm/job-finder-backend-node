// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/queue/types.ts  — TypeScript types for the Bull job queue payloads
//
// CONCEPT: Discriminated Union
//   A discriminated union is a TypeScript pattern where multiple types share
//   a common "tag" field (here: `type`) that lets you safely narrow the type
//   inside a switch/if statement.
//
//   EXAMPLE:
//     type Shape = { type: 'circle'; radius: number }
//                | { type: 'rectangle'; width: number; height: number };
//
//     function area(shape: Shape) {
//       switch (shape.type) {
//         case 'circle':    return Math.PI * shape.radius ** 2;  // radius is known ✓
//         case 'rectangle': return shape.width * shape.height;   // width/height known ✓
//       }
//     }
//
// WHY TYPED QUEUE PAYLOADS?
//   The Bull worker receives jobs as generic `Job<data>` objects. Without a
//   typed payload, `job.data` would be `any` — no autocomplete, no compile-time
//   safety. By defining each payload type here and unioning them, the worker's
//   switch statement gets full TypeScript narrowing.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Discriminated union of all queued write operation payloads.
 * Only high-traffic jobseeker write operations are queued.
 *
 * The `type` field is the discriminant — it uniquely identifies each variant.
 */

// ── apply-to-job ─────────────────────────────────────────────────────────────
// Payload for the job application flow.
// EXAMPLE:
//   dbWriteQueue.add({ type: 'apply-to-job', userId: 'u1', jobId: 'j1', coverLetter: 'Hi...' })
export interface ApplyToJobPayload {
  type: 'apply-to-job';     // discriminant — must be this exact literal string
  userId: string;           // the job seeker's user ID (from JWT)
  jobId: string;            // the job being applied to
  coverLetter?: string;     // optional cover letter text (max 2000 chars per schema)
}

// ── save-job ──────────────────────────────────────────────────────────────────
// Payload for bookmarking a job for later.
// EXAMPLE:
//   dbWriteQueue.add({ type: 'save-job', userId: 'u1', jobId: 'j2' })
export interface SaveJobPayload {
  type: 'save-job';  // different literal → TypeScript distinguishes from ApplyToJobPayload
  userId: string;
  jobId: string;
}

// ── Union type ────────────────────────────────────────────────────────────────
// QueuePayload is the union of ALL possible payload types.
// The queue is typed as Bull<QueuePayload>, which means:
//   - job.data is narrowed to the specific payload once you check job.data.type
// EXAMPLE (in worker.ts):
//   switch (data.type) {
//     case 'apply-to-job': data.coverLetter  // ✓ only available here
//     case 'save-job':     data.jobId        // ✓ always available
//     default:             // TypeScript exhaustive check catches missed cases
//   }
export type QueuePayload = ApplyToJobPayload | SaveJobPayload;
