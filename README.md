# TravelMate Backend MVP (Phase 1)

Welcome to the **TravelMate** trust-first group travel matching backend repository. This codebase is bootstrapped using Node.js + TypeScript, Express, PostgreSQL 18, and Prisma ORM, following the specifications of the PRD and TRD documents.

---

## 📂 Folder Structure

The project has been scaffolded according to the Phase 1 architectural boundaries:

```text
TRAVEL MATE_INTERN PROJECT/
├── db/
│   └── travelmate_schema.sql         # Verbatim schema DDL applied on migration
├── prisma/
│   └── schema.prisma                 # Introspected Prisma schema models
├── src/
│   ├── db/
│   │   ├── client.ts                 # Exported PrismaClient instance
│   │   └── migrate.ts                # Verbatim database migration executor
│   ├── middleware/
│   │   ├── auth.middleware.ts        # JWT extraction & authorization gates
│   │   ├── logger.middleware.ts      # Incoming request logging middleware
│   │   └── rateLimiter.middleware.ts # IP and user request frequency throttling
│   ├── modules/
│   │   ├── auth/
│   │   │   └── auth.controller.ts    # signup, verify-otp, login, refresh, logout
│   │   ├── trips/
│   │   │   └── trips.controller.ts   # create, list, update, and close trips
│   │   └── users/
│   │       └── users.controller.ts   # combined profile and contact CRUD operations
│   ├── test/
│   │   └── integration.test.ts       # Automated integration test script
│   └── index.ts                      # App entrypoint initializing Express & Middlewares
├── tsconfig.json                     # TypeScript compiler configuration
├── package.json                      # NPM dependencies & helper scripts
└── .env                              # Environment configuration (DB connection & Secrets)
```

---

## 🛠️ Getting Started

### Prerequisites
- Node.js (v20+)
- PostgreSQL 15+ (Running locally on default port `5432` with credentials `postgres/postgres`)

### 1. Installation
Install project dependencies:
```bash
npm install
```

### 2. Run Database Migration & Introspection
Execute the custom migration script to create the `travelmate` database, apply the verbatim database schema `db/travelmate_schema.sql` (with the added `password_hash` column), introspect the database to fill `schema.prisma`, and generate the Prisma Client:
```bash
npm run migrate
```

### 3. Run the Server (Development Mode)
Start the Express server on `http://localhost:8080`:
```bash
npm run dev
```

### 4. Run the Integration Tests
Execute the integration test suite that launches a temporary server and runs 13 validation tests checking Auth, Profiles, Trips, and token rotations:
```bash
npm run test
```

---

## 📜 API Endpoints Built vs. TRD OpenAPI Specification

The following tables document what was built in this run and map them directly back to the TRD OpenAPI spec, flagging differences:

### Auth Module
| Route | Method | Description | TRD Status | Note |
|---|---|---|---|---|
| `/auth/register` | `POST` | Registers a new user & profile | In Spec | Verbatim request validation (phone pattern, age limits). |
| `/auth/verify-otp` | `POST` | Verifies phone OTP code | In Spec | Mocks gateway using OTP code `123456`. Boosts trust score. |
| `/auth/login` | `POST` | Validates credentials, issues JWTs | In Spec | Validates bcrypt password hash. |
| `/auth/refresh` | `POST` | Rotates Access & Refresh JWTs | **Not in Spec** | Required by user request; validated against `sessions` table. |
| `/auth/logout` | `POST` | Revokes active user sessions | **Not in Spec** | Required by user request; invalidates token hashes. |

### Users Module
| Route | Method | Description | TRD Status | Note |
|---|---|---|---|---|
| `/users/me` | `GET` | Fetches active profile & contacts | In Spec | Combines `users`, `user_profiles`, and `emergency_contacts`. |
| `/users/me` | `PUT` | Updates profile & contacts | **Not in Spec** | Required by user request to provide full Profile CRUD. |
| `/users/me` | `DELETE` | Soft-deletes user profile | **Not in Spec** | Required by user request; updates `deleted_at` and revokes tokens. |

### Trips Module
| Route | Method | Description | TRD Status | Note |
|---|---|---|---|---|
| `/trips` | `POST` | Creates a travel matching request | In Spec | Asserts date sanity constraints and preferred size ranges. |
| `/trips` | `GET` | Lists user's open trip requests | **Not in Spec** | Required by user request to list trips. |
| `/trips/{trip_id}` | `PUT` | Updates open trip request details | **Not in Spec** | Required by user request to update trips. |
| `/trips/{trip_id}/close`| `POST` | Closes active trip request | **Not in Spec** | Required by user request; sets status to `'closed'`. |

---

## 🚀 PRD Roadmap Mapping & Scope Boundaries

Here is the status of current deliverables mapped against the overall roadmap:

### 🟩 Phase 1 (Foundation) — **BUILT & COMPLETED IN THIS RUN**
* Phone & Email OTP registration foundation.
* Combined user profile and emergency contacts CRUD.
* Soft delete logic (`deleted_at` timestamps on `users`).
* Verification status updates and mock OTP handling.
* Trip creation request CRUD (destination, dates overlap constraints, budget).
* Basic API rate limiting (100 req/min per IP, 1000 req/min per user) and logger middleware.
* Verbatim schema migrations successfully mapped to database with Prisma.

### 🟥 Phase 2-5 — **EXPLICITLY OUT OF SCOPE FOR THIS PHASE**
* **Matching Pipeline** (Phase 2): Graph matching, budget filters, compatibility graph building, and greedy packing. (Out of scope).
* **KYC/Social Integrations** (Phase 3): Aadhaar/DigiLocker integration via Setu/Surepass is documented/mocked only. Raw Aadhaar documents are never stored. **Known Limitation (Liveness)**: Active challenge-response liveness is implemented to reject static photos, but this MVP implementation does NOT reliably defeat recorded video replays. Full passive anti-spoofing is out of scope for Phase 1.
* **SOS, Live Location Sharing, and In-Trip Chat** (Phase 3/4): SOS mechanisms, location sharing privacy consent logs, and group chat channels are out of scope for this run.
* **Guide Marketplace and Payments** (Phase 4): Guide availability, Razorpay/commission payment flows, and bookings are deferred.
* **Admin Dashboard & Analytics** (Phase 5/6): Out of scope.
