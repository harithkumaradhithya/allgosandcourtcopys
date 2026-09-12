# ALLGOSANDCOURTCOPYS

A Document Management System for a government/court office: securely store, organize and distribute
official documents — Government Orders, Court Orders, Circulars, Contracts, Acts & Rules — across
43 departments, for an internal user base of 100+ people.

**Full specification: [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)** — screens, schema,
API surface, phases, security and test strategy.

---

## What it does

Both Admins and Members self-register. **No account works until an Admin approves it** — that approval
is the only access gate in the system. Once approved, a user can view, download and upload documents in
**any** department. A member may delete a file they uploaded, but must give a reason. **Uploads and
deletions are both announced to everyone** — admins and members alike, except the person who did it;
a deletion carries the reason and the name of whoever gave it. **Anyone can also send a message to
the whole office** from the notifications screen; it is signed with their name and recorded.

**Phonebook:** numbers by department, and each taluk's tahsildars and group members. Everyone reads
it; administrators maintain it. Nobody in it needs an account — the numbers worth having are the
office down the road.

**Letters:** write from a template — the standing wording is filled in, your own details go into the
From block — then save it and print, or save as PDF from the browser's own dialogue. Administrators
maintain the templates; a letter belongs to whoever wrote it and nobody else can open it. The
subject and body can be **dictated** in Tamil or Indian English on Chrome and Edge; note that those
browsers recognise speech by sending the audio to the browser vendor, not on the machine.

**Adverts:** the office can carry a picture, an animated GIF or a short video in three places —
low on Home, under the department grid, and at the foot of the navigation rail. Administrators
configure everything: the media, the headline and caption on the card, the heading and text of the
popup that opens when it is pressed, an optional button to an external site, when it runs and in
what order. They are built to stay out of the way: nothing opens on its own, nothing ever makes a
sound, a reader can put one away for a fortnight, one advert shows at a time, each is labelled as an
advertisement, none of them prints, and with nothing configured the slots do not exist at all.

| | Member | Admin |
|---|---|---|
| View & download any department | ✅ | ✅ |
| Upload to any department | ✅ | ✅ |
| Delete own upload (reason required) | ✅ | ✅ |
| Delete anyone's file | — | ✅ |
| Approve/reject registrations | — | ✅ |
| Manage departments & folders | — | ✅ |
| Manage adverts | — | ✅ |
| Monitor all member activity, reports, audit logs | — | ✅ |

**Login:** mobile number is the identity and the password is the credential. Five wrong passwords lock
the account for fifteen minutes. The only OTP left in the system authorises a password reset;
registration and sign-in never ask for one.

## Stack

| Layer | Choice |
|---|---|
| Web app (both roles) | React 18 + TypeScript + Vite + Tailwind, responsive |
| Backend API | Java 21 + Spring Boot 3.3 |
| Database | PostgreSQL 16, Flyway migrations |
| File storage | S3-compatible — MinIO in dev, S3 or on-prem MinIO in prod |
| Auth | JWT (access + refresh) via Spring Security; password (BCrypt), with OTP over a pluggable SMS provider for registration and password reset |

There is no mobile app. `admin-web/` is a single responsive SPA that serves both roles.

## Layout

```
backend/            Spring Boot API
  src/main/java/com/allgos/dms/
    auth/ user/ department/ folder/ file/ letter/ phonebook/ ad/ notification/ audit/ report/ common/
    (each with controller / service / repository / entity / dto)
  src/main/resources/db/migration/   Flyway: schema + 43-department seed + first admin
admin-web/          React SPA (Admin + Member)
  src/app/          router
  src/features/     one folder per feature area
  src/lib/          api client
docs/               plan, wireframes, department list, branding
docker-compose.yml  Postgres + MinIO for local development
```

## Getting started

Prerequisites: **JDK 21**, **Maven 3.9+**, **Node 22.12+**, **Docker**.

```bash
cp .env.example .env

# 1. infrastructure
docker compose up -d               # Postgres :5433, MinIO :9000 (console :9002)

# 2. backend — Flyway applies the schema and seeds 43 departments + the first admin
cd backend && ./mvnw spring-boot:run    # http://localhost:8080

# 3. web app
cd admin-web && npm install && npm run dev   # http://localhost:5173
```

Use `./mvnw` rather than a system `mvn`: the wrapper pins the Maven version, so local builds and CI
match. Note the two deliberate port choices — the database is published on **5433** so it coexists with
a PostgreSQL installed directly on the machine, and the MinIO console on **9002** because Windows
frequently reserves 9001.

In development `OTP_PROVIDER=mock`, so registration and password-reset codes are printed to the backend
log instead of being sent over SMS — no gateway account needed to work on the app.

**Signing in the first time:** the seeded admin is **9999999999 / `Admin@12345`**. The migration seeds
that account with *no* password — in a real deployment the operator claims it through Forgot password —
so `DevAdminPasswordSeeder` sets one on start-up, and only on a machine still running every shipped
default. Override with `SEED_ADMIN_PASSWORD`, or blank it to turn the whole thing off. Members sign in
with the password they chose at registration, once an admin has approved them.

### Checks

```bash
cd backend   && ./mvnw verify     # unit + Testcontainers integration tests (needs Docker running)
cd admin-web && npm run lint && npm run typecheck && npm test && npm run build
cd admin-web && npm run e2e       # Playwright end-to-end; starts the dev server itself
```

### End-to-end tests and the Playwright MCP

`npm install` in `admin-web` also downloads the Chromium builds Playwright needs, via a `postinstall`
hook — packages alone are not enough, and without the browsers `npm run e2e` fails with "Executable
doesn't exist". Two builds are fetched because the test runner and the MCP server track different
Playwright releases. They are cached per-revision outside the repo, so this costs a one-off ~230 MB on
a new machine and nothing afterwards.

The hook never fails the install. If you were offline or behind a proxy, run it again yourself:

```bash
cd admin-web && npm run e2e:install
```

Set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` to opt out entirely (CI images that bake the browsers in).

[.mcp.json](.mcp.json) registers the Playwright MCP server, letting Claude Code drive a real browser
against the running app. It points at the copy in `admin-web/node_modules`, so the server and its
browser can never drift apart. Claude Code reads this file at start-up and asks once for approval —
restart it after pulling, then confirm with `/mcp`.

## Status

Scaffold in place: project structure, database schema and seeds, configuration, local infrastructure,
CI. Feature work follows the phases in
[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) — registration and approval first.
