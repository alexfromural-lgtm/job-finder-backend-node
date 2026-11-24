// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/routes/queue.route.ts  — Queue status polling endpoint
//
// Mounted in index.ts as: app.use('/api/queue', queueRoutes)
//
// CONCEPT: 202 Accepted + polling
//   Some write operations (applying, saving a job) are processed asynchronously
//   via the Bull queue. The controller immediately returns HTTP 202 (Accepted)
//   with a queueJobId. The client can then poll this endpoint to check if the
//   job completed, failed, or is still waiting.
//
//   FLOW:
//     1. Client: POST /api/jobseeker/apply/:jobId
//        → Response: 202 { queueJobId: "42", status: "queued" }
//
//     2. Client polls: GET /api/queue/job/42
//        → Response: 200 { status: "waiting" }
//        → Response: 200 { status: "active" }
//        → Response: 200 { status: "completed", result: { ... application object ... } }
//        → Response: 200 { status: "failed", failedReason: "Unique constraint..." }
//
//   Bull job statuses: waiting | active | completed | failed | delayed | paused
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Router, Request, Response } from 'express';
import dbWriteQueue from '../queue/queue';

const router = Router();

/**
 * GET /api/queue/job/:jobId
 *
 * Allows the client to poll the status of a queued write operation.
 * Returns job status and result (on completion) or failure reason.
 *
 * EXAMPLE response (job waiting in queue):
 *   { "id": "42", "type": "apply-to-job", "status": "waiting", "attemptsMade": 0, "createdAt": "..." }
 *
 * EXAMPLE response (job completed):
 *   { "id": "42", "type": "apply-to-job", "status": "completed", "result": { ...application... } }
 *
 * EXAMPLE response (job failed):
 *   { "id": "42", "type": "apply-to-job", "status": "failed", "failedReason": "Unique constraint failed" }
 */
router.get('/job/:jobId', async (req: Request, res: Response) => {
  // Extract :jobId from the URL.
  // EXAMPLE: GET /api/queue/job/42 → req.params.jobId === '42'
  const { jobId } = req.params;

  // dbWriteQueue.getJob(id) looks up the job in Redis by its ID.
  // Returns null if the job was removed (removeOnComplete: true) or never existed.
  const job = await dbWriteQueue.getJob(jobId);

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  // job.getState() queries Redis for the current processing state.
  // Possible values: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused'
  const state = await job.getState();

  // Build the base response object. Record<string, any> means an object where
  // keys are strings and values can be anything — we'll add more keys conditionally.
  const response: Record<string, any> = {
    id: job.id,
    type: job.data.type,          // 'apply-to-job' or 'save-job'
    status: state,
    attemptsMade: job.attemptsMade, // how many times the worker has tried this job
    // job.timestamp is the creation time in milliseconds since epoch.
    // .toISOString() converts to "2024-01-15T10:30:00.000Z" format.
    createdAt: new Date(job.timestamp).toISOString(),
  };

  // Conditionally add result if the job completed successfully.
  // job.returnvalue holds what the worker's processor function returned.
  // EXAMPLE: the application object created in the DB.
  if (state === 'completed') {
    response.result = job.returnvalue;
  }

  // Conditionally add failure reason if the job exhausted all retry attempts.
  // job.failedReason holds the error message from the last failed attempt.
  if (state === 'failed') {
    response.failedReason = job.failedReason;
  }

  res.status(200).json(response);
});

export default router;
