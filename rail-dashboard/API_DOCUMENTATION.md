# Indian Railways AI-Powered Automatic Block Planning System
## Backend API Reference & Architecture Guide

Welcome! This document is the complete, practical guide to all APIs currently implemented in this backend. It is designed for frontend developers, AI engineers, and system integrators.

---

## Table of Contents
1. [System Architecture & Data Flow](#1-system-architecture--data-flow)
2. [Role-Based Access Control (RBAC) & Authentication](#2-role-based-access-control-rbac--authentication)
3. [API Categorization (Who Calls What)](#3-api-categorization-who-calls-what)
4. [API Calling Sequence & Dependencies](#4-api-calling-sequence--dependencies)
5. [Complete API Reference](#5-complete-api-reference)
   - [Authentication APIs (`/api/auth`)](#51-authentication-apis-apiauth)
   - [Corridor APIs (`/api/corridors`)](#52-corridor-apis-apicorridors)
   - [Asset APIs (`/api/assets`)](#53-asset-apis-apiassets)
   - [Maintenance Task APIs (`/api/maintenance-tasks`)](#54-maintenance-task-apis-apimaintenance-tasks)
   - [Block Window APIs (`/api/block-windows`)](#55-block-window-apis-apiblock-windows)
   - [Train Movement APIs (`/api/train-movements`)](#56-train-movement-apis-apitrain-movements)
   - [Railway Integration & Sync Gateway (`/api/sync`)](#57-railway-integration--sync-gateway-apisync)
   - [AI Gateway APIs (`/api/v1/ai`)](#58-ai-gateway-apis-apiv1ai)
   - [Planning Workflow & Decisions (`/api/plans`)](#59-planning-workflow--decisions-apiplans)
   - [System Health (`/api/health`)](#510-system-health-apihealth)
   - [Demo / Test Endpoints (`/api/demo`)](#511-demo--test-endpoints-apidemo)
6. [PostgreSQL Schema Mapping](#6-postgresql-schema-mapping)
7. [Audit of Unused, Duplicated, or Demo Routes](#7-audit-of-unused-duplicated-or-demo-routes)

---

## 1. System Architecture & Data Flow

This backend acts as an **integration, coordination, and optimization layer** above Indian Railways legacy operational systems (`TMS`, `SMMS`, `TDMS`, `COA`, `BDMS`). It stores unified railway data in PostgreSQL and coordinates block planning between AI engines and human section controllers.

### End-to-End Data Pipeline:

```
[1. External Railway Systems]
    TMS (Track), SMMS (Signals), TDMS (OHE Electrical), COA (Train Ops), BDMS (Block Availability)
           │
           │ HTTP POST /api/sync/trigger/:source (Idempotent normalization)
           ▼
[2. PostgreSQL Database]
    assets, maintenance_tasks, block_windows, train_movements, corridors
           │
           │ HTTP GET /api/v1/ai/planning-data (Filtered by corridor & horizon)
           ▼
[3. AI Optimization Engine]
    (OR-Tools, Genetic Algorithms, MILP, or external AI solver)
    • Takes tasks, windows, train paths & safety constraints
    • Solves task assignments and generates optimal timetable slots
           │
           │ HTTP POST /api/v1/ai/plans (Submits optimized schedule)
           ▼
[4. Backend Safety & Conflict Engine]
    • Validates task & window boundaries
    • Detects temporal overlaps with scheduled train movements
    • Computes utilization %, duration, delays, and punctuality index
    • Saves block_plans, block_plan_tasks, conflicts
    • Writes initial record to audit_logs
           │
           │ HTTP GET /api/plans/:id
           ▼
[5. Human Railway Planner / Section Controller (Frontend)]
    • Inspects scheduled tasks, windows & detected conflicts
    • Can regulate conflicting trains: PATCH /api/plans/:id/conflicts/:conflictId
    • Can modify task timings/sequence: PUT /api/plans/:id/modify (version bumps to v2)
           │
           │ HTTP POST /api/plans/:id/approve OR /api/plans/:id/reject
           ▼
[6. Approval & Audit Trail]
    • Decision saved in approvals table
    • Plan status updated to APPROVED or REJECTED
    • Every modification and action logged into immutable audit_logs table
```

---

## 2. Role-Based Access Control (RBAC) & Authentication

### How Authentication Works
* Simple bearer token authentication.
* When you log in via `POST /api/auth/login`, you receive a token string.
* Pass this token in every subsequent request header:
  ```http
  Authorization: Bearer <your_token>
  ```
* *(Optional fallback: `x-auth-token: <your_token>` or `?token=<your_token>` query parameter).*

### The 3 System Roles & Permissions Matrix
| Role | Description | Allowed Actions | Restricted Actions |
| :--- | :--- | :--- | :--- |
| **Planner** | Senior Section Engineer / Planning Officer | View all data, trigger syncs, generate AI plans, modify plan tasks, regulate conflicts, submit approvals. | **Cannot** change physical block window status (`PATCH /api/block-windows/:id/status` is blocked). |
| **Operations** | Chief Controller / Section Controller | View all data, trigger syncs, operate block windows, regulate trains, approve or reject block plans. | **Cannot** trigger automated plan generation (`POST /api/plans/generate` is blocked). |
| **Admin** | System Administrator | Unrestricted access across all operational, planning, synchronization, and admin APIs. | None. |

---

## 3. API Categorization (Who Calls What)

### 🔹 Frontend-Facing APIs
These are called by the React/Web dashboard:
* **Authentication**: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/auth/demo-accounts`
* **Corridor Explorer**: `GET /api/corridors`, `GET /api/corridors/summary`, `GET /api/corridors/:id`
* **Asset Tracking**: `GET /api/assets`, `GET /api/assets/summary`, `GET /api/assets/:id`, `PATCH /api/assets/:id/health`
* **Maintenance Tasks**: `GET /api/maintenance-tasks`, `GET /api/maintenance-tasks/summary`, `GET /api/maintenance-tasks/:id`, `PATCH /api/maintenance-tasks/:id/status`
* **Block Windows**: `GET /api/block-windows`, `GET /api/block-windows/summary`, `GET /api/block-windows/:id`, `PATCH /api/block-windows/:id/status`
* **Train Movements**: `GET /api/train-movements`, `GET /api/train-movements/summary`, `GET /api/train-movements/:id`, `PATCH /api/train-movements/:id/status`
* **Block Planning Console**:
  - `POST /api/plans/generate` (Generate weekly/monthly plan)
  - `GET /api/plans` (List plans with corridor & date filters)
  - `GET /api/plans/:id` (Full plan view: tasks, windows, conflicts, metrics, approvals)
  - `PUT /api/plans/:id/modify` (Modify task timings)
  - `PATCH /api/plans/:id/conflicts/:conflictId` (Resolve/regulate conflict)
  - `POST /api/plans/:id/approve` (Approve plan)
  - `POST /api/plans/:id/reject` (Reject plan)
  - `GET /api/plans/:id/audit-logs` (View full audit history)

### 🔹 AI Service-Facing APIs
These are the **only** endpoints the AI solver ever needs to interact with:
* **`GET /api/v1/ai/planning-data`**: Fetches all pending maintenance tasks, available block windows, scheduled trains, and safety buffer rules for a given corridor and horizon.
* **`POST /api/v1/ai/plans`**: Sends back the calculated optimized plan assignments.

> [!IMPORTANT]
> The AI service **never connects directly to PostgreSQL**. It only consumes JSON from `GET /api/v1/ai/planning-data` and pushes its result to `POST /api/v1/ai/plans`.

### 🔹 Integration / Gateway APIs
Used to ingest and monitor legacy railway data:
* `POST /api/sync/trigger/:source` (Sync a specific system: `TMS`, `SMMS`, `TDMS`, `COA`, `BDMS`)
* `POST /api/sync/trigger` (Sync by payload)
* `GET /api/sync/sources` (List configured external systems)
* `GET /api/sync/status` (Current sync health and timestamp of last run)
* `GET /api/sync/history` (Historical sync runs log)

---

## 4. API Calling Sequence & Dependencies

### Scenario A: Frontend First Load & Login
1. `GET /api/auth/demo-accounts` → (Optional) Display demo accounts on login screen.
2. `POST /api/auth/login` → Send `{ username, password }`. Save `token` in client storage.
3. `GET /api/auth/me` → Verify session and user role.
4. `GET /api/corridors` → Load available railway corridors for selection.

### Scenario B: Generating an Automated Weekly/Monthly Plan
1. `POST /api/plans/generate` with `{ corridorCode: "NDLS-CNB", horizonMode: "WEEKLY" }`.
   - *Under the hood, the backend pulls planning data, schedules tasks into available block windows, verifies conflicts against scheduled trains, calculates utilization, and returns the complete registered plan.*
2. `GET /api/plans/:id` → Retrieve plan details to display tasks, time bars, and conflicts on the Gantt chart.

### Scenario C: Resolving Conflicts & Approving Plan
1. If `conflicts` are returned in the plan, review conflicting train paths.
2. Call `PATCH /api/plans/:id/conflicts/:conflictId` with `{ resolutionStatus: "TRAIN_REGULATED", resolutionDetails: { ... } }`.
3. If necessary, adjust task slots via `PUT /api/plans/:id/modify`.
4. Operations controller calls `POST /api/plans/:id/approve` with `{ comments: "Approved" }`.
5. `GET /api/plans/:id/audit-logs` shows the complete chronological decision trail.

---

## 5. Complete API Reference

---

### 5.1 Authentication APIs (`/api/auth`)

#### `POST /api/auth/login`
* **Purpose**: Authenticates a user and opens a session.
* **Auth Requirement**: Public (None).
* **Tables Used**: `users`, `roles`, `departments`.
* **Request Body**:
  ```json
  {
    "username": "planner",
    "password": "Planner@123"
  }
  ```
* **Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "message": "Authentication successful",
    "token": "d748f3...",
    "user": {
      "id": "22222222-2222-2222-2222-222222222222",
      "username": "planner",
      "role": "Planner",
      "fullName": "Rajesh Sharma",
      "designation": "Senior Section Engineer (Planning)",
      "department": "ENGG",
      "employeeId": "IR-PLN-102"
    }
  }
  ```

#### `GET /api/auth/demo-accounts`
* **Purpose**: Returns the list of pre-configured demo credentials for test environments.
* **Auth Requirement**: Public (None).
* **Success Response (`200 OK`)**: Returns username, role, full name, and designation.

#### `GET /api/auth/me`
* **Purpose**: Returns details of the currently logged-in user.
* **Auth Requirement**: Any authenticated user (`Bearer <token>`).
* **Success Response (`200 OK`)**: Returns the `user` profile object.

#### `POST /api/auth/logout`
* **Purpose**: Invalidates and destroys the current active session.
* **Auth Requirement**: Any authenticated user.
* **Success Response (`200 OK`)**:
  ```json
  { "success": true, "message": "Successfully logged out" }
  ```

---

### 5.2 Corridor APIs (`/api/corridors`)

#### `GET /api/corridors`
* **Purpose**: Lists railway corridors with optional filters.
* **Auth Requirement**: Any authenticated user.
* **Tables Used**: `corridors`.
* **Query Parameters**:
  * `zone` (e.g., `NCR`, `ECR`)
  * `division` (e.g., `Prayagraj`)
  * `electrified` (`true` / `false`)
  * `line_type` (`DOUBLE_LINE`, `TRIPLE_LINE`, etc.)
  * `search` (matches corridor code or name)
* **Success Response (`200 OK`)**: Array of corridor objects with total track length, start/end stations.

#### `GET /api/corridors/summary`
* **Purpose**: Aggregate statistics for dashboards.
* **Auth Requirement**: Any authenticated user.
* **Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": {
      "total_corridors": 2,
      "active_corridors": 2,
      "electrified_corridors": 2,
      "total_length_km": 890.5
    }
  }
  ```

#### `GET /api/corridors/:id`
* **Purpose**: Details of a single corridor.
* **Auth Requirement**: Any authenticated user.

---

### 5.3 Asset APIs (`/api/assets`)

#### `GET /api/assets`
* **Purpose**: Track assets (points, turnouts, OHE sections, track segments).
* **Auth Requirement**: Any authenticated user.
* **Tables Used**: `assets`, `corridors`, `integration_sources`.
* **Query Parameters**: `corridor_id`, `source_system` (`TMS`, `SMMS`, `TDMS`), `criticality` (`CRITICAL`, `HIGH`, `MEDIUM`), `health_status` (`HEALTHY`, `NEEDS_INSPECTION`, `DEFECTIVE`), `search`.
* **Success Response (`200 OK`)**: Array of assets with kilometer markers and health status.

#### `GET /api/assets/summary`
* **Purpose**: Asset count grouped by health status and criticality.
* **Auth Requirement**: Any authenticated user.

#### `GET /api/assets/:id`
* **Purpose**: Details of an asset.

#### `PATCH /api/assets/:id/health`
* **Purpose**: Updates an asset's health status following inspection.
* **Auth Requirement**: `Planner`, `Operations`, `Admin`.
* **Request Body**:
  ```json
  { "health_status": "NEEDS_MAINTENANCE", "notes": "Observed contact wire wear" }
  ```

---

### 5.4 Maintenance Task APIs (`/api/maintenance-tasks`)

#### `GET /api/maintenance-tasks`
* **Purpose**: Lists pending or scheduled maintenance requests from TMS, SMMS, and TDMS.
* **Auth Requirement**: Any authenticated user.
* **Tables Used**: `maintenance_tasks`, `departments`, `assets`, `corridors`, `integration_sources`.
* **Query Parameters**:
  * `corridor_id`
  * `department` (`ENGG`, `SNT`, `TRD`)
  * `source_system` (`TMS`, `SMMS`, `TDMS`)
  * `status` (`PENDING`, `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `DEFERRED`)
  * `priority` (integer 1 to 5)
  * `traffic_block_required` (`true` / `false`)
  * `power_block_required` (`true` / `false`)
  * `required_by_before` (ISO 8601 Date string)

#### `GET /api/maintenance-tasks/summary`
* **Purpose**: Metrics on pending, critical, and completed tasks.
* **Auth Requirement**: Any authenticated user.

#### `GET /api/maintenance-tasks/:id`
* **Purpose**: Single task details.

#### `PATCH /api/maintenance-tasks/:id/status`
* **Purpose**: Allows planner to manually adjust task status (e.g., mark `DEFERRED` or `IN_PROGRESS`).
* **Auth Requirement**: `Planner`, `Admin` (Operations cannot modify task status).
* **Request Body**:
  ```json
  { "status": "IN_PROGRESS", "notes": "Work team dispatched" }
  ```

---

### 5.5 Block Window APIs (`/api/block-windows`)

#### `GET /api/block-windows`
* **Purpose**: Lists available or reserved track block windows from COA and BDMS.
* **Auth Requirement**: Any authenticated user.
* **Tables Used**: `block_windows`, `corridors`, `integration_sources`.
* **Query Parameters**: `corridor_id`, `availability_status` (`AVAILABLE`, `RESERVED`, `UTILIZED`), `block_type` (`TRAFFIC_BLOCK`, `POWER_BLOCK`, `INTEGRATED_BLOCK`), `start_after`, `end_before`.

#### `GET /api/block-windows/summary`
* **Purpose**: Aggregate count of available duration and reserved windows.

#### `GET /api/block-windows/:id`
* **Purpose**: Single block window details.

#### `PATCH /api/block-windows/:id/status`
* **Purpose**: Operations controller reserves or releases a block window.
* **Auth Requirement**: `Operations`, `Admin` (Planners cannot operate windows).
* **Request Body**:
  ```json
  { "availability_status": "RESERVED" }
  ```

---

### 5.6 Train Movement APIs (`/api/train-movements`)

#### `GET /api/train-movements`
* **Purpose**: Timetable and real-time train movement paths from COA.
* **Auth Requirement**: Any authenticated user.
* **Tables Used**: `train_movements`, `corridors`.
* **Query Parameters**: `corridor_id`, `train_type` (`VANDE_BHARAT`, `RAJDHANI`, `EXPRESS`, `FREIGHT`), `priority` (1 to 5), `status` (`SCHEDULED`, `RUNNING`, `REGULATED`, `DIVERTED`), `search` (train number or name).

#### `GET /api/train-movements/summary`
* **Purpose**: Counts of scheduled, running, and regulated trains.

#### `GET /api/train-movements/:id`
* **Purpose**: Single train movement schedule.

#### `PATCH /api/train-movements/:id/status`
* **Purpose**: Operations controller regulates or updates train status.
* **Auth Requirement**: `Operations`, `Admin`.
* **Request Body**:
  ```json
  { "status": "REGULATED", "operational_details": { "delayMinutes": 20 } }
  ```

---

### 5.7 Railway Integration & Sync Gateway (`/api/sync`)

#### `POST /api/sync/trigger/:source` (or `POST /api/sync/:source`)
* **Purpose**: Idempotently imports and synchronizes external records into PostgreSQL.
* **Auth Requirement**: `Planner`, `Operations`, `Admin`.
* **URL Parameter**: `source` (Allowed values: `TMS`, `SMMS`, `TDMS`, `COA`, `BDMS`).
* **Tables Used**: `sync_runs`, `integration_sources`, plus respective entity tables (`assets`, `maintenance_tasks`, `block_windows`, `train_movements`).
* **Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "result": {
      "sourceCode": "TMS",
      "syncRun": {
        "id": "sr-1788982...",
        "records_received": 2,
        "records_created": 0,
        "records_updated": 2,
        "records_failed": 0,
        "status": "COMPLETED"
      }
    }
  }
  ```

#### `GET /api/sync/status`
* **Purpose**: Returns the synchronization state and last sync timestamp for all 5 systems.
* **Auth Requirement**: Any authenticated user.

#### `GET /api/sync/history`
* **Purpose**: Lists historical sync runs with success/failure statistics.
* **Auth Requirement**: Any authenticated user.

#### `GET /api/sync/sources`
* **Purpose**: Lists configured external source systems.
* **Auth Requirement**: Any authenticated user.

---

### 5.8 AI Gateway APIs (`/api/v1/ai`)

#### `GET /api/v1/ai/planning-data`
* **Purpose**: Extracts all operational data the AI needs to solve block scheduling.
* **Auth Requirement**: Any authenticated user (or AI service token).
* **Tables Used**: `corridors`, `maintenance_tasks`, `block_windows`, `train_movements`, `assets`, `maintenance_dependencies`.
* **Query Parameters**:
  * `corridorCode` (e.g., `NDLS-CNB`) OR `corridorId`
  * `horizonStart` (ISO 8601 Date string)
  * `horizonEnd` (ISO 8601 Date string)
* **Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "planningHorizon": {
      "corridorCode": "NDLS-CNB",
      "horizonStart": "2026-09-12T00:00:00.000Z",
      "horizonEnd": "2026-09-19T00:00:00.000Z"
    },
    "corridor": { "id": "...", "code": "NDLS-CNB", "lengthKm": 440.5 },
    "maintenanceTasks": [ ... ],
    "blockWindows": [ ... ],
    "trainMovements": [ ... ],
    "operationalConstraints": {
      "maxConcurrentBlocksPerSection": 1,
      "minHeadwayBufferMinutes": 15,
      "ohePowerIsolationBufferMinutes": 10,
      "speedRestrictionRecoveryMinutes": 20
    }
  }
  ```

#### `POST /api/v1/ai/plans`
* **Purpose**: Receives the AI solver's optimized schedule, validates references, evaluates train conflicts, calculates metrics, saves to PostgreSQL, and logs to `audit_logs`.
* **Auth Requirement**: `Planner`, `Admin`, or `AI_OPTIMIZER`.
* **Tables Used**: `block_plans`, `block_plan_tasks`, `conflicts`, `audit_logs`, `maintenance_tasks`.
* **Request Body**:
  ```json
  {
    "planReference": "BP-NDLS-CNB-20260912-V1",
    "corridorId": "c1111111-1111-1111-1111-111111111111",
    "horizonStartDate": "2026-09-12T00:00:00Z",
    "horizonEndDate": "2026-09-19T00:00:00Z",
    "version": 1,
    "aiOptimizationMetadata": { "solver": "MILP-v2.1", "iterations": 140 },
    "assignedTasks": [
      {
        "maintenanceTaskId": "t1111111-1111-1111-1111-111111111111",
        "assignedBlockWindowId": "w1111111-1111-1111-1111-111111111111",
        "assignedStartTime": "2026-09-12T01:30:00Z",
        "assignedEndTime": "2026-09-12T03:30:00Z",
        "sequenceOrder": 1,
        "aiRecommendationScore": 0.9600,
        "shadowTask": false,
        "notes": "Optimal daylight maintenance slot"
      }
    ]
  }
  ```
* **Success Response (`201 Created`)**:
  ```json
  {
    "success": true,
    "message": "AI Optimized Block Plan [BP-NDLS-CNB-20260912-V1] created and registered in PostgreSQL",
    "plan": {
      "id": "bp-...",
      "status": "OPTIMIZED",
      "approval_state": "PENDING",
      "utilization_percentage": "100.00",
      "total_block_duration_minutes": 120,
      "conflict_count": 1,
      "operational_impact_metrics": {
        "totalSlotMinutes": 120,
        "conflictedTrainsCount": 1,
        "estimatedDelayMinutes": 25,
        "punctualityImpactIndex": "0.95"
      }
    },
    "assignedTasks": [ ... ],
    "conflicts": [ ... ]
  }
  ```

#### `GET /api/v1/ai/plans/:id`
* **Purpose**: Inspects an AI plan, its task assignments, and detected conflicts.

#### `GET /api/v1/ai/plans`
* **Purpose**: Lists registered block plans (`corridor_id`, `status` filters).

---

### 5.9 Planning Workflow & Decisions (`/api/plans`)

#### `POST /api/plans/generate`
* **Purpose**: Allows a human planner to trigger a planning job with high-level parameters (e.g. weekly or monthly). Under the hood, this queries planning data, maps tasks into block windows, runs conflict detection, and writes to `audit_logs`.
* **Auth Requirement**: `Planner`, `Admin`.
* **Request Body**:
  ```json
  {
    "corridorCode": "NDLS-CNB",
    "horizonMode": "WEEKLY",
    "startDate": "2026-09-12T00:00:00Z",
    "optimizationGoal": "BALANCED_MIN_CONFLICTS"
  }
  ```
  *(Supported `horizonMode`: `WEEKLY` (7 days), `MONTHLY` (30 days), or `CUSTOM` with explicit `startDate` and `endDate`).*
* **Success Response (`201 Created`)**: Returns `{ success: true, plan, assignedTasks, conflicts, metrics }`.

#### `GET /api/plans`
* **Purpose**: List block plans with corridor and date-range filters.
* **Auth Requirement**: Any authenticated user.
* **Query Parameters**:
  * `corridor_code` / `corridor_id`
  * `status` (`OPTIMIZED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`)
  * `approval_state` (`PENDING`, `APPROVED`, `REJECTED`)
  * `horizon_mode` (`WEEKLY`, `MONTHLY`)
  * `start_date`, `end_date`

#### `GET /api/plans/:id`
* **Purpose**: Retrieves full plan details including:
  * Assigned tasks joined with maintenance task details (title, department, duration) and block window details (block type, kilometer boundaries).
  * Detected conflicts joined with train numbers and severity.
  * Formal approval history.
  * Operational metrics (utilization %, block duration, delays).
* **Auth Requirement**: Any authenticated user.

#### `PUT /api/plans/:id/modify`
* **Purpose**: Allows a planner to adjust task slots or re-sequence tasks. Bumps plan version (e.g., v1 → v2), sets status to `UNDER_REVIEW`, re-calculates train conflicts, and logs the change to `audit_logs`.
* **Auth Requirement**: `Planner`, `Admin`.
* **Request Body**:
  ```json
  {
    "assignedTasks": [
      {
        "maintenanceTaskId": "...",
        "assignedBlockWindowId": "...",
        "assignedStartTime": "2026-09-12T02:00:00Z",
        "assignedEndTime": "2026-09-12T04:00:00Z",
        "sequenceOrder": 1
      }
    ],
    "notes": "Shifted 30 mins later to avoid express train"
  }
  ```

#### `PATCH /api/plans/:id/conflicts/:conflictId`
* **Purpose**: Resolves or regulates a conflict between a maintenance task and a scheduled train.
* **Auth Requirement**: `Planner`, `Operations`, `Admin`.
* **Request Body**:
  ```json
  {
    "resolutionStatus": "TRAIN_REGULATED",
    "resolutionDetails": {
      "delayMinutes": 15,
      "route": "Preceding loop line"
    }
  }
  ```
  *(Valid `resolutionStatus`: `UNRESOLVED`, `AUTO_RESOLVED`, `MANUALLY_OVERRIDDEN`, `ACCEPTED_DELAY`, `TRAIN_REGULATED`, `REJECTED`).*

#### `POST /api/plans/:id/approve`
* **Purpose**: Formally approves a block plan for execution.
* **Auth Requirement**: `Planner`, `Operations`, `Admin`.
* **Request Body**:
  ```json
  { "comments": "Verified with section controller. Block approved." }
  ```
* **Effect**: Writes record to `approvals` table, updates plan status to `APPROVED`, writes to `audit_logs`.

#### `POST /api/plans/:id/reject`
* **Purpose**: Formally rejects a block plan.
* **Auth Requirement**: `Planner`, `Operations`, `Admin`.
* **Request Body**:
  ```json
  { "reason": "Conflict with Vande Bharat path cannot be regulated." }
  ```
* **Effect**: Writes record to `approvals` table, updates plan status to `REJECTED`, writes to `audit_logs`.

#### `GET /api/plans/:id/audit-logs`
* **Purpose**: Retrieves the immutable audit trail showing who generated, modified, resolved conflicts, and approved/rejected the plan.
* **Auth Requirement**: Any authenticated user.

---

### 5.10 System Health (`/api/health`)

#### `GET /api/health`
* **Purpose**: Liveness and readiness probe for deployment platforms.
* **Auth Requirement**: Public (None).
* **Success Response (`200 OK`)**:
  ```json
  {
    "status": "UP",
    "service": "Indian Railways Automatic Block Planning API",
    "timestamp": "2026-09-10T01:30:00.000Z"
  }
  ```

---

### 5.11 Demo / Test Endpoints (`/api/demo`)
*These 4 endpoints were created during initial development to verify role-based route guard behavior. They return static mock status objects.*
* `GET /api/demo/planner/dashboard` (Accessible to `Planner`, `Admin`)
* `GET /api/demo/operations/dispatch` (Accessible to `Operations`, `Admin`)
* `GET /api/demo/admin/settings` (Accessible to `Admin`)
* `GET /api/demo/shared/status` (Accessible to any authenticated user)

---

## 6. PostgreSQL Schema Mapping

| Database Table | Primary Entity / Purpose | Associated Endpoints |
| :--- | :--- | :--- |
| `users` | Railway personnel & system user accounts | `/api/auth/*` |
| `roles` | System roles (`ADMIN`, `CHIEF_CONTROLLER`, etc.) | `/api/auth/*` |
| `departments` | Railway departments (`ENGG`, `SNT`, `TRD`, `OPTG`) | `/api/maintenance-tasks` |
| `corridors` | High-density railway corridors | `/api/corridors/*` |
| `assets` | Track, signaling & electrical physical assets | `/api/assets/*` |
| `maintenance_tasks` | Work orders imported from TMS, SMMS, TDMS | `/api/maintenance-tasks/*` |
| `maintenance_dependencies` | Inter-task operational dependencies | `/api/v1/ai/planning-data` |
| `block_windows` | Available/reserved track block slots | `/api/block-windows/*` |
| `train_movements` | Passenger & freight train timetables | `/api/train-movements/*` |
| `block_plans` | Header record of generated AI block plans | `/api/plans/*`, `/api/v1/ai/plans/*` |
| `block_plan_tasks` | Task allocations within a block plan | `/api/plans/:id`, `/api/v1/ai/plans/*` |
| `conflicts` | Detected train path overlaps & resolutions | `/api/plans/:id/conflicts/*` |
| `approvals` | Formal approval/rejection decision logs | `/api/plans/:id/approve`, `reject` |
| `audit_logs` | Immutable audit trail of every operational decision | `/api/plans/:id/audit-logs` |
| `integration_sources` | Legacy systems catalog (`TMS`, `SMMS`, etc.) | `/api/sync/sources` |
| `sync_runs` | Logs of each integration data synchronization run | `/api/sync/history`, `status` |

---

## 7. Audit of Unused, Duplicated, or Demo Routes

1. **Demo Routes (`/api/demo/*`)**:
   - `GET /api/demo/planner/dashboard`, `dispatch`, `settings`, `shared/status`
   - *Status*: Working test endpoints used to verify RBAC guards. They do not affect production data and can remain for quick smoke tests or be omitted from the production UI.
2. **AI Plans vs General Plans (`/api/v1/ai/plans` vs `/api/plans`)**:
   - `/api/v1/ai/plans` is the dedicated ingestion gateway for AI solvers.
   - `/api/plans` is the full planning lifecycle console for human railway operators.
   - *Status*: Both are fully functional and complementary.
3. **Sync Aliases (`/api/sync/trigger/:source` and `/api/sync/:source`)**:
   - Both point to the exact same controller method `syncController.triggerSync` for developer convenience.

---

### Quick Verification
All routes documented above are verified against the source code in `backend/src/` and pass the automated test suites (`npm test`) with **0 errors**.
