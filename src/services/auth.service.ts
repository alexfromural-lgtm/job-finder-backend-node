// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/services/auth.service.ts  — Auth business logic
//
// CONCEPT: Service layer
//   Services contain the actual BUSINESS LOGIC of the application.
//   They talk to the database (via Prisma), perform calculations, enforce rules,
//   and throw domain-level errors (AppError) on invalid states.
//   They are NOT aware of HTTP — they never touch req or res.
//   This makes them easy to test in isolation (no Express mock needed).
//
//   LAYER OVERVIEW:
//   HTTP Request → Controller (HTTP concerns) → Service (business logic) → DB (Prisma)
//   HTTP Response← Controller ←─────────────── Service ←────────────────── DB
//
// CONCEPT: Prisma nested create (relations)
//   Prisma lets you create related records in a single query using `create: {}` inside
//   the relation field. This is atomic — either all records are created or none.
//
//   EXAMPLE (create User + JobSeekerProfile in one call):
//     prisma.user.create({
//       data: {
//         name: 'Alex',
//         email: 'a@b.com',
//         password: hash,
//         roles: ['JOB_SEEKER'],
//         jobSeeker: { create: {} }  // ← creates a linked JobSeekerProfile row
//       }
//     });
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Role } from '@prisma/client';
import prisma from '../prisma/client';
import { comparePasswords, hashPassword } from '../utils/hash';
import {
  validateCredentials,
  checkUserExistsByEmail,
  generateTokensForUser,
} from '../utils/auth.utils';
import { verifyRefreshToken } from '../utils/token';
import { RecruiterSignupInput } from '../validators/recruiter.schema';
import { AppError } from '../errors/AppError';

/**
 * Creates a new job seeker user account.
 * Returns JWT tokens (issued immediately so the user is logged in after signup).
 *
 * STEPS:
 *   1. Validate email/password format (throws if blank)
 *   2. Ensure email is not already registered (throws 409 if taken)
 *   3. Hash the password (bcrypt, never store plain text)
 *   4. Create User + JobSeekerProfile in a single atomic DB transaction
 *   5. Issue access + refresh tokens
 */
export const signupJobSeeker = async (name: string, email: string, password: string) => {
  validateCredentials(email, password);       // throws 400 if blank
  await checkUserExistsByEmail(email);        // throws 409 if already exists

  const hashed = await hashPassword(password); // bcrypt one-way hash

  // Prisma nested create: creates the User row AND the linked JobSeekerProfile row atomically.
  // If either fails, both are rolled back (no orphaned records).
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,          // NEVER store the original password
      roles: [Role.JOB_SEEKER],  // assign the JOB_SEEKER role
      jobSeeker: { create: {} }, // create an empty linked JobSeekerProfile
    },
  });

  // Issue tokens immediately so the user is authenticated after signup.
  return generateTokensForUser(user.id, user.roles);
};

/**
 * Creates a new recruiter account with company profile.
 * (Note: previously named signupRecruitor — typo fixed)
 */
export const signupRecruiter = async (data: RecruiterSignupInput) => {
  const { name, email, password, companyName, companyWebsite, description, industry } = data;

  validateCredentials(email, password);
  await checkUserExistsByEmail(email);

  const hashed = await hashPassword(password);

  // Create User + RecruiterProfile in one atomic nested create.
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      roles: [Role.RECRUITER],
      recruiter: {
        // Create the recruiter profile with company details.
        // The user.id is automatically linked via userId relation.
        create: { companyName, companyWebsite, description, industry },
      },
    },
    // include tells Prisma to also SELECT the recruiter relation in the return value.
    // Without include, user.recruiter would be undefined.
    include: { recruiter: true },
  });

  return generateTokensForUser(user.id, user.roles);
};

/**
 * Upgrades an existing JOB_SEEKER to also have the RECRUITER role.
 * Returns new tokens immediately so the user does not need to re-login.
 *
 * BUSINESS RULES enforced here:
 *   1. The user must exist.
 *   2. The user must currently be a JOB_SEEKER (can't upgrade an already-recruiter account this way).
 *   3. The user must NOT already have a recruiter profile (idempotency guard).
 */
export const upgradeToRecruiter = async (userId: string, data: RecruiterSignupInput) => {
  // Look up the user and their recruiter profile (to check for existing profile).
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { recruiter: true }, // include recruiter so we can check if it already exists
  });

  if (!user) throw new AppError('User not found', 404);
  if (!user.roles.includes(Role.JOB_SEEKER))
    throw new AppError('Only Job Seekers can upgrade to Recruiter', 403);
  if (user.recruiter) throw new AppError('User already has a recruiter profile', 409);

  // Update user: add RECRUITER role + create the linked RecruiterProfile.
  // [...user.roles, Role.RECRUITER] spreads existing roles and appends RECRUITER.
  // EXAMPLE: ['JOB_SEEKER'] → ['JOB_SEEKER', 'RECRUITER']
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      roles: [...user.roles, Role.RECRUITER], // keep existing roles, add RECRUITER
      recruiter: {
        create: {
          companyName: data.companyName,
          companyWebsite: data.companyWebsite,
          description: data.description,
          industry: data.industry,
        },
      },
    },
    include: { recruiter: true },
  });

  // Re-issue tokens so the new RECRUITER role is reflected immediately in the JWT.
  // Without this, the user's existing access token still only shows JOB_SEEKER.
  const tokens = await generateTokensForUser(updatedUser.id, updatedUser.roles);
  return { user: updatedUser, tokens };
};

/**
 * Authenticates a user by email/password and returns JWT tokens.
 *
 * SECURITY: We use the same error message for "wrong email" and "wrong password".
 * This prevents credential enumeration: an attacker can't tell if the email
 * exists or if just the password is wrong.
 * EXAMPLE: "Invalid email or password" (not "Email not found" or "Wrong password")
 */
export const login = async (email: string, password: string) => {
  validateCredentials(email, password);

  // findUnique returns null if no user has this email (not an error — just not found).
  const user = await prisma.user.findUnique({ where: { email } });

  // Same 401 message for wrong email or wrong password → no enumeration.
  if (!user) throw new AppError('Invalid email or password', 401);

  // Check if the account is active (admin may have deactivated it).
  if (!user.isActive) throw new AppError('Account is deactivated', 403);

  // comparePasswords() uses bcrypt to compare the candidate with the stored hash.
  const valid = await comparePasswords(password, user.password);
  if (!valid) throw new AppError('Invalid email or password', 401); // same message

  return generateTokensForUser(user.id, user.roles);
};

/**
 * Issues a new pair of tokens using a valid refresh token.
 * Called when the access token expires and the client sends the refresh token.
 *
 * STEPS:
 *   1. Verify the refresh token signature and expiry (throws if invalid/expired).
 *   2. Confirm the user still exists and is active.
 *   3. Issue fresh access + refresh tokens (refresh token rotation).
 */
export const refreshTokens = async (refreshToken: string) => {
  // verifyRefreshToken throws if the token is expired or has an invalid signature.
  const payload = verifyRefreshToken(refreshToken);

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) throw new AppError('User not found', 404);
  if (!user.isActive) throw new AppError('Account is deactivated', 403);

  // Issue new tokens — this also rotates the refresh token.
  return generateTokensForUser(user.id, user.roles);
};

/**
 * Returns the current user's public data (excludes sensitive fields like password).
 *
 * CONCEPT: Prisma `select`
 *   Instead of fetching the entire user row (including password hash!), `select`
 *   specifies exactly which columns to return.
 *   EXAMPLE: select: { id: true, name: true } → only id and name in the result.
 *   This is both a security measure (no accidental password leaks) and a
 *   performance optimization (smaller data transfer from DB).
 */
export const getCurrentUser = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      roles: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      // password: NOT selected — never send the hash to the client
    },
  });

  if (!user) throw new AppError('User not found', 404);
  return user;
};
