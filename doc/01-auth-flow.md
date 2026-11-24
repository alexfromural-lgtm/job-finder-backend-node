# Authentication Flow

## Signup – Job Seeker

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant DB as PostgreSQL

    C->>S: POST /api/auth/signup/jobseeker
    Note over C,S: Headers: Content-Type: application/json
    Note over C,S: Rate-limit: 5 req / 1 hour (signupLimiter)
    Note over C,S: Body: { name, email, password }

    S->>S: signupLimiter - rate limit check
    S->>S: validate(signupSchema) - Zod validation
    S->>DB: findUnique({ email }) - check duplicate
    DB-->>S: null (email free)
    S->>S: hashPassword(password)
    S->>DB: user.create({ roles: [JOB_SEEKER], jobSeeker: { create:{} } })
    DB-->>S: user record
    S->>S: generateAccessToken(userId, roles) - JWT, 15 min
    S->>S: generateRefreshToken(userId, roles) - JWT, 7 days

    S-->>C: 201 { message: Signed up successfully }
    Note over S,C: Set-Cookie: accessToken=jwt, HttpOnly, SameSite=Lax, Path=/, Max-Age=900
    Note over S,C: Set-Cookie: refreshToken=jwt, HttpOnly, SameSite=Lax, Path=/, Max-Age=604800
```

---

## Signup – Recruiter

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant DB as PostgreSQL

    C->>S: POST /api/auth/signup/recruiter
    Note over C,S: Headers: Content-Type: application/json
    Note over C,S: Rate-limit: 5 req / 1 hour (signupLimiter)
    Note over C,S: Body: { name, email, password, companyName, companyWebsite, description, industry }

    S->>S: signupLimiter - rate limit check
    S->>S: validate(recruiterSignupSchema) - Zod validation
    S->>DB: findUnique({ email }) - check duplicate
    DB-->>S: null (email free)
    S->>S: hashPassword(password)
    S->>DB: user.create({ roles: [RECRUITER], recruiter: { create:{...} } })
    DB-->>S: user + recruiter record
    S->>S: generateTokens(userId, roles)

    S-->>C: 201 { message: Signed up successfully }
    Note over S,C: Set-Cookie: accessToken=jwt, HttpOnly, SameSite=Lax, Path=/, Max-Age=900
    Note over S,C: Set-Cookie: refreshToken=jwt, HttpOnly, SameSite=Lax, Path=/, Max-Age=604800
```

---

## Login

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant DB as PostgreSQL

    C->>S: POST /api/auth/login
    Note over C,S: Headers: Content-Type: application/json
    Note over C,S: Rate-limit: 10 req / 15 min (authLimiter)
    Note over C,S: Body: { email, password }

    S->>S: authLimiter - rate limit check
    S->>S: validate(loginSchema) - Zod validation
    S->>DB: user.findUnique({ email })
    DB-->>S: user record
    S->>S: check user.isActive
    S->>S: comparePasswords(password, user.password)

    alt credentials valid
        S->>S: generateTokens(userId, roles)
        S-->>C: 200 { message: Logged in successfully }
        Note over S,C: Set-Cookie: accessToken=jwt, HttpOnly, SameSite=Lax, Path=/, Max-Age=900
        Note over S,C: Set-Cookie: refreshToken=jwt, HttpOnly, SameSite=Lax, Path=/, Max-Age=604800
    else invalid credentials or inactive account
        S-->>C: 401 { error: Invalid email or password }
    end
```

---

## Logout

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server

    C->>S: POST /api/auth/logout
    Note over C,S: Browser auto-sends cookies: accessToken, refreshToken

    S->>S: clearCookie(refreshToken, { httpOnly, secure, sameSite: lax, path: / })
    S->>S: clearCookie(accessToken, { httpOnly, secure, sameSite: lax, path: / })

    S-->>C: 200 { message: Logged out successfully }
    Note over S,C: Set-Cookie: accessToken=, Max-Age=0, Path=/
    Note over S,C: Set-Cookie: refreshToken=, Max-Age=0, Path=/
```

---

## Token Refresh

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant DB as PostgreSQL

    C->>S: POST /api/auth/refresh
    Note over C,S: Browser auto-sends Cookie: refreshToken=jwt
    Note over C,S: Rate-limit: 10 req / 15 min (authLimiter)

    S->>S: authLimiter - rate limit check
    S->>S: read req.cookies.refreshToken

    alt no cookie
        S-->>C: 401 { error: No refresh token provided }
    else cookie present
        S->>S: verifyRefreshToken(token) - JWT verify
        S->>DB: user.findUnique({ id: payload.userId })
        DB-->>S: user record
        S->>S: check user.isActive
        S->>S: generateTokens(userId, roles)
        S-->>C: 200 { message: Token refreshed }
        Note over S,C: Set-Cookie: accessToken=new-jwt, HttpOnly, SameSite=Lax, Path=/, Max-Age=900
        Note over S,C: Set-Cookie: refreshToken=new-jwt, HttpOnly, SameSite=Lax, Path=/, Max-Age=604800
    end
```

---

## Get Current User

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as requireAuth Middleware
    participant S as Server
    participant DB as PostgreSQL

    C->>MW: GET /api/auth/me
    Note over C,MW: Cookie: accessToken=jwt

    MW->>MW: read req.cookies.accessToken
    alt no token
        MW-->>C: 401 { error: Missing access token }
    else token present
        MW->>MW: verifyAccessToken(token) - JWT verify
        alt invalid or expired
            MW-->>C: 401 { error: Invalid or expired access token }
        else valid
            MW->>MW: attach req.userId and req.roles
            MW->>S: next()
            S->>DB: user.findUnique({ id: userId })
            DB-->>S: { id, name, email, roles, isActive, createdAt, updatedAt }
            S-->>C: 200 { user }
        end
    end
```

---

## Upgrade Job Seeker to Recruiter

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as requireAuth + authorizeRoles
    participant S as Server
    participant DB as PostgreSQL

    C->>MW: POST /api/auth/upgrade/recruiter
    Note over C,MW: Cookie: accessToken=jwt
    Note over C,MW: Body: { companyName, companyWebsite, description, industry }

    MW->>MW: requireAuth - verify accessToken cookie
    MW->>MW: authorizeRoles(JOB_SEEKER) - check roles
    MW->>S: next()
    S->>DB: user.findUnique({ id: userId, include: recruiter })
    DB-->>S: user record
    S->>S: check user has JOB_SEEKER role
    S->>S: check user has no existing recruiter profile
    S->>DB: user.update({ roles: [..., RECRUITER], recruiter: { create:{...} } })
    DB-->>S: updated user + recruiter
    S->>S: generateTokens(userId, updatedRoles)

    S-->>C: 200 { user }
    Note over S,C: Set-Cookie: accessToken=new-jwt, HttpOnly, SameSite=Lax, Path=/, Max-Age=900
    Note over S,C: Set-Cookie: refreshToken=new-jwt, HttpOnly, SameSite=Lax, Path=/, Max-Age=604800
```
