# Job Seeker Flow

> All routes require `Cookie: accessToken=jwt` (HTTP-only, set by login/signup) and `JOB_SEEKER` role.  
> Write operations (apply, save) go through the **Bull queue** (Redis) and return a `queueJobId` for polling.

---

## Get Profile

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as requireAuth + authorizeRoles
    participant S as Server
    participant DB as PostgreSQL

    C->>MW: GET /api/jobseeker/profile
    Note over C,MW: Cookie: accessToken=jwt

    MW->>MW: requireAuth - verify accessToken cookie
    MW->>MW: authorizeRoles(JOB_SEEKER)
    MW->>S: next()
    S->>DB: jobSeekerProfile.findUnique({ userId })
    alt profile found
        DB-->>S: profile record
        S-->>C: 200 { profile }
    else not found
        S-->>C: 404 { error: Profile not found }
    end
```

---

## Update Profile

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as requireAuth + authorizeRoles
    participant S as Server
    participant DB as PostgreSQL

    C->>MW: PATCH /api/jobseeker/profile
    Note over C,MW: Cookie: accessToken=jwt
    Note over C,MW: Headers: Content-Type: application/json
    Note over C,MW: Body: partial profile fields (updateJobSeekerProfileSchema)

    MW->>MW: requireAuth - verify accessToken cookie
    MW->>MW: authorizeRoles(JOB_SEEKER)
    MW->>MW: validate(updateJobSeekerProfileSchema) - Zod validation
    MW->>S: next()
    S->>DB: jobSeekerProfile.update({ userId, ...body })
    DB-->>S: updated profile
    S-->>C: 200 { profile }
```

---

## Apply to Job (async via Queue)

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as requireAuth + authorizeRoles
    participant S as Server
    participant Q as Bull Queue Redis
    participant W as Queue Worker
    participant DB as PostgreSQL

    C->>MW: POST /api/jobseeker/apply/:jobId
    Note over C,MW: Cookie: accessToken=jwt
    Note over C,MW: Headers: Content-Type: application/json
    Note over C,MW: Body: { coverLetter }

    MW->>MW: requireAuth - verify accessToken cookie
    MW->>MW: authorizeRoles(JOB_SEEKER)
    MW->>MW: validate(applicationSchema) - Zod validation
    MW->>S: next()
    S->>Q: queue.add({ type: apply-to-job, userId, jobId, coverLetter })
    Q-->>S: job with job.id
    S-->>C: 202 { queueJobId, status: queued }

    Note over Q,W: Async processing up to concurrency 5
    W->>Q: pick up job
    W->>DB: application.create({ userId, jobId, coverLetter })
    DB-->>W: application record
    W->>Q: job.complete(application)

    Note over C,S: Client polls GET /api/queue/job/:queueJobId for result
```

---

## Get Applications

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as requireAuth + authorizeRoles
    participant S as Server
    participant DB as PostgreSQL

    C->>MW: GET /api/jobseeker/applications
    Note over C,MW: Cookie: accessToken=jwt

    MW->>MW: requireAuth - verify accessToken cookie
    MW->>MW: authorizeRoles(JOB_SEEKER)
    MW->>S: next()
    S->>DB: application.findMany({ userId })
    DB-->>S: applications[]
    S-->>C: 200 { applications }
```

---

## Withdraw Application

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as requireAuth + authorizeRoles
    participant S as Server
    participant DB as PostgreSQL

    C->>MW: DELETE /api/jobseeker/applications/:id
    Note over C,MW: Cookie: accessToken=jwt

    MW->>MW: requireAuth - verify accessToken cookie
    MW->>MW: authorizeRoles(JOB_SEEKER)
    MW->>S: next()
    S->>DB: application.delete({ id: applicationId, userId })
    DB-->>S: deleted
    S-->>C: 200 { message: Application withdrawn successfully }
```

---

## Save Job (async via Queue)

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as requireAuth + authorizeRoles
    participant S as Server
    participant Q as Bull Queue Redis
    participant W as Queue Worker
    participant DB as PostgreSQL

    C->>MW: POST /api/jobseeker/saved/:jobId
    Note over C,MW: Cookie: accessToken=jwt

    MW->>MW: requireAuth - verify accessToken cookie
    MW->>MW: authorizeRoles(JOB_SEEKER)
    MW->>S: next()
    S->>Q: queue.add({ type: save-job, userId, jobId })
    Q-->>S: job with job.id
    S-->>C: 202 { queueJobId, status: queued }

    Note over Q,W: Async processing
    W->>Q: pick up job
    W->>DB: savedJob.create({ userId, jobId })
    DB-->>W: savedJob record
    W->>Q: job.complete(savedJob)
```

---

## Get Saved Jobs

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as requireAuth + authorizeRoles
    participant S as Server
    participant DB as PostgreSQL

    C->>MW: GET /api/jobseeker/saved
    Note over C,MW: Cookie: accessToken=jwt

    MW->>MW: requireAuth - verify accessToken cookie
    MW->>MW: authorizeRoles(JOB_SEEKER)
    MW->>S: next()
    S->>DB: savedJob.findMany({ userId })
    DB-->>S: savedJobs[]
    S-->>C: 200 { savedJobs }
```

---

## Unsave Job

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as requireAuth + authorizeRoles
    participant S as Server
    participant DB as PostgreSQL

    C->>MW: DELETE /api/jobseeker/saved/:jobId
    Note over C,MW: Cookie: accessToken=jwt

    MW->>MW: requireAuth - verify accessToken cookie
    MW->>MW: authorizeRoles(JOB_SEEKER)
    MW->>S: next()
    S->>DB: savedJob.delete({ userId, jobId })
    DB-->>S: deleted
    S-->>C: 200 { message: Job removed from saved list }
```
