# CSL Assessment Platform — Phase 3 Technical Design Document
## Programming Playground (Judge0 Execution Engine) & AI/Camera Proctoring Architecture

> **Document Status:** Architectural Specification & Design Draft (Phase 3 Preparation)  
> **Phase:** 3.0 Readiness  
> **Repository:** `csl-student-module`  
> **Author:** CSL Platform Engineering Architecture  
> **Target Delivery:** Phase 3.0 Implementation Workstream  
> **Notice:** This document defines the formal architectural blueprint for Phase 3. No actual live code execution engines or camera recording streams are deployed in Phase 2.2.2; all models, endpoints, and workflows outlined herein represent approved design proposals ready for future phased deployment.

---

## 1. Executive Summary

The CSL Assessment Platform has successfully stabilized its Phase 2.1 and Phase 2.2 milestones:
- Multi-pool question banks and dynamic section allocations
- Assessment-authoritative data ownership with Drive organizational hierarchies
- Direct student self-service recovery, heartbeat integrity tracking, and offline sync resilience
- Public student-facing Drive experience without mandatory account creation

Phase 3 introduces two mission-critical capabilities required for high-stakes institutional engineering hiring:
1. **Programming Playground & Automated Code Evaluation:** Interactive browser-based IDE (Monaco Editor) supporting Python 3 and Java 17/21 execution through an isolated, sandboxed execution worker (Judge0 CE/Enterprise cluster). Provides real-time compilation, standard input streaming, public and hidden test case evaluation, memory limit enforcement, and execution time bounds.
2. **Automated Browser-Based Proctoring & Evidence Ledger:** WebRTC-based camera stream verification, periodic cryptographic video snapshot capture, head posture / presence tracking, and synchronized integrity event ledger with a dedicated administrative proctoring review interface.

---

## 2. Programming Playground Architecture

### 2.1 High-Level Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                            CANDIDATE BROWSER CLIENT                               |
|                                                                                   |
|  +---------------------------+   +---------------------------------------------+  |
|  |   Monaco Code Editor      |   |            Playground Test Console          |  |
|  | - Syntax Highlighting     |   | - Sample Test Cases (Inputs / Expected)     |  |
|  | - Language: Python / Java |   | - Custom Standard Input Console             |  |
|  | - Autosave & Local Buffer |   | - Execution Status & stdout/stderr stream   |  |
|  +-------------+-------------+   +----------------------+----------------------+  |
|                |                                        ^                         |
+----------------|----------------------------------------|-------------------------+
                 | POST /api/assessment/code/run/         | Polling / SSE Status
                 v                                        |
+---------------------------------------------------------+-------------------------+
|                         DJANGO REST FRAMEWORK BACKEND                             |
|                                                                                   |
|  +----------------------------+       +----------------------------------------+  |
|  | Code Execution Coordinator | ----> | Database: Test Cases, Limits, Snapshots |  |
|  +--------------+-------------+       +----------------------------------------+  |
+-----------------|-----------------------------------------------------------------+
                  | Dispatches task to Celery / Redis Worker
                  v
+-----------------------------------------------------------------------------------+
|                        ISOLATED EXECUTION WORKER / JUDGE0                         |
|                                                                                   |
|  +-------------------------+   +-----------------------+   +-------------------+  |
|  | Docker Sandbox (Python) |   | Docker Sandbox (Java) |   | Cgroup V2 Limits  |  |
|  | - CPU quota: 2.0s max   |   | - Memory max: 256MB   |   | - Network: None   |  |
|  +-------------------------+   +-----------------------+   +-------------------+  |
+-----------------------------------------------------------------------------------+
```

### 2.2 Candidate Experience & Workflow
1. The student navigates to a coding question within the active assessment session.
2. The Monaco Editor loads language boilerplates (e.g. `def solution(args):` for Python, `public class Solution { public static void main(String[] args) {} }` for Java).
3. The candidate has two execution modes:
   - **"Run Sample Tests":** Runs candidate code against visible sample test cases with user-editable inputs; results stream back in < 1500ms.
   - **"Submit Final Solution":** Executes the candidate's submission against visible test cases plus hidden test cases, calculates score based on test suite weightage, and securely stores the submission code and execution artifacts in PostgreSQL.

---

## 3. Code Execution Flow (Python and Java)

### 3.1 Python 3 Flow
1. **Source Sanitization:** Disallow destructive module patching where possible, though the true security perimeter is the container cgroup sandbox.
2. **Submission Wrapper:** Inject harness script that redirects `stdin` to test case input files and captures `stdout` / `stderr`.
3. **Execution:** Python 3.11/3.12 interpreter runs within a dedicated container with:
   - Max wall-clock time: 5.0 seconds
   - Max CPU execution time: 2.0 seconds
   - Max resident memory: 128 MB
   - Network interface: Disabled (`--net=none`)
   - Read-only root filesystem with ephemeral `/tmp` mounted `noexec`.

### 3.2 Java Flow
1. **File Normalization:** Automatically extract or normalize the public class name to `Solution.java` or `Main.java`.
2. **Compilation Phase:**
   - Execute `javac -encoding UTF-8 -J-Xmx256m Solution.java`.
   - If exit code != 0, capture compiler diagnostics from stderr, translate line offsets, and return `COMPILATION_ERROR` immediately without wasting execution units.
3. **Execution Phase:**
   - Execute `java -Dfile.encoding=UTF-8 -Xms32m -Xmx256m -XX:+UseSerialGC Solution`.
   - Strict timeout: 3.0 seconds CPU time.
   - Standard input streamed via pipe.

---

## 4. Isolated Execution Engine Design (Judge0 Integration)

### 4.1 Architecture Strategy
- Deploy a standalone, self-hosted Judge0 CE cluster adjacent to the CSL PostgreSQL and Redis instances.
- Maintain dedicated worker pools:
  - High-priority interactive worker pool for "Run Tests" (low concurrency latency, < 1.5s).
  - Standard queue for "Submit All Test Cases" batch evaluations.

### 4.2 Sandboxing & Resource Isolation Parameters
| Parameter | Python 3 | Java 17/21 | Rationale |
| :--- | :--- | :--- | :--- |
| **Max CPU Time** | 2.000 s | 3.000 s | Prevents infinite while/for loops |
| **Max Wall Time** | 5.000 s | 7.000 s | Guards against I/O blocking |
| **Memory Limit** | 128 MB | 256 MB | Java JVM requires baseline metadata space |
| **Stack Limit** | 64 MB | 128 MB | Prevents unhandled recursion segmentation faults |
| **Max File Output** | 1024 KB | 1024 KB | Prevents disk exhaustion via infinite print loops |
| **Process Count** | 30 | 60 | Prevents fork bombs |
| **Network Access** | Blocked (`none`) | Blocked (`none`) | Prevents SSRF, data exfiltration, or DDoS |

---

## 5. Test Case Management and Automated Evaluation

### 5.1 Test Case Types
1. **Public Sample Test Cases:** Visible in candidate UI with full input, expected output, and explanation. Used for local verification and candidate confidence.
2. **Hidden Evaluation Test Cases:** Concealed from student inspection. Tests edge cases, large input scale, boundary constraints, and negative inputs.

### 5.2 Verdict Classification
- `ACCEPTED` (AC): Code passed within time, memory, and output constraints.
- `WRONG_ANSWER` (WA): Execution succeeded, but output tokens failed matching comparison.
- `TIME_LIMIT_EXCEEDED` (TLE): Execution exceeded CPU quota.
- `MEMORY_LIMIT_EXCEEDED` (MLE): Memory breached cgroup threshold.
- `RUNTIME_ERROR` (RTE): Unhandled exception / SIGSEGV / non-zero exit code.
- `COMPILATION_ERROR` (CE): Compiler exited with errors.

---

## 6. Security and Sandboxing Strategy

1. **Kernel Cgroups (v2):** Strict cgroup limits enforced by kernel for memory, CPU shares, and PIDs.
2. **Seccomp Filtering:** Restrict Linux system calls. Block `ptrace`, `chroot`, `mount`, socket creation, and kernel module loading.
3. **Drop Capabilities:** Drop all root Linux capabilities (`cap_drop: ALL`). Run execution worker as an unprivileged UID/GID (1000:1000).
4. **Ephemeral Filesystem:** Writable `/tmp` mounted with `tmpfs,nodev,nosuid,noexec,size=32m`.

---

## 7. Camera Permission and Proctoring Workflow

### 7.1 Lifecycle
1. **Pre-Assessment Hardware Check:**
   - Candidate browser requests `navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false })`.
   - Visual preview with facial alignment guide.
   - Permissions must be granted before "Start Assessment" unlocks.
2. **Periodic Snapshot Sampling:**
   - Every 60-120 seconds (configurable per assessment), capture a lightweight JPEG frame (quality: 0.65, size ~25-35KB).
   - Frame is timestamped, hashed (SHA-256), and posted to proctoring evidence storage.
3. **Client-Side Face Detection:**
   - Lightweight TensorFlow.js / MediaPipe Face Detection model runs in client WebWorker:
     - `NO_FACE_DETECTED`: Student stepped away from camera.
     - `MULTIPLE_FACES_DETECTED`: Second person entered field of view.
     - `PROLONGED_LOOKAWAY`: Candidate head angle diverted for > 15 seconds.
4. **Integrity Event Synthesis:**
   - Breaches automatically post an `IntegrityEvent` linked directly to the `AssessmentAttempt`.

---

## 8. Proctoring Evidence Storage

1. **Object Storage Backend:**
   - Snapshots uploaded directly or via signed URLs to Neon Object Storage / AWS S3 under key hierarchy:  
     `proctoring/{assessment_id}/{attempt_id}/{timestamp_epoch}_{sha256[:12]}.jpg`
2. **Database Metadata Ledger:**
   - Store record in `ProctoringSnapshot` model with URL/S3 key, timestamp, attempt FK, candidate FK, event trigger type, and ML inference scores.
3. **Retention & Archival Policy:**
   - Raw image frames retained for 90 days after assessment release, then automatically purged while retaining detection metadata in PostgreSQL.

---

## 9. Administrator Review Interface

1. **Attempt Review Drawer / Inspector:**
   - Filmstrip timeline of candidate camera snapshots synced to assessment timeline and question navigation.
   - Event markers on timeline (e.g. Red flag: "Tab Switch at 14:22", Orange flag: "Multiple Faces at 14:35").
2. **Side-by-Side Code & Execution Inspector:**
   - Review candidate code submissions with syntax highlighting.
   - Inspect stdout, runtime diagnostics, and passed vs failed test cases.
3. **Reassessment & Clearance:**
   - Admin can clear false positives or confirm flags with an audit trail note.

---

## 10. Database Extension Proposal (Phase 3 Future Models)

```sql
-- FUTURE PROPOSAL: Do not execute in Phase 2.2.2

-- 1. Programming Questions Extension
CREATE TABLE IF NOT EXISTS assessment_programming_question (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_bank_id INT REFERENCES assessments_questionbank(id) ON DELETE CASCADE,
    allowed_languages JSONB DEFAULT '["PYTHON", "JAVA"]'::jsonb,
    boilerplate_code JSONB DEFAULT '{}'::jsonb,
    time_limit_seconds NUMERIC(4,2) DEFAULT 2.00,
    memory_limit_mb INT DEFAULT 256,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Test Cases Model
CREATE TABLE IF NOT EXISTS assessment_code_testcase (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    programming_question_id UUID REFERENCES assessment_programming_question(id) ON DELETE CASCADE,
    is_public BOOLEAN DEFAULT FALSE,
    input_text TEXT NOT NULL,
    expected_output TEXT NOT NULL,
    marks_weightage INT DEFAULT 10,
    display_order INT DEFAULT 0
);

-- 3. Candidate Code Submissions
CREATE TABLE IF NOT EXISTS assessment_code_submission (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID REFERENCES assessments_assessmentattempt(id) ON DELETE CASCADE,
    programming_question_id UUID REFERENCES assessment_programming_question(id) ON DELETE CASCADE,
    language VARCHAR(20) NOT NULL,
    source_code TEXT NOT NULL,
    verdict VARCHAR(32) DEFAULT 'PENDING',
    execution_time_ms INT,
    memory_used_kb INT,
    score_awarded NUMERIC(5,2) DEFAULT 0.00,
    compiler_output TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Proctoring Snapshots Ledger
CREATE TABLE IF NOT EXISTS proctoring_snapshot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID REFERENCES assessments_assessmentattempt(id) ON DELETE CASCADE,
    candidate_id UUID REFERENCES assessments_candidate(id) ON DELETE CASCADE,
    s3_key VARCHAR(512) NOT NULL,
    trigger_type VARCHAR(32) DEFAULT 'PERIODIC',
    face_count INT DEFAULT 1,
    is_flagged BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 11. API Extension Proposal (Phase 3 Future Endpoints)

| Method | Proposed Endpoint | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/assessment/code/run/` | Execute code against sample test cases in Monaco console |
| `POST` | `/api/assessment/code/submit/` | Submit final code solution and evaluate all test cases |
| `POST` | `/api/assessment/proctoring/snapshot/` | Upload client camera snapshot frame with inference tags |
| `GET` | `/api/csl-admin/attempts/<uuid>/proctoring/` | Administrator timeline view of proctoring frames and events |
| `GET` | `/api/csl-admin/attempts/<uuid>/code-reviews/` | Administrator code review & test case breakdown |

---

## 12. Verification & Phased Roadmap

1. **Phase 2.2.2 (Current):** Stabilize Drive/Assessment Many-to-Many architecture, public account-free student registration, deduplicated analytics, and complete test coverage.
2. **Phase 3.0 (Upcoming):** Deploy isolated Judge0 worker pool, integrate Monaco Editor for Python/Java MCQ+Coding hybrid rounds.
3. **Phase 3.1 (Subsequent):** Deploy WebRTC proctoring frame sampling and administrative proctoring review inspector.
