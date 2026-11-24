# Queue & Async Write Flow

> High-traffic write operations (apply to job, save job) are off-loaded to a **Bull queue** backed by Redis.  
> The queue uses exponential back-off (3 attempts, starting at 500 ms) and retains both completed and failed jobs so clients can poll their status.

---

## Queue Architecture Overview

```mermaid
flowchart LR
    C["Client"]
    API["Express API"]
    Q[("Bull Queue\nRedis")]
    W["Queue Worker\nconcurrency=5"]
    DB[("PostgreSQL\nPrisma ORM")]

    C -->|"POST /api/jobseeker/apply/:jobId\nCookie: accessToken=jwt"| API
    C -->|"POST /api/jobseeker/saved/:jobId\nCookie: accessToken=jwt"| API
    API -->|"queue.add(payload)"| Q
    API -->|"202 { queueJobId }"| C
    W -->|"queue.process()"| Q
    W -->|"Prisma write"| DB
    DB -->|"result"| W
    W -->|"job.complete(result)"| Q
    C -->|"GET /api/queue/job/:queueJobId"| API
    API -->|"job.getState() + returnvalue"| Q
    Q -->|"status/result"| API
    API -->|"200 { status, result }"| C
```

---

## Queue Job Payload Types

```mermaid
flowchart TD
    P["QueuePayload\ndiscriminated union"]
    A["ApplyToJobPayload\ntype: apply-to-job\nuserId, jobId, coverLetter"]
    SJ["SaveJobPayload\ntype: save-job\nuserId, jobId"]

    P --> A
    P --> SJ
```

---

## Poll Queue Job Status

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant Q as Bull Queue Redis

    C->>S: GET /api/queue/job/:jobId
    Note over C,S: No auth required - open endpoint
    Note over C,S: Path param: jobId returned from 202 response

    S->>Q: dbWriteQueue.getJob(jobId)
    alt job not found
        Q-->>S: null
        S-->>C: 404 { error: Job not found }
    else job exists
        Q-->>S: job object
        S->>Q: job.getState()
        Q-->>S: waiting | active | completed | failed | delayed | paused

        alt state = completed
            S-->>C: 200 { id, type, status: completed, attemptsMade, createdAt, result }
        else state = failed
            S-->>C: 200 { id, type, status: failed, attemptsMade, createdAt, failedReason }
        else other states
            S-->>C: 200 { id, type, status, attemptsMade, createdAt }
        end
    end
```

---

## Worker Retry Logic

```mermaid
flowchart TD
    Start["Job picked up by Worker"]
    Process["Execute handler\napplyToJob or saveJob"]
    Success["job.complete(result)\nEvent: completed"]
    Fail{"Attempt failed?"}
    Retry{"attemptsMade less than 3?"}
    Backoff["Exponential back-off\n500ms x 2^attempt"]
    Dead["job.fail(reason)\nEvent: failed\nkept in Redis for debugging"]

    Start --> Process
    Process --> Fail
    Fail -->|No| Success
    Fail -->|Yes| Retry
    Retry -->|Yes| Backoff --> Process
    Retry -->|No| Dead
```
