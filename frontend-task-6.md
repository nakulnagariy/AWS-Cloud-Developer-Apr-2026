# Frontend Repo — Task 6 Integration Instructions

This file describes the frontend context and verification steps for Task 6 (SQS & SNS Async Microservices Communication).

---

## What Changed in the Backend

Task 6 is **purely a backend async pipeline**. No frontend code changes are required.

The new data flow after this task:

```
User uploads CSV
    ↓
FE → PUT presigned S3 URL  (unchanged, wired in Task 5)
    ↓
S3 triggers importFileParser Lambda  (unchanged trigger)
    ↓
importFileParser parses CSV rows and sends each row → SQS catalogItemsQueue  (NEW)
    ↓
SQS triggers catalogBatchProcess Lambda (5 messages at a time)  (NEW)
    ↓
catalogBatchProcess writes products to DynamoDB  (NEW)
    ↓
SNS createProductTopic sends email notification  (NEW)
```

The FE's upload button and progress behaviour are identical to Task 5.

---

## No Code Changes Required in FE Repo

The FE repo should already be on branch `task-5` (or merged to `master`) with:
- The `IMPORT_SERVICE_URL` pointing to the Import Service API Gateway URL
- The CSV upload flow using a presigned PUT URL from `GET /import?name=...`

**Nothing needs to change for Task 6.**

---

## End-to-End Verification (Manual)

Follow these steps to confirm the full async pipeline works after deploying both CDK stacks:

### 1. Confirm email subscription

After deploying the Product Service stack, AWS sends a confirmation email to the address configured in the SNS subscription. You must click **"Confirm subscription"** in that email before any notifications will arrive.

### 2. Upload a CSV via the FE

1. Open the frontend app in the browser.
2. Navigate to the **Import** page.
3. Click **"Upload CSV"** and select a CSV file (e.g. `sample-product.csv` from `import-service/`).
4. The FE requests a presigned URL from `GET /import?name=<filename>`, then PUTs the file to S3.
5. The upload should complete with a `200 OK` from S3.

### 3. Check DynamoDB (wait ~30 seconds)

1. Open the [AWS DynamoDB Console](https://console.aws.amazon.com/dynamodb) → `products` table.
2. Click **"Explore table items"**.
3. New product rows should appear corresponding to the CSV rows you uploaded.
4. Also verify the `stocks` table has matching `product_id` entries.

### 4. Check the Product List in the FE

1. Navigate to the **Product List** page in the FE app.
2. Products uploaded via CSV should now appear in the list (fetched via `GET /products`).

### 5. Check your email inbox

You should receive an SNS email notification with a summary of the products that were created in that batch. Subject will be something like `AWS Notification Message` from `createProductTopic`.

---

## Sample CSV Format

The CSV must match the product schema expected by `catalogBatchProcess`:

```csv
title,description,price,count
Laptop,High performance laptop,1200,10
Mouse,Wireless mouse,25,50
Keyboard,Mechanical keyboard,75,30
```

| Field | Type | Rules |
|---|---|---|
| `title` | string | required, non-empty |
| `description` | string | required, non-empty |
| `price` | number | required, positive (> 0) |
| `count` | integer | required, non-negative (≥ 0) |

---

## API Endpoints (Unchanged from Task 5)

| Service | Endpoint | Method | Description |
|---|---|---|---|
| Import Service | `GET /import?name=<filename>` | GET | Returns presigned S3 URL for upload |
| Product Service | `GET /products` | GET | Returns all products |
| Product Service | `GET /products/{id}` | GET | Returns product by ID |

> The Import Service API Gateway URL can be found in the AWS CloudFormation outputs for `ImportServiceStack`.

---

## Branch & PR for FE Repo

Since no code changes are needed for Task 6, you have two options:

**Option A (Preferred):** Use the same FE branch/PR from Task 5. Just update the PR description to note that Task 6 is backend-only.

**Option B:** Create a `task-6` branch in the FE repo, add a comment in `apiPaths.ts` noting the async pipeline, and open a trivial PR to satisfy the submission requirement.

---

## PR Description Template (BE Repo)

When submitting the Task 6 PR, include:

```
## What was done
- Created SQS queue `catalogItemsQueue` in Product Service CDK stack
- Created `catalogBatchProcess` Lambda triggered by SQS (batchSize: 5)
- Updated `importFileParser` to send each CSV record to SQS (instead of logging)
- Created SNS topic `createProductTopic` with email subscription
- `catalogBatchProcess` publishes to SNS after writing products to DynamoDB
- Added unit tests for `catalogBatchProcess`
- Optional: SNS filter policy — second subscription for products with price >= 100

## API Endpoints
- Import Service: <IMPORT_SERVICE_URL>
- Product Service: <PRODUCT_SERVICE_URL>

## FE PR
- <link to FE repo PR>
```
