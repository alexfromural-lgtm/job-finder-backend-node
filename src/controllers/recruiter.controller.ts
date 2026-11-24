// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/controllers/recruiter.controller.ts  — Recruiter HTTP handlers
//
// See auth.controller.ts for general controller pattern explanation.
//
// OWNERSHIP CHECK: The service layer verifies that the authenticated recruiter
// OWNS the job before returning applications or updating status.
// This prevents Recruiter A from seeing applications for Recruiter B's jobs.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as RecruiterService from '../services/recruiter.service';
import { applicationStatusSchema } from '../validators/application.schema';

/**
 * GET /api/recruiter/profile
 * Returns the recruiter's profile including user info.
 *
 * EXAMPLE response:
 *   { "profile": { "id": "...", "companyName": "ACME", "user": { "name": "Alice" } } }
 */
export const getProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const profile = await RecruiterService.getRecruiterProfile(userId);

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
 * PATCH /api/recruiter/profile
 * Partial update of the recruiter's company profile.
 *
 * EXAMPLE request: { "industry": "FinTech", "description": "We build..." }
 */
export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const profile = await RecruiterService.updateRecruiterProfile(userId, req.body);
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/recruiter/jobs/:jobId/applications
 * Lists all applications for a specific job posted by this recruiter.
 *
 * AUTHORIZATION: The service checks job.recruiterId === recruiter.id.
 * If the job belongs to a different recruiter → 403 Forbidden.
 *
 * EXAMPLE response:
 *   { "applications": [{ "id": "...", "status": "submitted", "jobSeeker": { "user": {...} } }] }
 */
export const getApplicationsForJob = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.userId!;
    const jobId = req.params.jobId; // the job's UUID from the URL

    const applications = await RecruiterService.getApplicationsForJob(userId, jobId);
    res.status(200).json({ applications });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/recruiter/applications/:id/status
 * Updates an application's status (shortlist, reject, etc.).
 *
 * DOUBLE VALIDATION: The validate() middleware already ran (in the route).
 * This controller does a belt-and-suspenders re-parse for safety, which is
 * useful if this controller is ever called without the middleware (e.g. tests).
 *
 * EXAMPLE request: { "status": "shortlisted" }
 * EXAMPLE response: { "application": { "id": "...", "status": "shortlisted", ... } }
 */
export const updateApplicationStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.userId!;
    const applicationId = req.params.id; // the application's UUID

    // Belt-and-suspenders validation: re-parse the body even though validate()
    // already ran in the route. Defensive — guards against direct programmatic calls.
    const parsed = applicationStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      // issues[0].message → first validation error message.
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const application = await RecruiterService.updateApplicationStatus(
      userId,
      applicationId,
      parsed.data.status // already typed as 'submitted' | 'shortlisted' | 'rejected' | 'under_review'
    );
    res.status(200).json({ application });
  } catch (err) {
    next(err);
  }
};
