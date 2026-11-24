// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/utils/hash.ts  — Password hashing helpers
//
// CONCEPT: Why we never store plain-text passwords
//   If the database leaks, plain-text passwords expose every user's credentials.
//   bcrypt transforms a password into a one-way hash that is computationally
//   expensive to reverse — making brute-force attacks impractical.
//
// HOW bcrypt WORKS:
//   1. Generate a random "salt" (random bytes mixed into the password).
//   2. Run the password + salt through a slow hash function N times (cost factor).
//   3. Store the resulting hash string (which embeds the salt and cost factor).
//   For verification, bcrypt re-hashes the candidate password with the stored
//   salt and compares the result — you never decrypt the hash.
//
// EXAMPLE:
//   const hash = await hashPassword('mySecret123');
//   // hash → "$2b$10$aBcDeFgHiJ…" (bcrypt format, includes salt + cost)
//   await comparePasswords('mySecret123', hash); // → true
//   await comparePasswords('wrongpass',   hash); // → false
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// bcrypt is the Node.js binding to the battle-tested bcrypt C library.
import bcrypt from 'bcrypt';

// SALT_ROUNDS controls the "cost factor" — how many times bcrypt iterates the hash.
// 10 is the community-recommended default: takes ~100ms on modern hardware,
// which is negligible for one login but very expensive for a brute-force attacker.
// EXAMPLE: SALT_ROUNDS=12 → ~400ms per hash (more secure, but noticeable latency).
const SALT_ROUNDS = 10;

/**
 * Hashes a plain-text password using bcrypt.
 * Returns a string in the format: "$2b$10$<salt><hash>"
 *
 * EXAMPLE:
 *   const hash = await hashPassword('hunter2');
 *   await prisma.user.create({ data: { password: hash, ... } });
 */
export const hashPassword = (password: string): Promise<string> => {
  // bcrypt.hash(plaintext, rounds) generates a salt internally and returns
  // the combined hash string. It's async because hashing is CPU-intensive.
  return bcrypt.hash(password, SALT_ROUNDS);
};

/**
 * Compares a plain-text candidate password against a stored bcrypt hash.
 * Returns true if they match, false otherwise.
 * Timing-safe: takes the same time whether or not the passwords match,
 * preventing timing attacks.
 *
 * EXAMPLE:
 *   const valid = await comparePasswords('hunter2', storedHash);
 *   if (!valid) throw new AppError('Invalid credentials', 401);
 */
export const comparePasswords = (password: string, hash: string): Promise<boolean> => {
  // bcrypt.compare re-hashes `password` with the salt embedded in `hash`
  // and compares byte-by-byte in constant time.
  return bcrypt.compare(password, hash);
};
