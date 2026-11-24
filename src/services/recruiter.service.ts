// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/services/recruiter.service.ts  — Recruiter business logic
//
// CONCEPT: Authorisation at the service layer
//   Before returning applications or updating statuses, we verify:
//     1. The recruiter profile exists for this user.
//     2. The job belongs to THIS recruiter (job.recruiterId === recruiter.id).
//   If either check fails → throw AppError(403 Forbidden).
//
//   This double-check is important: the route's authorizeRoles('RECRUITER') only
//   confirms the user HAS the recruiter role in their JWT. The service layer
//   further confirms they own the specific resource they're trying to access.
//   EXAMPLE: Recruiter A can't read applications for Recruiter B's job,
//   even though both have the RECRUITER role.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { ApplicationStatus } from '@prisma/client';
import prisma from '../prisma/client';
import { AppError } from '../errors/AppError';

/**
 * Returns a recruiter's profile including their user info (name, email, roles).
 * Returns null if no profile exists for this userId.
 *
 * EXAMPLE return value:
 *   { id: '...', companyName: 'ACME', industry: 'Tech',
 *     user: { name: 'Alice', email: 'alice@acme.com', roles: ['RECRUITER'] } }
 */
export const getRecruiterProfile = async (userId: string) => {
  return prisma.recruiterProfile.findUnique({
    where: { userId },
    include: {
      user: {
        // Select only public user fields — not password!
        select: { name: true, email: true, roles: true },
      },
    },
  });
};

/**
 * Updates the recruiter's company profile.
 * Only provided fields are changed (Prisma update is always a partial update).
 *
 * EXAMPLE:
 *   updateRecruiterProfile('user-id', { industry: 'FinTech' })
 *   → only industry changes; other fields (companyName, etc.) remain as-is
 */
export const updateRecruiterProfile = async (
  userId: string,
  data: {
    companyName?: string;
    companyWebsite?: string;
    description?: string;
    industry?: string;
  }
) => {
  return prisma.recruiterProfile.update({
    where: { userId },
    data,
    include: {
      user: { select: { name: true, email: true, roles: true } },
    },
  });
};

/**
 * Returns all applications for a specific job, verifying the recruiter owns it.
 *
 * STEPS:
 *   1. Find the recruiter's profile by userId.
 *   2. Find the job by jobId.
 *   3. Verify the recruiter owns the job (job.recruiterId === recruiter.id).
 *   4. Fetch all applications for the job, including applicant details.
 *
 * EXAMPLE return value (array):
 *   [{ id: '...', status: 'submitted', coverLetter: '...', jobSeeker: { user: { name: 'Bob' } } }]
 */
export const getApplicationsForJob = async (userId: string, jobId: string) => {
  // Resolve the user's recruiter profile ID.
  const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId } });
  if (!recruiter) throw new AppError('Recruiter profile not found', 404);

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new AppError('Job not found', 404);

  // Ownership check: the job must belong to THIS recruiter.
  // recruiter.id = RecruiterProfile.id (not User.id)
  if (job.recruiterId !== recruiter.id)
    throw new AppError('You are not authorized to view applications for this job', 403);

  return prisma.application.findMany({
    where: { jobId },
    include: {
      jobSeeker: {
        // Deep include: Application → JobSeekerProfile → User
        include: {
          user: { select: { name: true, email: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
};

/**
 * Updates a single application's status (e.g. shortlist, reject, review).
 *
 * AUTHORIZATION:
 *   The recruiter must OWN the job the application belongs to.
 *   application.job.recruiterId === recruiter.id
 *
 * EXAMPLE:
 *   updateApplicationStatus('user-id', 'app-uuid', 'shortlisted')
 *   → returns the updated application with job title + applicant info
 */
export const updateApplicationStatus = async (
  userId: string,
  applicationId: string,
  status: ApplicationStatus  // the Prisma enum: submitted | shortlisted | rejected | under_review
) => {
  const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId } });
  if (!recruiter) throw new AppError('Recruiter profile not found', 404);

  // Fetch the application and JOIN the job (to check ownership).
  // include: { job: true } adds the job row to application.job in the result.
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { job: true }, // we need job.recruiterId for the ownership check
  });

  if (!application) throw new AppError('Application not found', 404);

  // Verify this recruiter's job is the one being applied to.
  if (application.job.recruiterId !== recruiter.id)
    throw new AppError('You are not authorized to update this application', 403);

  // Update the status and return the enriched application record.
  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: { status }, // e.g. 'shortlisted' — Prisma maps to ApplicationStatus enum
    include: {
      job: { select: { title: true } },
      jobSeeker: {
        include: { user: { select: { name: true, email: true } } },
      },
    },
  });

  return updated;
};
