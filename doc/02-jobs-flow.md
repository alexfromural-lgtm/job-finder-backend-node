# Jobs Flow

> All protected routes require `Cookie: accessToken=jwt` (HTTP-only, set by login/signup).  
> The `requireAuth` middleware reads and verifies this cookie on every protected request.

---

## Get All Jobs (Public)

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant DB as PostgreSQL

    C->>S: GET /api/jobs/all
    Note over C,S: Public endpoint - no auth required
    Note over C,S: Query params optional: ?category= location= search= page= pageSize=

    S->>DB: jobs with filters + pagination
    DB-->>S: { jobs[], total, page, pageSize, totalPages }
    S-->>C: 200 { jobs, meta: { total, page, pageSize, totalPages } }
```

---

## Get Job by ID (Public)

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant DB as PostgreSQL

    C->>S: GET /api/jobs/:id
    Note over C,S: Public endpoint - no auth required

    S->>DB: job.findUnique({ id })
    alt job found
        DB-->>S: job record
        S-->>C: 200 { job }
    else not found
        S-->>C: 404 { error: Job not found }
    end
```

---

## Create Job (Recruiter only)

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as requireAuth + authorizeRoles
    participant S as Server
    participant DB as PostgreSQL

    C->>MW: POST /api/jobs/
    Note over C,MW: Cookie: accessToken=jwt
    Note over C,MW: Headers: Content-Type: application/json
    Note over C,MW: Body: { title, description, location, category, ... }

    MW->>MW: requireAuth - verify accessToken cookie
    MW->>MW: authorizeRoles(RECRUITER)
    MW->>MW: validate(jobSchema) - Zod validation
    MW->>S: next()
    S->>DB: recruiterProfile.findUnique({ userId })
    DB-->>S: recruiter record
    S->>DB: job.create({ recruiterId, ...body })
    DB-->>S: new job record
    S-->>C: 201 { message: Job created successfully, job }
```

---

## Get Jobs by Recruiter

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as requireAuth + authorizeRoles
    participant S as Server
    participant DB as PostgreSQL

    C->>MW: GET /api/jobs/recruiter
    Note over C,MW: Cookie: accessToken=jwt

    MW->>MW: requireAuth - verify accessToken cookie
    MW->>MW: authorizeRoles(RECRUITER)
    MW->>S: next()
    S->>DB: recruiterProfile.findUnique({ userId })
    DB-->>S: recruiter record
    S->>DB: job.findMany({ recruiterId })
    DB-->>S: jobs[]
    S-->>C: 200 { jobs }
```

---

## Update Job (Recruiter only)

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as requireAuth + authorizeRoles
    participant S as Server
    participant DB as PostgreSQL

    C->>MW: PUT /api/jobs/:id
    Note over C,MW: Cookie: accessToken=jwt
    Note over C,MW: Headers: Content-Type: application/json
    Note over C,MW: Body: partial job fields - jobSchema.partial()

    MW->>MW: requireAuth - verify accessToken cookie
    MW->>MW: authorizeRoles(RECRUITER)
    MW->>MW: validate(jobSchema.partial()) - Zod partial validation
    MW->>S: next()
    S->>DB: recruiterProfile.findUnique({ userId })
    DB-->>S: recruiter record
    S->>DB: job.update({ id: jobId, recruiterId, ...body })
    DB-->>S: updated job
    S-->>C: 200 { message: Job updated successfully, job }
```

---

## Delete Job (Recruiter only)

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as requireAuth + authorizeRoles
    participant S as Server
    participant DB as PostgreSQL

    C->>MW: DELETE /api/jobs/:id
    Note over C,MW: Cookie: accessToken=jwt

    MW->>MW: requireAuth - verify accessToken cookie
    MW->>MW: authorizeRoles(RECRUITER)
    MW->>S: next()
    S->>DB: recruiterProfile.findUnique({ userId })
    DB-->>S: recruiter record
    S->>DB: job.delete({ id: jobId, recruiterId })
    DB-->>S: deleted
    S-->>C: 200 { message: Job deleted successfully }
```
