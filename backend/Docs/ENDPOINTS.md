# DriveTrack Backend — API Endpoints

> Step 0 documentation (read-only). Every path below is the **real local path**
> served by the running backend: base URL `http://localhost:5000`
> (`PORT` from `backend/.env`, default `5000`) + the `/api/v1` mount in
> `src/app.js`. Source of truth is `src/routes/index.js` and the router files
> listed per section.

**Legend — Auth column**

| Value | Meaning |
| --- | --- |
| Public | No `Authorization` header required |
| Bearer | `Authorization: Bearer <JWT>` required (`src/middleware/auth.js`) |
| Bearer + role(s) | JWT required **and** `allowRoles(...)` check (`src/middleware/role.js`) |

---

## Auth — `src/routes/authRoutes.js`

| Method | Path | Auth | Roles | Notes |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/auth/driver/register` | Public | — | multipart field `licensePhoto` (optional) |
| POST | `/api/v1/auth/driver/login` | Public | — | `fullName` + `password` |
| POST | `/api/v1/auth/driver/change-password` | Bearer | driver | Only route reachable while `mustChangePassword` is true |
| POST | `/api/v1/auth/driver/forgot-password` | Public | — | `fullName` + `licenseNumber` |
| POST | `/api/v1/auth/enforcer/login` | Public | — | `username` + `password` |
| POST | `/api/v1/auth/admin/login` | Public | — | `username` + `password` |

## Citations — `src/routes/citationRoutes.js` (router-level `authenticate`)

| Method | Path | Auth | Roles | Notes |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/citations` | Bearer + role | enforcer | multipart `photos` (up to 5) |
| GET | `/api/v1/citations/mine` | Bearer + role | enforcer | String route declared before `/:id` |
| GET | `/api/v1/citations/driver/mine` | Bearer + role | driver | Driver-facing violation list |
| GET | `/api/v1/citations` | Bearer + role | admin | Violation Monitoring list |
| PATCH | `/api/v1/citations/:id/verify` | Bearer + role | admin | |
| PATCH | `/api/v1/citations/:id/fine-amount` | Bearer + role | admin | |
| PATCH | `/api/v1/citations/:id/settle` | Bearer + role | admin | |
| PATCH | `/api/v1/citations/:id/remind` | Bearer + role | admin | |
| PATCH | `/api/v1/citations/:id/cancel` | Bearer + role | admin | |
| PATCH | `/api/v1/citations/:id/protest` | Bearer + role | admin | |
| GET | `/api/v1/citations/:id` | Bearer + role | driver, enforcer, admin | Catch-all `/:id` — must stay last |

## Drivers — `src/routes/driverRoutes.js` (router-level `authenticate`)

| Method | Path | Auth | Roles | Notes |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/drivers` | Bearer + role | admin | Paginated Driver Management list |
| GET | `/api/v1/drivers/search` | Bearer + role | enforcer, admin | Enforcer Driver Search |
| GET | `/api/v1/drivers/:id` | Bearer + role | admin, enforcer | |
| GET | `/api/v1/drivers/:id/citations` | Bearer + role | admin, enforcer | |
| POST | `/api/v1/drivers` | Bearer + role | admin, enforcer | multipart `licensePhoto` (optional) |
| PATCH | `/api/v1/drivers/:id` | Bearer + role | admin | |
| PATCH | `/api/v1/drivers/:id/status` | Bearer + role | admin | |
| DELETE | `/api/v1/drivers/:id` | Bearer + role | admin | |

## Enforcers — `src/routes/enforcerRoutes.js` (router-level `authenticate` + `allowRoles('admin')`)

| Method | Path | Auth | Roles |
| --- | --- | --- | --- |
| GET | `/api/v1/enforcers` | Bearer + role | admin |
| GET | `/api/v1/enforcers/:id` | Bearer + role | admin |
| POST | `/api/v1/enforcers` | Bearer + role | admin |
| PATCH | `/api/v1/enforcers/:id` | Bearer + role | admin |
| PATCH | `/api/v1/enforcers/:id/status` | Bearer + role | admin |
| PATCH | `/api/v1/enforcers/:id/reset-password` | Bearer + role | admin |
| DELETE | `/api/v1/enforcers/:id` | Bearer + role | admin |

## Violation types — `src/routes/violationTypeRoutes.js` (router-level `authenticate`)

| Method | Path | Auth | Roles | Notes |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/violation-types` | Bearer | driver, enforcer, admin | Read allowed for any logged-in role |
| POST | `/api/v1/violation-types` | Bearer + role | admin | |
| PATCH | `/api/v1/violation-types/:id` | Bearer + role | admin | Partial update — all fields optional |
| PATCH | `/api/v1/violation-types/:id/status` | Bearer + role | admin | |

## Notifications — `src/routes/notificationRoutes.js` (router-level `authenticate`)

| Method | Path | Auth | Roles |
| --- | --- | --- | --- |
| GET | `/api/v1/notifications/mine` | Bearer + role | driver |
| PATCH | `/api/v1/notifications/mark-all-read` | Bearer + role | driver |
| PATCH | `/api/v1/notifications/:id/read` | Bearer + role | driver |
| GET | `/api/v1/notifications/enforcer/mine` | Bearer + role | enforcer |
| PATCH | `/api/v1/notifications/enforcer/mark-all-read` | Bearer + role | enforcer |
| PATCH | `/api/v1/notifications/enforcer/:id/read` | Bearer + role | enforcer |
| POST | `/api/v1/notifications/broadcast` | Bearer + role | admin |
| GET | `/api/v1/notifications/broadcasts` | Bearer + role | admin |

## Chatbot — `src/routes/chatbotRoutes.js`

| Method | Path | Auth | Roles | Notes |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/chatbot/health` | Bearer | driver, enforcer, admin | Returns `{ success: true, data: { ok: true } }` |
| POST | `/api/v1/chatbot/ask` | Bearer + role | driver | |

## Payments — `src/routes/paymentRoutes.js`

| Method | Path | Auth | Roles | Notes |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/payments/webhook` | Public | — | Xendit callback, authorized by `x-callback-token`, never by JWT |
| GET | `/api/v1/payments/return` | Public | — | Browser return page; settles nothing |
| POST | `/api/v1/payments/citations/:id/checkout` | Bearer + role | driver | |

## Dashboard — `src/routes/dashboardRoutes.js` (router-level `authenticate` + `allowRoles('admin')`)

| Method | Path | Auth | Roles |
| --- | --- | --- | --- |
| GET | `/api/v1/dashboard/summary` | Bearer + role | admin |
| GET | `/api/v1/dashboard/trend` | Bearer + role | admin |
| GET | `/api/v1/dashboard/recent-activity` | Bearer + role | admin |

## Audit logs — `src/routes/auditLogRoutes.js`

| Method | Path | Auth | Roles |
| --- | --- | --- | --- |
| GET | `/api/v1/audit-logs` | Bearer + role | admin |

## Outside `/api/v1` — `src/app.js`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/health` | Public | Liveness probe: `{ status: 'ok' }` |
| GET | `/uploads/evidence/<file>` | Public | Static evidence photos |
| GET | `/uploads/licenses/<file>` | Bearer + role (admin) | Static license photos |
| * | anything unmatched | — | 404: `{ success: false, message: 'Route not found' }` |
