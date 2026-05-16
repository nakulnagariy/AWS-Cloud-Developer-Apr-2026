# Frontend Repo — Task 3 Integration Instructions

This file describes the changes required in the **Frontend repository** to integrate it with the Product Service API built in Task 3.

---

## Context

The backend now exposes a REST API via AWS API Gateway:

| Endpoint                        | Method | Description              |
|---------------------------------|--------|--------------------------|
| `https://2hy6bydj7k.execute-api.ap-south-1.amazonaws.com/prod/products`             | GET    | Returns all products     |
| `https://2hy6bydj7k.execute-api.ap-south-1.amazonaws.com/prod/products/{productId}` | GET    | Returns product by ID    |

---

## Required Changes in the FE Repo

### 1. Update the API base URL

Locate the file where the API base URL is configured. In `nodejs-aws-shop-react` this is typically:

```
src/constants/apiPaths.ts
```

or an `.env` / environment config file.

Update it to point to the deployed API Gateway URL:

```typescript
// Before (mock/bff URL)
export const PRODUCT_SERVICE_URL = 'https://old-url-or-mock';

// After (API Gateway URL from CDK deploy output)
export const PRODUCT_SERVICE_URL = 'https://2hy6bydj7k.execute-api.ap-south-1.amazonaws.com/prod';
```

### 2. Update the products fetch call (if needed)

In the task 10 (BFF) version of the app, two lines need to be changed to use the Product Service directly. Look for any calls that use a BFF/cart URL and point them to the Product Service URL instead.

Per the task instructions example:
> You have to change 2 lines in the frontend application to use the Product Service URL.

These are typically in the API client or axios instance configuration.

### 3. Verify CORS

The Product Service Lambda functions return the following CORS header:

```
Access-Control-Allow-Origin: *
```

No CORS proxy is needed.

---

## How to Test Integration Locally

1. Start the FE dev server:
   ```bash
   npm run start
   ```
2. Open the Product List Page (PLP) in the browser.
3. Products fetched from the API Gateway should appear in the list.
4. Open DevTools → Network tab to confirm requests go to the API Gateway URL and return `200 OK`.

---

## Branching

- Create a branch `task-3` in the FE repo
- Commit the URL change(s)
- Open a PR from `task-3` → `master`
- Include the PR link in the BE repo PR description

---

## Checklist

- [ ] `PRODUCT_SERVICE_URL` updated to API Gateway endpoint
- [ ] FE app loads and displays products from the backend
- [ ] No CORS errors in browser console
- [ ] Branch `task-3` created and PR opened in FE repo
- [ ] FE PR link included in BE PR description
