# Middleware & Request Lifecycle

## Global Middleware Stack

```mermaid
flowchart TD
    REQ["Incoming HTTP Request"]
    H["helmet()\nSecurity headers:\nX-Frame-Options, CSP,\nX-Content-Type-Options, etc."]
    COMP["compression()\nGzip - production only"]
    CORS["cors({ origin, credentials: true })\nOrigin: CORS_ORIGIN env var\ndev default: http://localhost:3000"]
    JSON["express.json()\nParses JSON body into req.body"]
    COOKIE["cookieParser()\nParses Cookie header into req.cookies"]
    ROUTES["Route Handlers"]
    ERR["errorHandler middleware\nglobal, registered last"]
    RES["HTTP Response"]

    REQ --> H --> COMP --> CORS --> JSON --> COOKIE --> ROUTES --> ERR --> RES
```

---

## requireAuth Middleware

```mermaid
flowchart TD
    IN["Request enters requireAuth"]
    READ["Read req.cookies.accessToken"]
    EXISTS{"Token present?"}
    VERIFY["verifyAccessToken(token)\nJWT verify with ACCESS_TOKEN_SECRET"]
    VALID{"Valid and not expired?"}
    ATTACH["Attach req.userId\nAttach req.roles"]
    NEXT["next() - proceed to route handler"]
    E401A["401 { error: Missing access token }"]
    E401B["401 { error: Invalid or expired access token }"]

    IN --> READ --> EXISTS
    EXISTS -->|No| E401A
    EXISTS -->|Yes| VERIFY --> VALID
    VALID -->|No| E401B
    VALID -->|Yes| ATTACH --> NEXT
```

---

## authorizeRoles Middleware

```mermaid
flowchart TD
    IN["Request enters authorizeRoles(...roles)"]
    CHECK{"req.roles includes\nany allowed role?"}
    NEXT["next() - proceed to route handler"]
    E403["403 { message: Access denied. }"]

    IN --> CHECK
    CHECK -->|Yes| NEXT
    CHECK -->|No| E403
```

---

## validate Middleware (Zod)

```mermaid
flowchart TD
    IN["Request enters validate(schema)"]
    PARSE["schema.safeParse(req.body)"]
    VALID{"Parse success?"}
    REPLACE["req.body = parsed.data\nsanitized and typed"]
    NEXT["next()"]
    E400["400 { errors: ZodIssue[] }"]

    IN --> PARSE --> VALID
    VALID -->|Yes| REPLACE --> NEXT
    VALID -->|No| E400
```

---

## Error Handler Middleware

```mermaid
flowchart TD
    IN["Error thrown / next(err) called"]
    IS_APP{"err instanceof AppError?"}
    APP_RES["res.status(err.statusCode)\n.json({ error: err.message })"]
    IS_JWT{"JWT error?\njwt expired / invalid / malformed"}
    JWT_RES["401 { error: err.message }"]
    IS_P2002{"Prisma P2002\nunique constraint?"}
    P_RES["409 { error: A record with that value already exists. }"]
    DEFAULT["500 { error: Internal server error }"]

    IN --> IS_APP
    IS_APP -->|Yes| APP_RES
    IS_APP -->|No| IS_JWT
    IS_JWT -->|Yes| JWT_RES
    IS_JWT -->|No| IS_P2002
    IS_P2002 -->|Yes| P_RES
    IS_P2002 -->|No| DEFAULT
```

---

## Cookie Security Summary

| Cookie        | HttpOnly | Secure (prod) | SameSite | Path | Max-Age   |
|---------------|----------|---------------|----------|------|-----------|
| `accessToken` | ✅        | ✅             | `Lax`    | `/`  | 15 min    |
| `refreshToken`| ✅        | ✅             | `Lax`    | `/`  | 7 days    |

> **Why `SameSite=Lax`?**  
> Allows the cookie to be attached on top-level GET navigations from external origins (email magic-links, OAuth callbacks) while blocking cross-site state-mutating requests (POST/PUT/DELETE), striking the right balance between usability and CSRF protection.

> **Why `HttpOnly`?**  
> JavaScript cannot read these cookies, eliminating XSS-based token theft.
