// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/queue/worker.ts  — Bull queue job processor (the "consumer")
//
// CONCEPT: Producer / Consumer pattern
//   Producer (jobseeker.controller): adds a job to the queue and immediately
//     responds 202 Accepted with the queueJobId.
//   Consumer (this file): picks up jobs from Redis one-by-one (up to CONCURRENCY
//     at a time), runs the actual DB operation, and logs success/failure.
//
//   This file is imported in index.ts as a SIDE-EFFECT import:
//     import './queue/worker';
//   That means Node.js executes this file when the server starts, registering
//   the processor with Bull. After that, Bull manages the rest.
//
// CONCEPT: Exhaustive switch (TypeScript)
//   After handling every known case in the switch, the `default` branch assigns
//   `data` to a variable typed as `never`. If you add a new QueuePayload type
//   but forget to handle it in the switch, TypeScript will error here at
//   compile time — catching the bug before it reaches production.
//
//   EXAMPLE:
//     const _exhaustive: never = data;  // ❌ TS error if any case is unhandled
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Job } from 'bull';
import dbWriteQueue from './queue';
import { QueuePayload } from './types';
import * as JobseekerService from '../services/jobseeker.service';

// CONCURRENCY: how many jobs are processed IN PARALLEL.
// EXAMPLE: QUEUE_CONCURRENCY=5 → up to 5 DB writes happen simultaneously.
// Higher concurrency = more DB load; lower = slower throughput.
// parseInt(string, radix): radix 10 means parse as a decimal number.
const CONCURRENCY = parseInt(process.env.QUEUE_CONCURRENCY || '5', 10);

/**
 * Central processor for all queued DB write operations.
 * Dispatches to the appropriate service based on job type.
 *
 * dbWriteQueue.process(concurrency, handler)
 *   - concurrency: max simultaneous jobs
 *   - handler: async function (job) => result
 *     The return value is stored as job.returnvalue — accessible via GET /api/queue/job/:id
 *
 * EXAMPLE job object:
 *   job.id       → '42'
 *   job.data     → { type: 'apply-to-job', userId: 'u1', jobId: 'j1' }
 *   job.attemptsMade → 0 (first try), 1, 2 on retries
 */
dbWriteQueue.process(CONCURRENCY, async (job: Job<QueuePayload>) => {
  const { data } = job;
  console.log(`[Worker] Processing job #${job.id} | type: ${data.type}`);

  // Switch on the discriminant field. TypeScript knows exactly which interface
  // `data` is after each `case` label (discriminated union narrowing).
  switch (data.type) {

    // ── Case: apply-to-job ───────────────────────────────────────────────────
    case 'apply-to-job': {
      // Inside this block, TypeScript knows data is ApplyToJobPayload,
      // so data.coverLetter is available (optional string).
      const application = await JobseekerService.applyToJob(
        data.userId,
        data.jobId,
        data.coverLetter   // may be undefined — the service handles that
      );
      console.log(`[Worker] Job #${job.id} (apply-to-job) completed.`);
      // The returned value is stored as job.returnvalue in Redis.
      // The client can retrieve it via GET /api/queue/job/:id.
      return application;
    }

    // ── Case: save-job ───────────────────────────────────────────────────────
    case 'save-job': {
      // TypeScript now knows data is SaveJobPayload — no coverLetter here.
      const savedJob = await JobseekerService.saveJob(data.userId, data.jobId);
      console.log(`[Worker] Job #${job.id} (save-job) completed.`);
      return savedJob;
    }

    // ── Exhaustive default ───────────────────────────────────────────────────
    default: {
      // `never` means TypeScript should consider this branch unreachable.
      // If QueuePayload is extended with a new type and this switch is not updated,
      // TypeScript errors here: "Type 'NewPayload' is not assignable to type 'never'."
      // This is a compile-time safety net — the error appears before shipping.
      const _exhaustive: never = data;
      throw new Error(`Unknown job type: ${(_exhaustive as any).type}`);
    }
  }
});

// ── Queue event listeners ─────────────────────────────────────────────────────
// These fire AFTER a job completes or fails (not inside the processor).

// 'completed' fires when the processor returns without throwing.
// EXAMPLE log: [Worker] ✓ Job #42 (apply-to-job) succeeded.
dbWriteQueue.on('completed', (job) => {
  console.log(`[Worker] ✓ Job #${job.id} (${job.data.type}) succeeded.`);
});

// 'failed' fires when the processor throws AND all retry attempts are exhausted.
// EXAMPLE log: [Worker] ✗ Job #43 (save-job) failed after 3 attempt(s): Unique constraint failed
dbWriteQueue.on('failed', (job, err) => {
  console.error(
    `[Worker] ✗ Job #${job.id} (${job.data.type}) failed after ${job.attemptsMade} attempt(s): ${err.message}`
  );
});

// Startup log: confirms the worker is registered and shows configured concurrency.
// EXAMPLE: [Worker] db-write-queue worker started (concurrency: 5)
console.log(`[Worker] db-write-queue worker started (concurrency: ${CONCURRENCY})`);
