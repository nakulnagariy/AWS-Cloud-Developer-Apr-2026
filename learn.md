# AWS Cloud Developer — Key Learnings & Interview Prep

## Infrastructure as Code (IaC)
- **AWS CDK** lets you define cloud resources in TypeScript instead of clicking in the AWS Console
- CDK compiles down to **CloudFormation templates** (`cdk synth`)
- The deploy lifecycle: `synth` → `diff` → `deploy`

---

## Serverless Architecture
- **Lambda** — stateless functions that run on demand, no server to manage
- **API Gateway** — the front door that routes HTTP requests to your Lambda functions
- You never think about servers, scaling, or OS — AWS handles it

---

## How They Connect
```
Browser → API Gateway → Lambda → returns JSON response
```
- `LambdaIntegration` is the glue between API Gateway and Lambda in CDK
- `NodejsFunction` vs `Function` — the difference between bundled TypeScript and raw JS

---

## TypeScript in AWS Context
- Lambda can't run `.ts` directly — **esbuild bundles it to `.js`** at deploy time
- `@types/aws-lambda` gives you typed `APIGatewayProxyEvent` and `APIGatewayProxyResult`
- `__dirname` is a CommonJS global — no import needed

---

## CDK Project Structure
- `bin/` — entry point, where the app and env config live
- `lib/` — the actual stack definition (resources)
- `lambda/` — your business logic, separate from infrastructure
- Keeping infra and logic **separate** is intentional good practice

---

## AWS Setup Essentials
- **Bootstrap** (`cdk bootstrap`) — one-time setup per account/region, creates an S3 bucket CDK uses internally
- **Credentials** flow: `aws configure` → `~/.aws/config` → `CDK_DEFAULT_REGION/ACCOUNT`
- **Environment-agnostic vs environment-specific** stacks

---

## API Design Basics
- REST conventions: `GET /products` (list) vs `GET /products/{id}` (single item)
- Always return consistent HTTP status codes: `200`, `400`, `404`, `500`
- CORS headers are required for browser-based frontends to call your API

---

## S3 & Import Service (Task 5)
- **Pre-signed URLs** let clients upload directly to S3 — Lambda never proxies the file bytes
- `getSignedUrl(client, new PutObjectCommand({…}), { expiresIn: 300 })` from `@aws-sdk/s3-request-presigner`
- S3 event notifications (`s3:ObjectCreated:*`) trigger Lambda automatically when a file lands in a prefix
- Use `S3EventSource` from `aws-cdk-lib/aws-lambda-event-sources` — CDK wires the bucket notification for you
- Stream large files through `csv-parser` instead of loading them into memory
- Move pattern: `CopyObject` to `parsed/` → `DeleteObject` from `uploaded/` (no native S3 "move")
- `Bucket.fromBucketName()` = reference to existing bucket (CDK won't create/delete it)
- `bucket.grantPut(lambda)` vs `bucket.grantReadWrite(lambda)` — always use least privilege

---

---

# 🎤 Interview Questions

## Standard / Conceptual Questions

1. **What is the difference between synchronous and event-driven Lambda invocations?**
   - Sync: API Gateway calls Lambda and waits for a response.
   - Async/event-driven: S3, SNS, SQS trigger Lambda and don't wait — retries handled by the service.

2. **What is a pre-signed URL and why use it instead of uploading through Lambda?**
   - A pre-signed URL is a temporary URL with embedded credentials that lets a client PUT/GET to S3 directly.
   - Avoids 6 MB Lambda payload limit, reduces latency, cheaper (no compute for file bytes).

3. **Explain the principle of least privilege in AWS IAM.**
   - Grant only the permissions needed for the task. E.g., `importProductsFile` gets only `s3:PutObject` on the `uploaded/` prefix — not full bucket access.

4. **What is the difference between `aws-cdk-lib` and the AWS Console for resource management?**
   - CDK = declarative, version-controlled, reproducible. Console = manual, error-prone, not auditable.

5. **What are CloudWatch Logs and how does Lambda use them?**
   - Every `console.log` in a Lambda handler is automatically sent to CloudWatch Logs under `/aws/lambda/<function-name>`. Essential for debugging in production.

6. **What is CORS and why do Lambda responses need to include CORS headers?**
   - Cross-Origin Resource Sharing — browsers block requests to different origins by default.
   - Lambda must return `Access-Control-Allow-Origin: *` (or specific origin) in every response header.

7. **What's the difference between `NodejsFunction` and `Function` in CDK?**
   - `NodejsFunction` automatically bundles TypeScript/JavaScript with esbuild at deploy time.
   - `Function` expects pre-compiled code in a `.zip` or asset directory.

8. **How does DynamoDB differ from a traditional relational database?**
   - NoSQL key-value/document store. No joins, no fixed schema. Single-digit millisecond latency at any scale. You design access patterns first, schema second.

9. **What is `cdk bootstrap` and when do you need to run it?**
   - One-time setup per AWS account/region. Creates an S3 bucket and ECR repo CDK uses internally for assets. Required before first `cdk deploy`.

10. **What is the difference between `fromTableName()` and `new dynamodb.Table()` in CDK?**
    - `fromTableName()` = reference to an existing table (CDK won't manage its lifecycle).
    - `new Table()` = CDK owns the table — it will be created on deploy and deleted on destroy.

---

## 🔥 Tricky / Gotcha Questions

1. **Why does `getSignedUrl` not actually call S3 — and what does that mean for permissions?**
   - It only generates a signed URL client-side. The Lambda needs `s3:PutObject` permission so that the *credential embedded in the URL* is valid — not because Lambda itself uploads anything.

2. **S3 event triggers Lambda, but the Lambda errors every time. The bucket and Lambda are in different regions. What's wrong?**
   - S3 event notifications require the Lambda to be **in the same region** as the bucket. Cross-region triggers are not supported natively.

3. **Your `importFileParser` Lambda logs nothing even though files are being uploaded. What do you check?**
   - Verify the `S3EventSource` has the correct prefix filter (`uploaded/`).
   - Confirm the bucket notification is actually created (check S3 → Properties → Event notifications).
   - Check Lambda execution role has `s3:GetObject` permission.
   - Check CloudWatch log group exists (Lambda may be failing silently on cold start).

4. **Why does the pre-signed URL return `403 Forbidden` when the frontend tries to upload?**
   - Common causes: URL has expired (default 15 min, set `expiresIn` explicitly), bucket has Block Public Access blocking pre-signed URLs (requires bucket policy adjustment), or the Lambda's IAM role lacked `s3:PutObject` when the URL was generated.

5. **You call `csv-parser` on a stream but get zero records. What could be wrong?**
   - The S3 `GetObject` Body is a `SdkStream` — you must convert it (e.g., `.transformToWebStream()` or `Readable.from(body)`). Passing the raw Body directly to csv-parser without proper piping silently produces nothing.

6. **CDK `cdk deploy` succeeds but the Lambda can't read from the S3 bucket. Why?**
   - If the bucket was created outside CDK (`fromBucketName`), CDK can add an IAM policy to the Lambda's role, but it **cannot add a resource-based policy to the bucket**. You may need to manually add a bucket policy in the console allowing the Lambda's role ARN.

7. **What's the difference between `grantRead`, `grantPut`, and `grantReadWrite` on an S3 bucket in CDK?**
   - `grantRead` = `s3:GetObject` + `s3:ListBucket`
   - `grantPut` = `s3:PutObject`
   - `grantReadWrite` = all of the above + `s3:DeleteObject` — use for the parser that needs to copy and delete.

8. **Your Lambda timeout is 3 seconds (default). A large CSV upload takes 10 seconds to parse. What happens?**
   - Lambda times out and throws a `Task timed out` error. Increase timeout in CDK: `timeout: cdk.Duration.seconds(30)`.

9. **You added `csv-parser` to `dependencies` but the Lambda throws `Cannot find module 'csv-parser'`. What's wrong?**
   - `NodejsFunction` bundles the code with esbuild. Check `nodeModules` or `bundling.externalModules` config — if `csv-parser` is externalized, it must be available in the Lambda layer or removed from externals.

10. **Two developers deploy the same CDK stack name in the same account/region. What happens?**
    - CDK/CloudFormation will treat it as an **update** to the existing stack — it does a diff and applies changes. It will NOT create a second stack. This is intentional (idempotent deploys).

---

## 🌍 Real-World Scenario Questions

1. **You're uploading 50,000 product CSVs per day, each 5 MB. How would you design the pipeline?**
   - Frontend gets pre-signed URL → uploads to S3 `uploaded/`.
   - S3 event triggers Lambda (for small files) or SQS + Lambda consumer (for batch/high volume).
   - Lambda parses CSV, writes to DynamoDB in batch (`BatchWriteItem`).
   - Move parsed files to `parsed/` folder for auditability.
   - Use S3 Lifecycle rules to expire `parsed/` files after 30 days.

2. **A client reports that file uploads sometimes fail silently — no error, no data in DB. How do you debug?**
   - Check pre-signed URL expiry (client may be reusing a cached URL).
   - Check CloudWatch for Lambda invocation errors on `importFileParser`.
   - Check S3 server access logs or CloudTrail for the PUT request.
   - Add a Dead Letter Queue (DLQ) to the Lambda so failed async invocations are captured.

3. **Your import Lambda works in dev but times out in prod with 10 MB files. How do you fix it?**
   - Increase Lambda memory (more memory = more CPU) and timeout.
   - For very large files, switch to S3 Select or chunk the stream.
   - Consider using AWS Glue or Step Functions for heavy ETL workloads.

4. **Product managers want to know which files failed to import and why. How would you implement this?**
   - Catch per-record errors in the stream handler, accumulate them.
   - Write a summary (file name, row count, error count, errors) to DynamoDB or S3 as a `.json` report.
   - Optionally send a notification via SNS/SES when import fails.

5. **A security audit flags that your S3 bucket allows public access. How do you fix it without breaking pre-signed URLs?**
   - Pre-signed URLs do NOT require public access — they embed credentials in the URL.
   - Block all public access on the bucket.
   - Ensure the Lambda role has `s3:PutObject`. Pre-signed URLs will still work.

---

## ☁️ AWS Certification Questions (SAA-C03 / DVA-C02 Level)

1. **A company needs to allow users to upload files directly to S3 without exposing AWS credentials. What should you use?**
   - **Answer:** Pre-signed URLs (or Pre-signed POST). Generated server-side, handed to the client, valid for a limited time.

2. **Which AWS service would you use to automatically trigger processing when a new file is added to an S3 bucket?**
   - **Answer:** AWS Lambda with an S3 event notification (`s3:ObjectCreated:*`).

3. **An S3-triggered Lambda is failing and you need to ensure no events are lost. What do you add?**
   - **Answer:** A Dead Letter Queue (DLQ) — configure an SQS queue as the DLQ on the Lambda. Failed invocations are sent there for reprocessing.

4. **What is the maximum size of a single synchronous Lambda response payload?**
   - **Answer:** 6 MB. (Async response limit is 256 KB. This is why large file uploads must go directly to S3, not through Lambda.)

5. **You want to run code every time a file is created in `uploaded/` but only in a specific S3 bucket. How do you filter events in CDK?**
   - **Answer:** Use `S3EventSource` with `filters: [{ prefix: 'uploaded/' }]`.

6. **What is the difference between an S3 bucket policy and an IAM role policy when granting Lambda access to S3?**
   - **Bucket policy:** resource-based, attached to the bucket, grants access to specific principals.
   - **IAM role policy:** identity-based, attached to the Lambda's execution role, grants the Lambda permission to call S3 APIs.
   - Either works; CDK `grantPut()` uses the IAM role approach.

7. **A Lambda function needs to read from S3 and write to DynamoDB. What is the recommended IAM approach?**
   - **Answer:** Create a dedicated IAM execution role with only `s3:GetObject` on the specific bucket/key and `dynamodb:PutItem` on the specific table. Never use `AdministratorAccess`.

8. **What AWS service would you use if you need to process S3 events in order and exactly once?**
   - **Answer:** Use S3 → SQS FIFO queue → Lambda. S3 direct-to-Lambda is at-least-once and unordered.

9. **How do S3 pre-signed URLs handle expiration? What HTTP status code does an expired URL return?**
   - **Answer:** Expiry is encoded in the URL signature. After expiry, S3 returns `403 Forbidden` with `RequestExpired` in the XML error body.

10. **What is the purpose of `cdk bootstrap` and what resources does it create?**
    - **Answer:** Creates a CloudFormation stack called `CDKToolkit` containing: an S3 bucket (for storing Lambda assets), an ECR repository (for Docker images), and IAM roles for CDK deployment.

11. **You want Lambda to move a file from `uploaded/` to `parsed/` in S3. Is there a native S3 move operation?**
    - **Answer:** No. S3 has no atomic move. You must: `CopyObject` (source → destination), then `DeleteObject` (source). This is what the optional Task 5 bonus implements.

12. **What happens if an S3-triggered Lambda fails after partially processing a file? Will it retry?**
    - **Answer:** Yes — async Lambda invocations retry twice by default. This can cause duplicate processing. Make your handler idempotent (e.g., skip files already in `parsed/`).

