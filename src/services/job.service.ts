// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/services/job.service.ts  — Job CRUD business logic
//
// CONCEPT: Prisma CRUD operations
//   prisma.job.create()      → INSERT INTO Job
//   prisma.job.findUnique()  → SELECT … WHERE id = ?  (at most 1 row)
//   prisma.job.findMany()    → SELECT … WHERE …      (multiple rows)
//   prisma.job.update()      → UPDATE Job SET … WHERE id = ?
//   prisma.job.delete()      → DELETE FROM Job WHERE id = ?
//
// CONCEPT: Ownership check (authorization at service layer)
//   The recruiter can only edit/delete jobs they OWN.
//   We verify: job.recruiterId === recruiter.id
//   If not → throw AppError(403 Forbidden).
//   This check lives in the service (not the controller) because it's business logic.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import prisma from '../prisma/client';
import { AppError } from '../errors/AppError';
import type { JobInput, JobUpdateInput } from '../validators/job.schema';

/**
 * Creates a new job listing for a recruiter.
 *
 * EXAMPLE:
 *   const job = await createJob('recruiter-profile-id', {
 *     title: 'Backend Dev', description: '...', requirements: '...', location: 'Remote'
 *   });
 */
export const createJob = async (recruiterId: string, jobData: JobInput) => {
  // Prisma spread: `...jobData` expands title, description, requirements, etc.
  // Combined with recruiterId it creates the full Job record.
  // EQUIVALENT SQL: INSERT INTO "Job" (recruiterId, title, description, ...) VALUES (...)
  const job = await prisma.job.create({
    data: {
      recruiterId,  // links job to the recruiter's profile
      ...jobData,   // spread all validated job fields
    },
  });

  return job;
};

/**
 * Fetches a single job by its ID, including the recruiter's company name.
 * Returns null if not found (findUnique returns null for no match — no error thrown).
 *
 * CONCEPT: Prisma `include`
 *   include: { recruiter: true } joins the RecruiterProfile table and adds it
 *   to the result object as job.recruiter.
 *   You can also select specific sub-fields: include: { recruiter: { select: { companyName: true } } }
 */
export const getJobById = async (jobId: string) => {
  // findUnique → SELECT … WHERE id = ? LIMIT 1
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      recruiter: {
        // Only return the company name from the recruiter profile — not all columns.
        select: { companyName: true, industry: true },
      },
    },
  });

  return job; // null if not found — controller handles the 404
};

/**
 * Returns all ACTIVE jobs for public listing.
 *
 * CONCEPT: Prisma `where` filter
 *   { where: { isActive: true } } → only jobs where isActive = true in the DB.
 *   EQUIVALENT SQL: SELECT * FROM "Job" WHERE "isActive" = true ORDER BY "createdAt" DESC
 *
 * CONCEPT: Prisma `orderBy`
 *   { orderBy: { createdAt: 'desc' } } → newest jobs first.
 */
export const getAllJobs = async () => {
  const jobs = await prisma.job.findMany({
    where: { isActive: true },   // only show active job listings
    include: {
      recruiter: { select: { companyName: true, industry: true } },
    },
    orderBy: { createdAt: 'desc' }, // most recently posted first
  });

  return jobs;
};

/**
 * Returns all jobs (active + inactive) posted by a specific recruiter.
 * Used by the recruiter dashboard to manage their own listings.
 */
export const getJobsByRecruiter = async (recruiterId: string) => {
  // findMany with a WHERE clause on the foreign key.
  // EQUIVALENT SQL: SELECT * FROM "Job" WHERE "recruiterId" = ? ORDER BY "createdAt" DESC
  const jobs = await prisma.job.findMany({
    where: { recruiterId },     // only jobs belonging to this recruiter
    orderBy: { createdAt: 'desc' },
  });

  return jobs;
};

/**
 * Updates a job. Verifies the recruiter owns the job before updating.
 *
 * CONCEPT: Prisma `update`
 *   Only the provided fields in `data` are updated — others remain unchanged.
 *   This is because jobData is a partial object (JobUpdateInput has all fields optional).
 *   EQUIVALENT SQL: UPDATE "Job" SET title = ?, ... WHERE id = ?
 */
export const updateJob = async (recruiterId: string, jobId: string, jobData: JobUpdateInput) => {
  // First fetch the job to verify ownership.
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new AppError('Job not found', 404);

  // Authorization: only the recruiter who posted this job can edit it.
  if (job.recruiterId !== recruiterId)
    throw new AppError('You are not authorized to update this job', 403);

  // Prisma update: only the fields present in jobData are updated.
  const updatedJob = await prisma.job.update({
    where: { id: jobId },
    data: jobData,  // could be { title: 'New Title' } or { isActive: false }, etc.
  });

  return updatedJob;
};

/**
 * Deletes a job. Verifies ownership first.
 *
 * NOTE: Deleting a job also cascades to its applications if Prisma cascade rules are set.
 * Check prisma/schema.prisma for relation onDelete settings.
 */
export const deleteJob = async (recruiterId: string, jobId: string) => {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new AppError('Job not found', 404);

  if (job.recruiterId !== recruiterId)
    throw new AppError('You are not authorized to delete this job', 403);

  // EQUIVALENT SQL: DELETE FROM "Job" WHERE id = ?
  await prisma.job.delete({ where: { id: jobId } });
};
