// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/services/jobseeker.service.ts  — Job seeker business logic
//
// CONCEPT: Prisma `upsert` (update or insert)
//   prisma.model.upsert({ where, update, create })
//   • If a record matching `where` exists → run `update` (can be a no-op {}).
//   • If no match → run `create`.
//   This is atomic and avoids the race condition of a manual "check then insert".
//
//   EXAMPLE: Save a job (idempotent — saving twice is not an error):
//     prisma.savedJob.upsert({
//       where: { jobId_jobSeekerId: { jobId, jobSeekerId } },
//       update: {},          // already saved — no changes needed
//       create: { jobId, jobSeekerId },
//     });
//
// CONCEPT: Composite unique constraint
//   The SavedJob table has @@unique([jobId, jobSeekerId]) in the schema.
//   This means a job seeker can save the same job only once.
//   Prisma generates a compound where key: { jobId_jobSeekerId: { jobId, jobSeekerId } }
//   that you use in upsert/findUnique to look up by both columns at once.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import prisma from '../prisma/client';
import { AppError } from '../errors/AppError';

/**
 * Returns the job seeker's profile linked to the given userId.
 * Returns null if no profile exists (new user who hasn't set one up yet).
 *
 * EXAMPLE return value:
 *   { id: '...', userId: '...', bio: null, skills: [], location: null, ... }
 */
export const getJobSeekerProfile = async (userId: string) => {
  // findUnique: exactly one record or null. The JobSeekerProfile.userId is unique (1-to-1 relation).
  return prisma.jobSeekerProfile.findUnique({ where: { userId } });
};

/**
 * Updates the job seeker's profile fields.
 * Only provided fields are changed (Prisma's update only touches what's in `data`).
 *
 * EXAMPLE:
 *   updateJobSeekerProfile('user-id', { bio: 'I love TypeScript', skills: ['Node.js'] })
 */
export const updateJobSeekerProfile = async (
  userId: string,
  data: {
    bio?: string;
    location?: string;
    skills?: string[];
    education?: string;
    experience?: string;
    resumeUrl?: string;
  }
) => {
  // prisma.jobSeekerProfile.update updates the row WHERE userId = ? with the given data.
  // EQUIVALENT SQL: UPDATE "JobSeekerProfile" SET bio = ?, ... WHERE "userId" = ?
  return prisma.jobSeekerProfile.update({
    where: { userId },
    data,
  });
};

/**
 * Creates a job application for the given user and job.
 * Called by the Bull WORKER (not directly by the controller).
 *
 * STEPS:
 *   1. Find the job seeker's profile (throws 404 if not found).
 *   2. Verify the job exists (throws 404 if not found).
 *   3. Create the Application record linking jobSeekerId + jobId.
 *
 * NOTE: Duplicate applications are not explicitly guarded here by upsert
 * because the UI should disable the Apply button once applied. If you need
 * stronger protection, add @@unique([jobId, jobSeekerId]) to the Application model.
 */
export const applyToJob = async (userId: string, jobId: string, coverLetter?: string) => {
  // Find the profile linked to the authenticated user.
  const jobSeeker = await prisma.jobSeekerProfile.findUnique({ where: { userId } });
  if (!jobSeeker) throw new AppError('Job seeker profile not found', 404);

  // Verify the job exists before creating the application.
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new AppError('Job not found', 404);

  // Create the application. `status` defaults to `submitted` (Prisma schema default).
  const application = await prisma.application.create({
    data: {
      jobId,
      jobSeekerId: jobSeeker.id,  // jobSeekerProfile.id (not user.id)
      coverLetter,                // undefined if not provided — Prisma stores it as null
    },
  });

  return application;
};

/**
 * Returns all applications submitted by the given user.
 *
 * CONCEPT: Prisma nested includes (deep joins)
 *   include: { job: { include: { recruiter: ... } } }
 *   This joins: Application → Job → RecruiterProfile
 *   All in a single efficient Prisma query (1 SQL query with JOINs).
 */
export const getApplications = async (userId: string) => {
  const jobSeeker = await prisma.jobSeekerProfile.findUnique({ where: { userId } });
  if (!jobSeeker) throw new AppError('Job seeker profile not found', 404);

  return prisma.application.findMany({
    where: { jobSeekerId: jobSeeker.id },
    include: {
      job: {
        select: {
          id: true,
          title: true,
          location: true,
          isActive: true,
          recruiter: { select: { companyName: true } }, // nested include
        },
      },
    },
    orderBy: { createdAt: 'desc' }, // most recent applications first
  });
};

/**
 * Withdraws (deletes) a job application.
 * Verifies the application belongs to the requesting user before deleting.
 */
export const withdrawApplication = async (userId: string, applicationId: string) => {
  const jobSeeker = await prisma.jobSeekerProfile.findUnique({ where: { userId } });
  if (!jobSeeker) throw new AppError('Job seeker profile not found', 404);

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
  });

  if (!application) throw new AppError('Application not found', 404);

  // Ownership check: the application must belong to THIS job seeker.
  // Without this check, any authenticated job seeker could delete any application.
  if (application.jobSeekerId !== jobSeeker.id)
    throw new AppError('You are not authorized to withdraw this application', 403);

  // EQUIVALENT SQL: DELETE FROM "Application" WHERE id = ?
  await prisma.application.delete({ where: { id: applicationId } });
};

/**
 * Saves (bookmarks) a job for the given user.
 * Uses upsert for idempotency — saving the same job twice is a no-op, not an error.
 *
 * CONCEPT: Idempotency
 *   An operation is idempotent if running it multiple times produces the same result.
 *   EXAMPLE: pressing "Save Job" twice → job is saved once (not two records created).
 *   upsert makes this safe: second call → update: {} (no-op) instead of a duplicate error.
 */
export const saveJob = async (userId: string, jobId: string) => {
  const jobSeeker = await prisma.jobSeekerProfile.findUnique({ where: { userId } });
  if (!jobSeeker) throw new AppError('Job seeker profile not found', 404);

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new AppError('Job not found', 404);

  // upsert: if SavedJob with (jobId, jobSeekerId) exists → no-op; if not → create.
  // { jobId_jobSeekerId } is the Prisma-generated compound key name from @@unique([jobId, jobSeekerId])
  const savedJob = await prisma.savedJob.upsert({
    where: { jobId_jobSeekerId: { jobId, jobSeekerId: jobSeeker.id } },
    update: {},  // already saved — nothing to update (the record is kept as-is)
    create: { jobId, jobSeekerId: jobSeeker.id },
    include: { job: true }, // return the job details along with the SavedJob record
  });

  return savedJob;
};

/**
 * Returns all bookmarked jobs for a user, ordered most-recently-saved first.
 */
export const getSavedJobs = async (userId: string) => {
  const jobSeeker = await prisma.jobSeekerProfile.findUnique({ where: { userId } });
  if (!jobSeeker) throw new AppError('Job seeker profile not found', 404);

  return prisma.savedJob.findMany({
    where: { jobSeekerId: jobSeeker.id },
    include: {
      job: {
        select: {
          id: true,
          title: true,
          location: true,
          salaryRange: true,
          category: true,
          isActive: true,
          recruiter: { select: { companyName: true } },
        },
      },
    },
    orderBy: { savedAt: 'desc' }, // most recently saved first
  });
};

/**
 * Removes a saved job bookmark.
 */
export const unsaveJob = async (userId: string, jobId: string) => {
  const jobSeeker = await prisma.jobSeekerProfile.findUnique({ where: { userId } });
  if (!jobSeeker) throw new AppError('Job seeker profile not found', 404);

  // findFirst instead of findUnique because we filter by TWO fields but
  // there's no compound @id — just a @@unique constraint. Prisma recommends
  // findFirst when you don't have a primary key to filter on.
  const savedJob = await prisma.savedJob.findFirst({
    where: { jobId, jobSeekerId: jobSeeker.id },
  });

  if (!savedJob) throw new AppError('Saved job not found', 404);

  await prisma.savedJob.delete({ where: { id: savedJob.id } });
};
