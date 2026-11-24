# Recruiter Flow

> All routes require `Cookie: accessToken=jwt` (HTTP-only, set by login/signup) and `RECRUITER` role.

---

## Get Recruiter Profile

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as requireAuth + authorizeRoles
    participant S as Server
    participant DB as PostgreSQL

    C->>MW: GET /api/recruiter/profile
    Note over C,MW: Cookie: accessToken=jwt

    MW->>MW: requireAuth - verify accessToken cookie
    MW->>MW: authorizeRoles(RECRUITER)
    MW->>S: next()
    S->>DB: recruiterProfile.findUnique({ userId })
    alt profile found
        DB-->>S: profile record
        S-->>C: 200 { profile }
    else not found
        S-->>C: 404 { error: Profile not found }
    end
```

---

## Update Recruiter Profile

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as requireAuth + authorizeRoles
    participant S as Server
    participant DB as PostgreSQL

    C->>MW: PATCH /api/recruiter/profile
    Note over C,MW: Cookie: accessToken=jwt
    Note over C,MW: Headers: Content-Type: application/json
    Note over C,MW: Body: partial profile fields (updateRecruiterProfileSchema)

    MW->>MW: requireAuth - verify accessToken cookie
    MW->>MW: authorizeRoles(RECRUITER)
    MW->>MW: validate(updateRecruiterProfileSchema) - Zod validation
    MW->>S: next()
    S->>DB: recruiterProfile.update({ userId, ...body })
    DB-->>S: updated profile
    S-->>C: 200 { profile }
```

---

## Get Applications for a Job

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as requireAuth + authorizeRoles
    participant S as Server
    participant DB as PostgreSQL

    C->>MW: GET /api/recruiter/jobs/:jobId/applications
    Note over C,MW: Cookie: accessToken=jwt

    MW->>MW: requireAuth - verify accessToken cookie
    MW->>MW: authorizeRoles(RECRUITER)
    MW->>S: next()
    S->>DB: application.findMany({ jobId, job.recruiterId = userId })
    DB-->>S: applications[]
    S-->>C: 200 { applications }
```

---

## Update Application Status

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as requireAuth + authorizeRoles
    participant S as Server
    participant DB as PostgreSQL

    C->>MW: PATCH /api/recruiter/applications/:id/status
    Note over C,MW: Cookie: accessToken=jwt
    Note over C,MW: Headers: Content-Type: application/json
    Note over C,MW: Body: { status: PENDING | REVIEWED | ACCEPTED | REJECTED }

    MW->>MW: requireAuth - verify accessToken cookie
    MW->>MW: authorizeRoles(RECRUITER)
    MW->>MW: validate(applicationStatusSchema) - Zod validation
    MW->>S: next()
    S->>S: applicationStatusSchema.safeParse(body) - belt-and-suspenders re-check
    alt invalid status
        S-->>C: 400 { error: validation message }
    else valid
        S->>DB: application.update({ id: applicationId, job.recruiterId = userId, status })
        DB-->>S: updated application
        S-->>C: 200 { application }
    end
```
