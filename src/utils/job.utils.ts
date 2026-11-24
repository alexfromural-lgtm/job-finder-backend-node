// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/utils/job.utils.ts  — Shared job/recruiter helpers
//
// WHY A SEPARATE FILE?
//   Multiple job-related controllers (job.controller, jobseeker.controller) need
//   to validate that a recruiter profile exists before they can proceed.
//   Extracting this check here avoids duplicating the same DB lookup + 404
//   response in every controller that needs it.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Response } from 'express';
import * as RecruiterService from '../services/recruiter.service';

/**
 * Validates that a recruiter profile exists for the given user.
 * Returns the profile if found, or sends a 404 response and returns null.
 *
 * USAGE PATTERN (guard clause):
 *   const recruiter = await validateRecruiterProfile(req.userId!, res);
 *   if (!recruiter) return;  // ← 404 was already sent; stop processing
 *   // recruiter is now a full RecruiterProfile object
 *
 * EXAMPLE:
 *   export const createJob = async (req, res, next) => {
 *     const recruiter = await validateRecruiterProfile(req.userId!, res);
 *     if (!recruiter) return;                     // 404 already sent
 *     const job = await JobService.createJob(recruiter.id, req.body);
 *     res.status(201).json({ job });
 *   };
 *
 * NOTE: This function sends the response itself (instead of throwing) because
 * the controller needs to `return` immediately without calling next(err).
 * New code should prefer throwing AppError and letting the global handler respond.
 */
export const validateRecruiterProfile = async (userId: string, res: Response) => {
  // Delegate the actual DB lookup to the recruiter service layer.
  const recruiter = await RecruiterService.getRecruiterProfile(userId);

  if (!recruiter) {
    // Send 404 and return null so the caller can do `if (!recruiter) return;`
    res.status(404).json({ error: 'Recruiter profile not found. Please create one first.' });
    return null;
  }

  // Return the full profile so callers can use recruiter.id, recruiter.companyName, etc.
  return recruiter;
};
