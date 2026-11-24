// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/routes/recruiter.route.ts  — Recruiter route definitions
//
// Mounted in index.ts as: app.use('/api/recruiter', recruiterRoutes)
//
// All routes require RECRUITER role. A user who signed up as a job seeker and
// then upgraded (POST /api/auth/upgrade/recruiter) also qualifies.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Router } from 'express';
import { authorizeRoles, requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { updateRecruiterProfileSchema } from '../validators/recruiter-profile.schema';
import { applicationStatusSchema } from '../validators/application.schema';
import * as RecruiterController from '../controllers/recruiter.controller';

const router = Router();

// ── Profile ───────────────────────────────────────────────────────────────────

// GET /api/recruiter/profile  — fetch the logged-in recruiter's profile.
router.get('/profile', requireAuth, authorizeRoles('RECRUITER'), RecruiterController.getProfile);

// PATCH /api/recruiter/profile  — update company info (partial update).
// EXAMPLE: { "industry": "HealthTech" }  → only industry is updated
router.patch(
  '/profile',
  requireAuth,
  authorizeRoles('RECRUITER'),
  validate(updateRecruiterProfileSchema),
  RecruiterController.updateProfile
);

// ── Applications management ───────────────────────────────────────────────────

// GET /api/recruiter/jobs/:jobId/applications
// Lists all applications for a specific job.
// The recruiter must OWN the job (enforced in the service layer).
// :jobId is the UUID of a job posted by this recruiter.
// EXAMPLE: GET /api/recruiter/jobs/job-uuid-here/applications
router.get(
  '/jobs/:jobId/applications',
  requireAuth,
  authorizeRoles('RECRUITER'),
  RecruiterController.getApplicationsForJob
);

// PATCH /api/recruiter/applications/:id/status
// Updates a single application's status (e.g. shortlist, reject, review).
// The recruiter must own the job the application belongs to (service-level check).
// EXAMPLE: PATCH /api/recruiter/applications/app-uuid/status  { "status": "shortlisted" }
router.patch(
  '/applications/:id/status',
  requireAuth,
  authorizeRoles('RECRUITER'),
  validate(applicationStatusSchema), // ensures status is one of the allowed enum values
  RecruiterController.updateApplicationStatus
);

export default router;
