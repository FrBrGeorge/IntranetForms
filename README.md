# Intranet Forms & Task Reporting System

A lightweight, self-hosted web application engineered for internal networks, team wikis, incident response logging, and task tracking. Built with a modern React 19 interface, an Express & TypeScript server, and a zero-dependency local JSON database, it provides seamless real-time autosaving, zero-loss response capture, and comprehensive administrative controls.

---

## Key Features

### 1. Auto-Saving & Frictionless Session Handling
- **Real-Time Input Auto-Save**: Fields save automatically on blur (`onBlur`), ensuring progress is never lost even if the browser closes or the network drops.
- **Anonymous Local Sessions**: Each user receives a unique, persistent session key stored in `localStorage` (`intranet_form_session_key`). No mandatory sign-up or corporate directory integration required for basic submissions.
- **Live Status Indicator**: Header displays real-time synchronization feedback (`All changes saved`, `Autosaving...`, or `Save error`).
- **Session ID Management**: Form users can inspect and copy their unique session key with one click, or reset their session to start a clean submission.

### 2. Flexible Administrative Access & Security
- **First-Come-First-Served Admin Claim**: When deployed for the first time, visiting the admin dashboard (`#admin`) allows the first user to immediately claim administrative rights without manual configuration.
- **Forceful Takeover via Passphrase**: Pre-configured environment secret (`ADMIN_PASSPHRASE`) allows system administrators to forcefully seize or recover administrative rights at any time directly from the UI or sidebar.
- **Token Rotation & Invalidation**: Admins can rotate their active session token at any time to invalidate old admin logins.

### 3. Dynamic Form Designer
- **Customizable Form Headers**: Update form title, descriptive guidance, and full name label in real time.
- **Modular Task Questions**: Add, reorder, edit, or remove task prompt cards.
- **Task Attributes**: Configure custom placeholders, help text, and mark individual questions as required or optional.

### 4. Response Management & Live Audit
- **Real-Time Submissions Table**: Inspect submitted responses sorted chronologically with live search filtering by respondent name or session key.
- **Detailed Modal Inspector**: View full submission answers, metadata timestamps (`createdAt`, `updatedAt`), and validity state.
- **Single Record Management**: Delete individual responses when completed or archived.

### 5. Session Moderation & Invalidation
- **Individual Session Invalidation**: Deactivate rogue or completed user session keys; subsequent autosaves or lookups from invalidated sessions receive a clear `403 Forbidden` notice.
- **Reactivation**: Reactivate previously invalidated sessions with a single click.
- **Emergency Invalidation**: Invalidate all current active user sessions in bulk during emergency re-scoping or form overhaul.

### 6. Data Export
- **CSV Export**: Spreadsheet-compatible download formatted according to RFC 4180 with escaped headers and answers.
- **JSON Export**: Complete structured JSON export including form schema definition, responses, and export metadata for downstream reporting or ETL pipelines.

### 7. Multi-Application Reverse Proxy Architecture
- **Configurable `BASE_PATH` & Relative Assets**: Supports hosting behind reverse proxies (Lighttpd, NGINX, Apache, Caddy) under subpaths such as `/form` (e.g. `https://intranet.company.com/form/`).
- **Dual Route Registration**: API routes are mounted simultaneously on both `${BASE_PATH}/api` and `/api`, guaranteeing compatibility whether the proxy rewrites or preserves subpath prefixes.
- **Dynamic Client Discovery & Fallback**: The client-side automatically discovers and falls back between proxy base paths to ensure zero connection failures.

### 8. Zero-Dependency File Database
- All form configurations, admin credentials, and submissions persist to a local file: `data/db.json`.
- Uses atomic file writes (writing to temporary `.tmp` files before renaming) to prevent corruption during unexpected shutdowns.
- No external relational database (MySQL, PostgreSQL) or NoSQL database (MongoDB, Redis) required.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend Framework** | React 19, TypeScript |
| **Styling & Icons** | Tailwind CSS v4, Lucide React |
| **Build & Bundler** | Vite 6, esbuild |
| **Backend Runtime** | Node.js (v18+ / v20 LTS / v22 LTS), Express 4, TypeScript |
| **Storage** | Local JSON flat-file database with atomic writes (`data/db.json`) |

---

## Application Views & Navigation

- **User Form View** (`/` or `/#form`): Clean, responsive task submission form featuring auto-saving inputs, required field validation, and session badge.
- **Admin Interface** (`/#admin`): Protected dashboard containing the form structure editor, live response tables, session status cards, export triggers, and emergency invalidation controls.
- **Responsive Navigation Sidebar**: Collapsible drawer on mobile and persistent sidebar on desktop, offering quick actions (one-click CSV download, session invalidation shortcut, and passphrase takeover).

---

## API Overview

All endpoints are accessible with or without the configured `BASE_PATH` prefix:

### Public & Form Endpoints
- `GET /api/config`: Returns reverse proxy base path and passphrase status.
- `GET /api/form`: Returns current form definition (title, description, tasks).
- `GET /api/response?sessionKey=<key>`: Retrieves existing draft or returns empty scaffold.
- `POST /api/response`: Autosaves full response or individual field update on blur.
- `DELETE /api/response?sessionKey=<key>`: Resets the caller's session draft.

### Administrative Endpoints
- `GET /api/admin/status`: Checks if an admin has claimed the system and verifies the current token.
- `POST /api/admin/claim-first`: First-come claim for unconfigured installations.
- `POST /api/admin/claim-force`: Seizes admin rights using `ADMIN_PASSPHRASE`.
- `POST /api/admin/regenerate-token`: Rotates the current admin session token (requires admin token).
- `GET /api/admin/responses`: Returns all submitted responses (requires admin token).
- `PUT /api/form`: Updates form title, description, and task items (requires admin token).
- `POST /api/admin/invalidate-user`: Marks a user session key as invalidated (requires admin token).
- `POST /api/admin/reactivate-user`: Reactivates an invalidated session key (requires admin token).
- `POST /api/admin/invalidate-all-users`: Invalidates all user sessions (requires admin token).
- `DELETE /api/admin/responses/:sessionKey`: Deletes a submission record (requires admin token).
- `GET /api/admin/export?format=csv|json`: Downloads complete responses file (requires admin token).

---

## Getting Started

For detailed installation, process management, and reverse proxy deployment instructions (including Lighttpd, NGINX, Apache, and Caddy), refer to [INSTALL.md](./INSTALL.md).
