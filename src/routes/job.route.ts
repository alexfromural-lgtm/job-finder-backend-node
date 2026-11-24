// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/routes/job.route.ts  — Job CRUD route definitions
//
// Mounted in index.ts as: app.use('/api/jobs', jobRoutes)
// So router.get('/all') → GET /api/jobs/all
//
// IMPORTANT: Route ORDER matters in Express.
//   Express matches routes top-to-bottom and stops at the first match.
//   router.get('/recruiter', ...) must come BEFORE router.get('/:id', ...)
//   because '/:id' would match the string "recruiter" as a parameter otherwise.
//
//   EXAMPLE (wrong order):
//     router.get('/:id',       getJobById)   // ← added first
//     router.get('/recruiter', getByRecruiter) // ← NEVER reached because :id catches "recruiter"
//
//   EXAMPLE (correct order — this file):
//     router.get('/recruiter', getByRecruiter) // ← checked first → matches /recruiter exactly
//     router.get('/:id',       getJobById)     // ← checked second → matches everything else
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Router } from 'express';
import { authorizeRoles, requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { jobSchema } from '../validators/job.schema';
import * as JobController from '../controllers/job.controller';

const router = Router();

// ── Public routes (no auth required) ─────────────────────────────────────────

// GET /api/jobs/all  — anyone can browse all active jobs (no login needed).
// EXAMPLE: a visitor on the homepage can see job listings before signing up.
router.get('/all', JobController.getAllJobs);

// ── Recruiter-only routes ─────────────────────────────────────────────────────

// POST /api/jobs  — create a new job listing.
// requireAuth → authorizeRoles('RECRUITER') → validate(jobSchema) → createJob
router.post(
  '/',
  requireAuth,                    // must be logged in
  authorizeRoles('RECRUITER'),    // must be a recruiter
  validate(jobSchema),            // body must match the full job schema
  JobController.createJob
);

// GET /api/jobs/recruiter  — get all jobs posted BY the logged-in recruiter.
// Must be BEFORE the /:id route (explained in file header above).
router.get(
  '/recruiter',
  requireAuth,
  authorizeRoles('RECRUITER'),
  JobController.getJobsByRecruiter
);

// GET /api/jobs/:id  — get a single job by its UUID.
// :id is a URL parameter — Express captures it as req.params.id.
// EXAMPLE: GET /api/jobs/a1b2c3d4 → req.params.id === 'a1b2c3d4'
// Must be AFTER /recruiter to avoid catching "recruiter" as an id.
router.get('/:id', JobController.getJobById);

// PUT /api/jobs/:id  — update a job (recruiter only).
// jobSchema.partial() makes all fields optional so partial updates are allowed.
// EXAMPLE: { "title": "Updated Title" } — only title changes, other fields untouched.
router.put(
  '/:id',
  requireAuth,
  authorizeRoles('RECRUITER'),
  validate(jobSchema.partial()),  // partial() makes every field optional
  JobController.updateJob
);

// DELETE /api/jobs/:id  — delete a job (recruiter only).
router.delete('/:id', requireAuth, authorizeRoles('RECRUITER'), JobController.deleteJob);

export default router;
