# Job Finder Backend – Process Diagrams Overview

This folder contains Mermaid sequence and flow diagrams for every process in the backend API.

---

## Document Index

| File | Contents |
|------|----------|
| [01-auth-flow.md](./01-auth-flow.md) | Signup (Job Seeker & Recruiter), Login, Logout, Token Refresh, Get Me, Upgrade to Recruiter |
| [02-jobs-flow.md](./02-jobs-flow.md) | Get All Jobs, Get Job by ID, Create / Update / Delete Job, Get Jobs by Recruiter |
| [03-jobseeker-flow.md](./03-jobseeker-flow.md) | Profile (get/update), Apply to Job (async), Get/Withdraw Applications, Save/Unsave/Get Saved Jobs |
| [04-recruiter-flow.md](./04-recruiter-flow.md) | Profile (get/update), Get Applications for Job, Update Application Status |
| [05-queue-flow.md](./05-queue-flow.md) | Queue architecture, payload types, poll job status, worker retry logic |
| [06-middleware-flow.md](./06-middleware-flow.md) | Global middleware stack, requireAuth, authorizeRoles, validate (Zod), error handler, cookie security table |

---

## High-Level Architecture

```mermaid
flowchart TD
    C["Client\nBrowser or Mobile"]

    subgraph Express["Express Server"]
        MW["Global Middleware\nhelmet, cors, json, cookieParser"]
        AUTH_R["POST /api/auth/*"]
        JOB_R["GET|POST|PUT|DELETE /api/jobs/*"]
        JS_R["GET|POST|PATCH|DELETE /api/jobseeker/*"]
        REC_R["GET|PATCH /api/recruiter/*"]
        Q_R["GET /api/queue/job/:id"]
        ERR["errorHandler"]
    end

    subgraph Security["Auth Middleware"]
        RA["requireAuth\nverify accessToken cookie"]
        AR["authorizeRoles\nJOB_SEEKER or RECRUITER"]
        VAL["validate(schema)\nZod body validation"]
    end

    subgraph Queue["Async Layer"]
        BULL["Bull Queue\nRedis"]
        WORKER["Queue Worker\nconcurrency=5\nretry x3 exponential"]
    end

    DB[("PostgreSQL\nPrisma ORM")]

    C -->|"Cookie: accessToken / refreshToken"| MW
    MW --> AUTH_R
    MW --> JOB_R
    MW --> JS_R
    MW --> REC_R
    MW --> Q_R
    AUTH_R --> ERR
    JOB_R --> RA --> AR --> VAL --> ERR
    JS_R --> RA
    REC_R --> RA
    Q_R --> ERR

    JS_R -->|"apply/save writes"| BULL
    BULL --> WORKER --> DB
    AUTH_R --> DB
    JOB_R --> DB
    JS_R --> DB
    REC_R --> DB
```

---

## Token / Cookie Flow Summary

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server

    Note over C,S: Login or Signup
    C->>S: POST credentials
    S-->>C: Set-Cookie: accessToken=jwt, HttpOnly, SameSite=Lax, Max-Age=900
    S-->>C: Set-Cookie: refreshToken=jwt, HttpOnly, SameSite=Lax, Max-Age=604800

    Note over C,S: Authenticated Request
    C->>S: GET /api/... browser auto-sends cookies
    S->>S: requireAuth reads req.cookies.accessToken
    S-->>C: 200 response

    Note over C,S: Access Token Expired - Refresh
    C->>S: POST /api/auth/refresh - browser auto-sends refreshToken cookie
    S-->>C: Set-Cookie: accessToken=new-jwt, Max-Age=900
    S-->>C: Set-Cookie: refreshToken=new-jwt, Max-Age=604800

    Note over C,S: Logout
    C->>S: POST /api/auth/logout
    S-->>C: Set-Cookie: accessToken=, Max-Age=0
    S-->>C: Set-Cookie: refreshToken=, Max-Age=0
```
