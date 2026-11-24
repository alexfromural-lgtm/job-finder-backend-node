// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/controllers/jobseeker.controller.ts  — Job seeker HTTP handlers
//
// CONCEPT: 202 Accepted (async operations)
//   The applyToJob and saveJob handlers don't write to the database directly.
//   Instead they add a job to the Bull queue and immediately return 202 Accepted.
//   This tells the client "we received your request and will process it soon."
//
//   202 vs 201 vs 200:
//     200 OK      — synchronous success, resource returned.
//     201 Created — synchronous success, new resource created.
//     202 Accepted— request received but processing is asynchronous (not done yet).
//
//   EXAMPLE flow for applyToJob:
//     Client → POST /apply/job-123 → 202 { queueJobId: "5", status: "queued" }
//     Client polls → GET /api/queue/job/5 → { status: "completed", result: {...} }
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as JobseekerService from '../services/jobseeker.service';
// dbWriteQueue is the Bull queue — we add jobs here; the worker processes them.
import dbWriteQueue from '../queue/queue';

/**
 * GET /api/jobseeker/profile
 * Returns the job seeker's full profile.
 */
export const getProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const profile = await JobseekerService.getJobSeekerProfile(userId);

    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/jobseeker/profile
 * Partial profile update — only provided fields are changed.
 *
 * EXAMPLE request: { "bio": "Looking for Node.js roles", "location": "NYC" }
 * EXAMPLE response: { "profile": { "bio": "...", "location": "NYC", ... } }
 */
export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    // req.body has been validated and typed by validate(updateJobSeekerProfileSchema)
    const profile = await JobseekerService.updateJobSeekerProfile(userId, req.body);
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/jobseeker/apply/:jobId
 * Queues a job application for async processing.
 *
 * WHY ASYNC?
 *   Many job seekers may apply to the same job simultaneously.
 *   Processing all applications synchronously could cause DB write contention.
 *   Queueing absorbs the spike and processes applications at a controlled rate.
 *
 * EXAMPLE response (202 Accepted — not done yet, just queued):
 *   { "queueJobId": "42", "status": "queued" }
 */
export const applyToJob = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const jobId = req.params.jobId; // from the URL: /apply/:jobId
    const { coverLetter } = req.body; // optional field validated by applicationSchema

    // dbWriteQueue.add(payload) enqueues the operation in Redis.
    // Returns a Bull Job object with an auto-incremented id.
    const job = await dbWriteQueue.add({ type: 'apply-to-job', userId, jobId, coverLetter });

    // 202 Accepted — processing is deferred. Client uses queueJobId to poll status.
    res.status(202).json({ queueJobId: job.id, status: 'queued' });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/jobseeker/applications
 * Lists all applications submitted by this job seeker.
 */
export const getApplications = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const applications = await JobseekerService.getApplications(userId);
    res.status(200).json({ applications });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/jobseeker/applications/:id
 * Withdraws (deletes) an application. Only the applicant can do this.
 *
 * :id is the application UUID (not the job UUID).
 * EXAMPLE: DELETE /api/jobseeker/applications/app-uuid-here
 */
export const withdrawApplication = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const applicationId = req.params.id; // the application's own UUID

    // Service checks ownership (application.jobSeekerId === current user's profile id).
    await JobseekerService.withdrawApplication(userId, applicationId);
    res.status(200).json({ message: 'Application withdrawn successfully' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/jobseeker/saved/:jobId
 * Bookmarks a job. Processed asynchronously via the queue.
 *
 * EXAMPLE response (202 Accepted):
 *   { "queueJobId": "43", "status": "queued" }
 */
export const saveJob = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const jobId = req.params.jobId;

    const job = await dbWriteQueue.add({ type: 'save-job', userId, jobId });
    res.status(202).json({ queueJobId: job.id, status: 'queued' });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/jobseeker/saved
 * Lists all bookmarked jobs for this user.
 */
export const getSavedJobs = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const savedJobs = await JobseekerService.getSavedJobs(userId);
    res.status(200).json({ savedJobs });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/jobseeker/saved/:jobId
 * Removes a job from the bookmark list.
 */
export const unsaveJob = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const jobId = req.params.jobId;

    await JobseekerService.unsaveJob(userId, jobId);
    res.status(200).json({ message: 'Job removed from saved list' });
  } catch (err) {
    next(err);
  }
};
