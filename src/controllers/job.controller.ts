// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/controllers/job.controller.ts  — Job CRUD HTTP handlers
//
// See auth.controller.ts for a full explanation of the controller pattern.
//
// PATTERN: validateRecruiterProfile guard clause
//   Many handlers here start with:
//     const recruiter = await jobUtils.validateRecruiterProfile(req.userId!, res);
//     if (!recruiter) return;
//   This checks that the authenticated user HAS a recruiter profile in the DB
//   (beyond just having the RECRUITER role in their JWT). If not, it sends 404
//   and returns. The `if (!recruiter) return;` stops the function immediately.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as JobService from '../services/job.service';
import * as jobUtils from '../utils/job.utils';

/**
 * GET /api/jobs/recruiter
 * Returns all jobs posted by the currently logged-in recruiter.
 *
 * EXAMPLE response:
 *   { "jobs": [{ "id": "...", "title": "Node.js Dev", "isActive": true, ... }] }
 */
export const getJobsByRecruiter = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Verify the recruiter profile exists in the DB and get its ID.
    const recruiter = await jobUtils.validateRecruiterProfile(req.userId!, res);
    if (!recruiter) return; // 404 already sent; stop here

    const jobs = await JobService.getJobsByRecruiter(recruiter.id);
    res.status(200).json({ jobs });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/jobs
 * Creates a new job listing for the authenticated recruiter.
 *
 * EXAMPLE request body (validated by validate(jobSchema)):
 *   { "title": "Frontend Dev", "description": "...", "requirements": "...", "location": "Remote" }
 *
 * EXAMPLE success response (201):
 *   { "message": "Job created successfully!", "job": { "id": "uuid", "title": "Frontend Dev", ... } }
 */
export const createJob = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const recruiter = await jobUtils.validateRecruiterProfile(req.userId!, res);
    if (!recruiter) return;

    // recruiter.id is the RecruiterProfile.id (not the User.id).
    // The job is associated with the recruiter profile, not the user directly.
    const job = await JobService.createJob(recruiter.id, req.body);
    res.status(201).json({ message: 'Job created successfully!', job });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/jobs/:id
 * Returns a single job by its ID. Public — no auth required.
 *
 * req.params.id — Express extracts :id from the URL path.
 * EXAMPLE: GET /api/jobs/abc-123 → req.params.id === 'abc-123'
 */
export const getJobById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const jobId = req.params.id;
    const job = await JobService.getJobById(jobId);

    // getJobById returns null if not found (Prisma findUnique returns null, not undefined).
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.status(200).json({ job });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/jobs/:id
 * Updates a job listing. The recruiter must own the job (service-layer check).
 *
 * validate(jobSchema.partial()) was applied in the route — all fields are optional.
 * EXAMPLE: { "title": "New Title" } → only title is updated, rest unchanged.
 */
export const updateJob = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const recruiter = await jobUtils.validateRecruiterProfile(req.userId!, res);
    if (!recruiter) return;

    const jobId = req.params.id;
    // The service verifies that this recruiter owns the job before updating.
    const job = await JobService.updateJob(recruiter.id, jobId, req.body);
    res.status(200).json({ message: 'Job updated successfully!', job });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/jobs/:id
 * Deletes a job listing. The recruiter must own the job.
 *
 * EXAMPLE success response (200):
 *   { "message": "Job deleted successfully!" }
 */
export const deleteJob = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const recruiter = await jobUtils.validateRecruiterProfile(req.userId!, res);
    if (!recruiter) return;

    const jobId = req.params.id;
    await JobService.deleteJob(recruiter.id, jobId);
    res.status(200).json({ message: 'Job deleted successfully!' });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/jobs/all
 * Returns all active job listings. Public — no auth required.
 *
 * EXAMPLE response:
 *   { "jobs": [{ "id": "...", "title": "...", "isActive": true, "recruiter": {...} }] }
 */
export const getAllJobs = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const jobs = await JobService.getAllJobs();
    res.status(200).json({ jobs });
  } catch (err) {
    next(err);
  }
};
