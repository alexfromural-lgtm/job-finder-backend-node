// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: src/middleware/validate.middleware.ts  — Request body validation middleware
//
// CONCEPT: Input validation at the route level
//   Every public endpoint that accepts a request body should validate that body
//   BEFORE it reaches the controller. If the body is invalid, reject it
//   immediately with a clear 400 error — don't let garbage data reach the
//   service or database layer.
//
// CONCEPT: Middleware factory
//   `validate(schema)` is a "middleware factory" — it's a function that returns
//   a middleware function. This pattern lets you configure middleware with arguments.
//
//   EXAMPLE (factory pattern):
//     const multiply = (n) => (x) => x * n;   // factory
//     const double = multiply(2);              // → specific middleware
//     double(5);                               // → 10
//
//   Applied to Express:
//     const validate = (schema) => (req, res, next) => { ... };
//     router.post('/login', validate(loginSchema), login);
//                                   ↑ factory         ↑ the returned middleware
//
// CONCEPT: Zod safeParse
//   schema.safeParse(data) validates data against the schema.
//   Returns { success: true, data: ... } OR { success: false, error: ... }
//   The `.data` on success is the PARSED value (coerced, with defaults applied).
//   We replace req.body with result.data so controllers always get clean, typed input.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';

/**
 * Middleware factory: validates req.body against the given Zod schema.
 * On failure  → responds 400 with detailed validation issues.
 * On success  → replaces req.body with the parsed (coerced + defaulted) data
 *               and calls next() to continue to the route handler.
 *
 * USAGE IN ROUTE:
 *   import { validate } from '../middleware/validate.middleware';
 *   import { loginSchema } from '../validators/auth.schema';
 *   router.post('/login', validate(loginSchema), login);
 *
 * EXAMPLE with invalid body:
 *   POST /login  { "email": "not-an-email", "password": "" }
 *   → 400 {
 *       "message": "Validation failed",
 *       "errors": [
 *         { "code": "invalid_string", "message": "Invalid email address", "path": ["email"] },
 *         { "code": "too_small",      "message": "Password is required",  "path": ["password"] }
 *       ]
 *     }
 *
 * EXAMPLE with valid body:
 *   POST /login  { "email": "alex@example.com", "password": "secret123" }
 *   → req.body is now the parsed object; next() is called → login handler runs
 */
export const validate = (schema: ZodType<any>) => {
  // Return the actual middleware function. The schema is captured in the closure.
  return (req: Request, res: Response, next: NextFunction) => {
    // safeParse() does NOT throw; it returns a result object we can inspect.
    const result = schema.safeParse(req.body);

    if (!result.success) {
      // result.error.issues is an array of ZodIssue objects, each describing
      // one validation failure (path, message, code).
      // EXAMPLE issue: { path: ['email'], message: 'Invalid email address', code: 'invalid_string' }
      res.status(400).json({
        message: 'Validation failed',
        errors: result.error.issues,
      });
      // NOTE: we return here implicitly (no `next()` call), so the controller
      // is never reached on a validation failure.
    }

    // Replace req.body with the Zod-parsed output:
    // - type coercions are applied (e.g. string "5" → number 5 for z.coerce.number())
    // - default values are filled in
    // - extra unknown fields are stripped (Zod strips by default)
    // This means controllers always receive clean, typed data.
    req.body = result.data;
    next();
  };
};
