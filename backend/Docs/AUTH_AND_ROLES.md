# DriveTrack Backend — Authentication & Roles

> Step 0 documentation (read-only). Source of truth:
> `src/middleware/auth.js`, `src/middleware/role.js`, `src/utils/jwt.js`,
> `src/routes/authRoutes.js`.

## 1. Transport: `Authorization: Bearer <token>`

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

- `authenticate` (run per-route or per-router) reads `req.headers.authorization`.
- Missing header, or a header not starting with `Bearer ` →
  `401 { "success": false, "message": "Authentication token missing", "errors": null }`
- Malformed/expired/invalid signature →
  `401 { "success": false, "message": "Invalid or expired token", "errors": null }`
- On success the decoded payload is attached to `req.user`.

### Token contents (`src/utils/jwt.js`)

```js
{ id, role: 'driver' | 'enforcer' | 'admin', mustChangePassword?: boolean }
```

- Secret: `JWT_SECRET` in `backend/.env` — must be **≥ 32 characters** and not the
  placeholder; `getSecret()` throws at request time otherwise.
- Expiry: `JWT_EXPIRES_IN` (default `8h`).
- Tokens are issued by the login/change-password endpoints
  (`src/controllers/authController.js`), not by any public route.

## 2. `mustChangePassword` gate (applies to **drivers only**)

Inside `authenticate`, after the token is verified:

```js
if (req.user.role === 'driver'
    && req.user.mustChangePassword === true
    && !(req.method === 'POST' && <url> ends with '/auth/driver/change-password')) {
  return fail(res, 'Password change required before continuing', 403);
}
```

Behavior:

| Situation | Result |
| --- | --- |
| Driver with `mustChangePassword: true` calls any route | `403 Password change required before continuing` |
| Same driver calls `POST /api/v1/auth/driver/change-password` | Allowed (the sole exception) |
| Driver with `mustChangePassword: false` / absent | Normal flow |
| `enforcer` / `admin` tokens | Gate never applies (`role !== 'driver'`) |

Changing the password issues a **fresh token** with `mustChangePassword: false`,
which the client must start using; the old token still carries the flag and is
still blocked. A driver record created without credentials (e.g. by an
enforcer during apprehension) is what sets the flag on first login/registration.

## 3. `allowRoles(...roles)` — role gate

Runs **after** `authenticate` (it reads `req.user`). Usage:

```js
router.post('/citations', authenticate, allowRoles('enforcer'), controller);
```

- `req.user` missing, or `req.user.role` not in the allowed list →
  `403 { "success": false, "message": "You are not authorized to perform this action", "errors": null }`
- The three roles are exactly: **`driver`**, **`enforcer`**, **`admin`**
  (no other values are ever signed into a token).

### Where the gate sits

| Placement | Example |
| --- | --- |
| Router-level (`router.use(...)`) | `citationRoutes`, `driverRoutes`, `enforcerRoutes`, `notificationRoutes`, `violationTypeRoutes`, `dashboardRoutes`, `chatbotRoutes` |
| Route-level (per handler) | `authRoutes` (`driver/change-password`), `citationRoutes` (`allowRoles` on each method), `notificationRoutes`, `violationTypeRoutes`, `auditLogRoutes`, `payments/citations/:id/checkout` |

## 4. Role matrix (summary)

| Area | driver | enforcer | admin |
| --- | :---: | :---: | :---: |
| `/auth/driver/*` (register, login, forgot-password) | ✔ public | — | — |
| `/auth/driver/change-password` | ✔ | — | — |
| `/auth/enforcer/login`, `/auth/admin/login` | — | ✔ public | ✔ public |
| `/citations` create, `/citations/mine` | — | ✔ | — |
| `/citations` list, verify, fine-amount, settle, remind, cancel, protest | — | — | ✔ |
| `/citations/driver/mine`, `/citations/:id` | ✔ | ✔ | ✔ |
| `/drivers` list/status/update/delete | — | — | ✔ |
| `/drivers/search`, `/drivers/:id`, `/drivers/:id/citations` | — | ✔ | ✔ |
| `/drivers` create | — | ✔ | ✔ |
| `/enforcers/*` | — | — | ✔ |
| `/violation-types` read | ✔ | ✔ | ✔ |
| `/violation-types` write | — | — | ✔ |
| `/notifications` (driver set) | ✔ | — | — |
| `/notifications/enforcer/*` | — | ✔ | — |
| `/notifications/broadcast(s)` | — | — | ✔ |
| `/chatbot/ask` | ✔ | — | — |
| `/chatbot/health` | ✔ | ✔ | ✔ |
| `/payments/citations/:id/checkout` | ✔ | — | — |
| `/payments/webhook`, `/payments/return` | ✔ public | ✔ public | ✔ public |
| `/dashboard/*` | — | — | ✔ |
| `/audit-logs` | — | — | ✔ |

## 5. Client checklist

1. Log in via the matching endpoint and keep `data.token`.
2. Send `Authorization: Bearer <token>` on every `/api/v1` call except the
   public auth routes, `/payments/webhook`, `/payments/return`, `/health`, and
   `/uploads/evidence/*`.
3. If a driver receives `403 Password change required before continuing`, send
   `POST /api/v1/auth/driver/change-password` with `newPassword` (≥ 8 chars)
   and swap in the newly issued token.
4. `401` ⇒ re-authenticate (token missing/invalid/expired);
   `403 You are not authorized...` ⇒ wrong role for that route.
