// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/queue/queue.ts  — Bull job queue instance (shared singleton)
//
// CONCEPT: Why a job queue?
//   Some write operations (applying to a job, saving a job) can receive many
//   simultaneous requests. Instead of sending ALL of them directly to the
//   database at once (which could overload it), we enqueue them in Redis and
//   process them one-by-one (or up to CONCURRENCY at a time) in a background
//   worker. This decouples request handling from DB writes.
//
// CONCEPT: Bull
//   Bull is a Node.js library for Redis-backed job queues.
//   - Producer (controller): adds a job → `queue.add(payload)`
//   - Consumer (worker):     processes jobs → `queue.process(handler)`
//   Both share the same Bull instance (same Redis key).
//
// CONCEPT: Retry with exponential backoff
//   If a DB write fails (e.g. momentary network hiccup), Bull retries it
//   automatically. "Exponential backoff" means the wait time between retries
//   grows: 500ms → 1000ms → 2000ms …
//   This prevents "thundering herd" (all retries hitting the DB at once).
//
// SINGLETON: This file exports ONE queue instance. Both the controller and worker
//   import this same instance so they operate on the same Redis queue.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import Bull from 'bull';
import { QueuePayload } from './types';

// REDIS_URL fallback: if ENV is not loaded (unlikely), default to localhost.
// In production, this comes from the .env file (validated by config/env.ts).
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * Shared Bull queue for all database write operations that need
 * to be processed asynchronously under high concurrency.
 *
 * new Bull<QueuePayload>('queue-name', options)
 *   - 'db-write-queue' is the Redis key prefix for this queue's jobs.
 *   - QueuePayload is the TypeScript type of job.data in the worker.
 */
const dbWriteQueue = new Bull<QueuePayload>('db-write-queue', {
  redis: REDIS_URL,

  defaultJobOptions: {
    // attempts: how many times to try a job before marking it failed.
    // EXAMPLE: a job fails → retried at 500ms, 1000ms → succeeds on attempt 3.
    attempts: 3,

    // backoff: strategy for how long to wait between retry attempts.
    // 'exponential' means: delay * 2^(attempt - 1)
    // EXAMPLE with delay: 500 → waits 500ms, 1000ms, 2000ms on attempts 1, 2, 3.
    backoff: {
      type: 'exponential',
      delay: 500, // base delay in milliseconds
    },

    // removeOnComplete: false → keep completed jobs in Redis.
    // This lets the client poll GET /api/queue/job/:id to see the result.
    // Set to true (or a TTL) in production if you don't need job history.
    removeOnComplete: false,

    // removeOnFail: false → keep failed jobs so you can inspect them for debugging.
    removeOnFail: false,
  },
});

// Global error listener — catches Bull-level errors (e.g. Redis connection lost).
// Individual job failures are handled in the worker's 'failed' event.
dbWriteQueue.on('error', (err) => {
  console.error('[Queue] Bull queue error:', err.message);
});

export default dbWriteQueue;
