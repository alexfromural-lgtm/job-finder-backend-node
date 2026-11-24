// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/routes/jobseeker.route.ts  — Job seeker route definitions
//
// Mounted in index.ts as: app.use('/api/jobseeker', jobseekerRoutes)
//
// All routes here are protected with requireAuth + authorizeRoles('JOB_SEEKER').
// A recruiter cannot access these endpoints unless they also hold the JOB_SEEKER role
// (which is the case if they upgraded from job seeker via /upgrade/recruiter).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Router } from 'express';
import { authorizeRoles, requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { applicationSchema } from '../validators/application.schema';
import { updateJobSeekerProfileSchema } from '../validators/jobseeker.schema';
import * as JobseekerController from '../controllers/jobseeker.controller';

const router = Router();

// ── Profile ───────────────────────────────────────────────────────────────────

// GET /api/jobseeker/profile  — fetch the logged-in job seeker's profile.
router.get('/profile', requireAuth, authorizeRoles('JOB_SEEKER'), JobseekerController.getProfile);

// PATCH /api/jobseeker/profile  — partial profile update.
// CONCEPT: PATCH vs PUT
//   PUT   → replace the entire resource (all fields must be provided).
//   PATCH → modify only the provided fields (partial update).
//   We use PATCH here because a job seeker may only want to update their bio,
//   without sending all other fields.
router.patch(
  '/profile',
  requireAuth,
  authorizeRoles('JOB_SEEKER'),
  validate(updateJobSeekerProfileSchema), // all schema fields are optional → partial update OK
  JobseekerController.updateProfile
);

// ── Applications ──────────────────────────────────────────────────────────────

// POST /api/jobseeker/apply/:jobId  — apply to a job.
// :jobId comes from the URL; coverLetter comes from the request body.
// EXAMPLE: POST /api/jobseeker/apply/job-uuid-here  { "coverLetter": "..." }
// The controller does NOT write to the DB directly — it enqueues the operation
// and returns 202 Accepted immediately (async processing via Bull).
router.post(
  '/apply/:jobId',
  requireAuth,
  authorizeRoles('JOB_SEEKER'),
  validate(applicationSchema),  // validates optional coverLetter field
  JobseekerController.applyToJob
);

// GET /api/jobseeker/applications  — get all applications submitted by the user.
router.get(
  '/applications',
  requireAuth,
  authorizeRoles('JOB_SEEKER'),
  JobseekerController.getApplications
);

// DELETE /api/jobseeker/applications/:id  — withdraw an application.
// :id is the application's UUID, not the job's UUID.
router.delete(
  '/applications/:id',
  requireAuth,
  authorizeRoles('JOB_SEEKER'),
  JobseekerController.withdrawApplication
);

// ── Saved jobs ────────────────────────────────────────────────────────────────

// POST /api/jobseeker/saved/:jobId  — bookmark a job for later.
// Also async (queued) — returns 202 immediately.
router.post(
  '/saved/:jobId',
  requireAuth,
  authorizeRoles('JOB_SEEKER'),
  JobseekerController.saveJob
);

// GET /api/jobseeker/saved  — list all bookmarked jobs.
router.get('/saved', requireAuth, authorizeRoles('JOB_SEEKER'), JobseekerController.getSavedJobs);

// DELETE /api/jobseeker/saved/:jobId  — remove a job from bookmarks.
router.delete(
  '/saved/:jobId',
  requireAuth,
  authorizeRoles('JOB_SEEKER'),
  JobseekerController.unsaveJob
);

export default router;
