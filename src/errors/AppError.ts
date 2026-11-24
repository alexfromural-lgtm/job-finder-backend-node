// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/errors/AppError.ts  — Custom error class with HTTP status codes
//
// PROBLEM this solves:
//   JavaScript's built-in Error only carries a message string.
//   When you catch an error in an Express handler you don't know WHICH HTTP
//   status code to return — you'd have to inspect the message text, which
//   breaks for non-English messages or future i18n.
//
// SOLUTION: Extend Error with a `statusCode` property.
//   throw new AppError('User not found', 404);
//   The error handler checks `err instanceof AppError` and uses err.statusCode directly.
//
// USAGE EXAMPLES:
//   throw new AppError('User not found', 404);
//   throw new AppError('Invalid credentials', 401);
//   throw new AppError('Access denied', 403);
//   throw new AppError('Email already in use', 409);
//
// CONCEPT: Custom Error classes
//   class MyError extends Error { ... }
//   This lets you use  `err instanceof MyError`  to distinguish your errors
//   from third-party errors (Prisma, JWT, etc.) without inspecting message text.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Application-level error that carries a semantic HTTP status code.
 * Throw this instead of plain `new Error(...)` so error handlers can
 * map to the correct status WITHOUT inspecting message text — which
 * breaks for non-English messages or future i18n.
 *
 * Usage:
 *   throw new AppError("User not found", 404);
 *   throw new AppError("Invalid credentials", 401);
 */
export class AppError extends Error {
  // The `public readonly` shorthand declares AND assigns the property in one line.
  // EXAMPLE: new AppError('Not found', 404).statusCode === 404
  constructor(
    message: string,
    public readonly statusCode: number  // e.g. 400, 401, 403, 404, 409, 500
  ) {
    // super(message) calls the parent Error constructor which sets this.message.
    // Without super() the message would be lost.
    super(message);

    // Set the name so stack traces say "AppError: User not found"
    // instead of the generic "Error: User not found".
    this.name = 'AppError';

    // Object.setPrototypeOf is required when extending built-in classes in TypeScript
    // compiled to ES5. Without it, `instanceof AppError` would return false
    // because the prototype chain gets broken during transpilation.
    // EXAMPLE: const e = new AppError('x', 400); e instanceof AppError → true ✓
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
