# Frontend Repo — Task 7 Integration Instructions (Authorization)

This file describes the changes required in the **Frontend repository** to support Basic Authorization with the Import Service API.

---

## Context

The backend `/import` endpoint on the Import Service API Gateway is now protected by a Lambda Token Authorizer. Every request to `/import` must include an `Authorization: Basic <token>` header.

- **401 Unauthorized** — Authorization header is missing.
- **403 Forbidden** — Credentials are invalid (wrong username or password).

---

## Required Changes in the FE Repo

### 1. Store the authorization token in `localStorage` (one-time setup)

Before users can upload CSV files, they need a valid token stored in the browser. For testing purposes, open the browser DevTools console and run:

```javascript
// Replace "your_github_login" with your actual GitHub username
const token = btoa('your_github_login:TEST_PASSWORD');
localStorage.setItem('authorization_token', token);
```

> The token is the base64-encoded string of `your_github_login:TEST_PASSWORD`.

---

### 2. Add the `Authorization` header to the import request

Locate the API call that requests a signed S3 upload URL from the Import Service. It is typically in:

```
src/pages/admin/PageProductImport/components/csv/CSVFileUpload.tsx
```

or wherever the `GET /import?name=<filename>` request is made (e.g. inside a React Query `queryFn` or an axios call).

**Before:**

```typescript
const response = await axios.get(`${IMPORT_SERVICE_URL}/import`, {
  params: { name: file.name },
});
```

**After:**

```typescript
const authorizationToken = localStorage.getItem('authorization_token');

const response = await axios.get(`${IMPORT_SERVICE_URL}/import`, {
  params: { name: file.name },
  headers: authorizationToken
    ? { Authorization: `Basic ${authorizationToken}` }
    : {},
});
```

> If there is no `axios` call directly but the app uses a `queryClient` / React Query setup, apply the header addition inside the relevant `queryFn` or API client factory.

---

### 3. (Optional / +30 pts) Display alerts for 401 and 403 responses

Per the task bonus criteria, the app should show user-visible alerts when authorization fails.

Locate `nodejs-aws-fe-main/src/index.tsx` and add a global Axios response interceptor:

```typescript
import axios from 'axios';

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      alert('You are not authorized. Please set a valid authorization_token in localStorage.');
    } else if (error.response?.status === 403) {
      alert('Access denied. Your authorization_token is invalid or does not match credentials.');
    }
    return Promise.reject(error);
  },
);
```

> Place this interceptor registration at the top of `src/index.tsx`, before the React DOM render call, so it covers all requests.

---

## How the Token Is Validated

The `basicAuthorizer` Lambda:

1. Reads the `Authorization` header value (e.g. `Basic dXNlcjpURVNUX1BBU1NXT1JE`).
2. Decodes the base64 payload to `username:password`.
3. Looks up `process.env[username]` in the Lambda environment (populated from `.env` in the Authorization Service).
4. Returns **Allow** IAM policy if credentials match → API Gateway forwards the request.
5. Returns **Deny** IAM policy if credentials don't match → API Gateway responds with `403`.
6. Throws `Unauthorized` if header is missing → API Gateway responds with `401`.

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/pages/admin/PageProductImport/components/csv/CSVFileUpload.tsx` (or equivalent) | Add `Authorization: Basic <token>` header to the `/import` GET request |
| `src/index.tsx` *(optional)* | Add Axios interceptor to display alerts for 401 / 403 responses |
| Browser DevTools console (one-time) | Store `authorization_token` in `localStorage` |

---

## Branching

- Create a branch `task-7` in the FE repo.
- Commit the Authorization header changes (and optional alert interceptor).
- Open a PR from `task-7` → `master`.
- Include the PR link in the BE repo PR description for Task 7.
