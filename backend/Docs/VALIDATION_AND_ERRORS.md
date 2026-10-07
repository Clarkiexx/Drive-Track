# DriveTrack Backend — Response Envelopes, Validation & Error Handling

> Step 0 documentation (read-only). Source of truth:
> `src/utils/response.js`, `src/middleware/errorHandler.js`, `src/app.js`,
> and the `handleValidation(...)` helper pattern in `src/controllers/*`.

## 1. The two envelopes

Both helpers live in `src/utils/response.js` and are the **only** way the API
writes JSON responses (the 404 fallback in `src/app.js` mirrors the fail shape).

### Success

```js
success(res, data, message = 'Success', statusCode = 200)
```

```json
{
  "success": true,
  "message": "Driver created",
  "data": { "driverId": 12 }
}
```

- `200` default; creations explicitly return `201`
  (e.g. `/auth/driver/register`, `POST /citations`, `POST /drivers`,
  `POST /violation-types`, `POST /notifications/broadcast`).

### Fail

```js
fail(res, message = 'Something went wrong', statusCode = 400, errors = null)
```

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [ { "type": "field", "value": "", "msg": "First name is required", "path": "firstName", "location": "body" } ]
}
```

- `errors` is `null` unless a caller passes one — clients must treat
  `errors === null` as "no field-level detail".
- Clients branch on the boolean `success`, never on `message` text.

## 2. Request validation (express-validator)

Routes declare `body(...)` chains; controllers call the shared pattern:

```js
const errors = validationResult(req);
if (!errors.isEmpty()) {
  fail(res, 'Validation failed', 422, errors.array());  // returns false → handler stops
}
```

| Aspect | Behavior |
| --- | --- |
| Status | `422` |
| `message` | always `"Validation failed"` |
| `errors` | `validationResult().array()` — per-item `{ type, value, msg, path, location }` |
| Used by | auth, citation, driver, enforcer, notification, violation-type controllers |

Representative rules: `firstName/lastName/licenseNumber` required,
`newPassword` ≥ 8 chars, `defaultPenalty` ≥ 0 and `category ∈ {moving, non_moving}`,
citation `latitude ∈ [-90, 90]` / `longitude ∈ [-180, 180]`,
broadcast `recipientType` enum + `message` 1–500 chars.

Validation runs **inside the controller** (after `authenticate`, role checks,
and multer), so an unauthorized or unauthenticated caller gets `401`/`403`
before any field errors are reported.

## 3. The `errorHandler` map (`src/middleware/errorHandler.js`)

Terminal Express error middleware (`app.use(errorHandler)` in `src/app.js`).
It first logs the error server-side (`console.error`), then maps:

| Condition | Status | `message` | `errors` |
| --- | --- | --- | --- |
| `err.name === 'SequelizeUniqueConstraintError'` | 409 | `A record with this value already exists` | array of DB messages |
| `err.name === 'SequelizeValidationError'` | 422 | `Validation failed` | array of DB messages |
| `err.name === 'MulterError'` && `code === 'LIMIT_FILE_SIZE'` | 413 | `Uploaded file is too large. Maximum is 8MB per photo.` | `null` |
| `MulterError` && `LIMIT_FILE_COUNT` / `LIMIT_UNEXPECTED_FILE` | 422 | `Too many files. Up to 5 evidence photos are allowed.` | `null` |
| other `MulterError` | 422 | `File upload failed` | `null` |
| `err.message === 'Only JPEG, PNG, or WEBP images are allowed'` | 422 | same text | `null` |
| `err.statusCode \|\| err.status` **≥ 500** | 500 | `Internal server error` | `null` |
| any other error | `err.statusCode \|\| err.status` (else 500 → above) | `Request failed` | `null` |

Anti-leak rule: **5xx never surfaces raw details** (SQL text, stack traces,
driver messages) — they are logged server-side only and replaced with
`Internal server error`. Known `fail()` responses already carry safe messages
and pass through untouched.

Upload limits enforced by the multer middlewares feeding this map
(`src/middleware/upload.js`, `src/middleware/uploadLicense.js`):
**8 MB per file**, evidence **≤ 5 photos**, license photo **1 file**;
allowed MIME types JPEG/PNG/WEBP.

### Route-not-found (before the error handler)

```json
{ "success": false, "message": "Route not found" }
```

Status `404`. Note this fallback omits the `errors` key entirely — clients
should read `message` defensively.

## 4. Frequently produced status codes

| Status | Typical `message` | Produced by |
| --- | --- | --- |
| 401 | `Invalid credentials` | login controllers |
| 401 | `Authentication token missing` / `Invalid or expired token` | `auth.js` |
| 403 | `You are not authorized to perform this action` | `role.js` |
| 403 | `Password change required before continuing` | `auth.js` |
| 403 | `This account has been suspended. / revoked. / archived.` | controllers (account status) |
| 404 | `Citation not found`, `Driver not found`, `Enforcer not found`, `Violation type not found`, `Notification not found` | controllers |
| 409 | `A record with this value already exists` | `errorHandler` (unique constraint) |
| 409 | `This citation is already settled / already cancelled` etc. | controllers (state conflicts) |
| 422 | `Validation failed` (+ `errors` array) | express-validator / `errorHandler` |
| 413 | `Uploaded file is too large...` | `errorHandler` (multer) |
| 500 | `Internal server error` | `errorHandler` (≥ 500 branch) |
| 502 | `Unable to verify payment` / `Unable to start the payment session...` | payment controller (upstream Xendit) |
