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

---

## Real Debug Story: Signed URL Works but FE Upload Fails with CORS

### What happened
- `GET /import?name=sample-product.csv` returned a valid pre-signed URL.
- FE upload still failed with browser CORS error.
- Browser preflight (`OPTIONS`) to S3 URL returned `403`.

### Why this happened
- API Gateway/Lambda CORS and S3 bucket CORS are separate.
- We had CORS on API Gateway response, but not on the S3 bucket for browser upload.
- Browser upload flow for pre-signed URL is:
  1. FE calls Import API to get signed URL.
  2. FE sends `OPTIONS` preflight to S3 URL.
  3. If preflight allows origin/method/headers, FE sends `PUT` file bytes.

### What each piece means
- Pre-signed URL: temporary permission token embedded in URL for S3 operations.
- Preflight (`OPTIONS`): browser safety check before cross-origin `PUT`/custom headers.
- `Access-Control-Allow-Origin`: which FE origins can call S3.
- `Access-Control-Allow-Methods`: must include `PUT` for upload.
- `Access-Control-Allow-Headers`: must include `content-type` (or `*`).
- `x-id=PutObject` in URL: URL is meant for `PUT`; using `GET` is wrong for upload.

### Real-dev debugging playbook
1. Confirm signed URL API works:
   - `GET /import?name=sample-product.csv` returns URL string.
2. Check browser network tab:
   - Look for failed `OPTIONS` or blocked `PUT`.
3. Reproduce preflight from CLI:
   - `OPTIONS` with `Origin`, `Access-Control-Request-Method: PUT`, `Access-Control-Request-Headers: content-type`.
4. If preflight is `403`, inspect bucket CORS:
   - `aws s3api get-bucket-cors --bucket <bucket>`.
5. Apply correct bucket CORS and verify:
   - `aws s3api put-bucket-cors ...`
   - rerun preflight until `200` + required `Access-Control-*` headers.
6. Validate upload method:
   - FE must `PUT` file bytes to signed URL, not `GET` signed URL.
7. Validate downstream processing:
   - check S3 `uploaded/` and `parsed/`, then CloudWatch logs for parser Lambda.

### Fix implemented
- Added S3 bucket CORS for FE origins:
  - `https://d210q4k0hjuddv.cloudfront.net`
  - `http://localhost:3000`
  - `http://localhost:5173`
- Allowed methods: `GET`, `PUT`, `POST`, `HEAD`
- Allowed headers: `*`
- Verified preflight returns `200` with expected CORS headers.

### Production checklist for this feature
- API returns signed URL as plain string.
- Signed URL expiration is short (for example 300 seconds).
- FE uses `PUT` with `Content-Type: text/csv`.
- Bucket CORS includes FE origin and `PUT`.
- Parser Lambda has `GetObject + CopyObject + DeleteObject` permissions.
- Parser moves file `uploaded/ -> parsed/` and logs each CSV row.

### Questions and answers (practical)

1. **Why do we need S3 CORS if API Gateway CORS already exists?**
   - Because browser upload target is S3 origin, not API Gateway. Cross-origin rules are checked per target origin.

2. **Why did signed URL generation succeed but upload fail?**
   - URL signing is server-side and independent of browser CORS. Upload is browser cross-origin and was blocked by missing bucket CORS.

3. **How do you quickly identify preflight failure?**
   - In DevTools network: failed `OPTIONS` before `PUT`. Response usually lacks required `Access-Control-Allow-*` headers or returns `403`.

4. **What is the most common FE bug in this flow?**
   - Calling signed URL with `GET` instead of `PUT` (or forgetting `Content-Type` alignment).

5. **Can we use `AllowedOrigins: ["*"]` in production?**
   - Technically yes for many cases, but better to restrict to known FE domains for tighter security.

6. **What does an expired signed URL look like?**
   - S3 returns `403` with `RequestExpired` in response body.

7. **How do you verify CORS fix outside browser?**
   - Use CLI `OPTIONS` request with `Origin` and `Access-Control-Request-*` headers and check for `200` + `Access-Control-Allow-*`.

8. **If preflight passes but PUT still fails, what next?**
   - Check signed URL expiry, required headers mismatch, bucket policy/KMS restrictions, and exact HTTP method.

9. **How do you make this robust in production?**
   - Add FE retry with fresh signed URL, structured logging, CloudWatch alarms, and idempotent parser logic.

10. **How would a senior dev close this incident?**
   - Reproduce with evidence, isolate to CORS layer, implement minimal secure fix, verify via CLI + FE, and document runbook in `learn.md`.

---

---

# Task 6 — SQS & SNS: Async Microservices Communication

## A. Key Learnings

### SQS (Simple Queue Service)
- **SQS** is a fully managed message queue — decouples producers (Import Service) from consumers (Product Service)
- **Standard Queue** (used here): at-least-once delivery, best-effort ordering. **FIFO Queue**: exactly-once, strict order, lower throughput
- **batchSize** on the Lambda event source controls how many SQS messages a single Lambda invocation receives (up to 10 for standard, 10 for FIFO)
- Messages stay in the queue until they are successfully processed (deleted by the Lambda runtime after successful handler return)
- If the Lambda throws, SQS **re-enqueues** the message for retry — add a **Dead Letter Queue (DLQ)** to capture poison messages after N retries
- `SqsEventSource` from `aws-cdk-lib/aws-lambda-event-sources` wires the queue trigger in CDK

### SNS (Simple Notification Service)
- **SNS** is a fully managed pub/sub service — one publish, many subscribers
- Subscribers can be: email, SQS, Lambda, HTTP/S endpoints, mobile push
- **Email subscription** requires manual confirmation — subscriber clicks a link in a confirmation email before receiving messages
- **Filter Policy** on a subscription lets you route messages selectively based on message attributes — subscribers only receive messages matching their filter

### Async Pipeline Pattern
- Synchronous: Client → Lambda → response (tight coupling, limited throughput)
- Async: S3 → Lambda → SQS → Lambda → DynamoDB + SNS (loose coupling, scalable, resilient)
- The Import Service and Product Service are **independent deployments** — they communicate only via the SQS queue URL
- Cross-stack references: export queue ARN/URL from Product Service stack via `CfnOutput`, import into Import Service stack via `sqs.Queue.fromQueueArn()`

### CDK Wiring for SQS & SNS
- `new sqs.Queue(this, id, { queueName: 'catalogItemsQueue' })` — creates standard queue
- `new sns.Topic(this, id, { topicName: 'createProductTopic' })` — creates topic
- `topic.addSubscription(new subs.EmailSubscription('you@email.com'))` — adds email subscriber
- `lambda.addEventSource(new SqsEventSource(queue, { batchSize: 5 }))` — wires SQS → Lambda
- `queue.grantSendMessages(lambda)` — grants `sqs:SendMessage` to the Lambda role
- `topic.grantPublish(lambda)` — grants `sns:Publish` to the Lambda role

### SQS → Lambda Event Shape
```typescript
import { SQSEvent, SQSRecord } from 'aws-lambda';
// Each record: record.body is the raw string sent by the producer
// You must JSON.parse(record.body) to get the product data
```

### SNS Publish with Message Attributes (for Filter Policy)
```typescript
await snsClient.send(new PublishCommand({
  TopicArn: process.env.SNS_TOPIC_ARN,
  Message: JSON.stringify({ createdCount: N, products: [...] }),
  MessageAttributes: {
    price: { DataType: 'Number', StringValue: String(maxPrice) }
  }
}));
```

---

## B. Standard / Conceptual Interview Questions

1. **What is the difference between SQS and SNS?**
   - **SQS** is a queue — messages wait until a consumer polls/reads them. Point-to-point. Guarantees delivery to one consumer.
   - **SNS** is a topic — messages are pushed immediately to all subscribers (fan-out). One-to-many.

2. **What is the difference between a Standard SQS queue and a FIFO queue?**
   - Standard: at-least-once delivery, best-effort ordering, unlimited throughput.
   - FIFO: exactly-once delivery, strict ordering, 300 TPS limit (3000 with batching).

3. **What does `batchSize` control in an SQS Lambda event source?**
   - The maximum number of SQS messages delivered to a single Lambda invocation. Here it's 5 — Lambda processes up to 5 CSV row messages per call.

4. **What happens to an SQS message if the Lambda throws an error?**
   - The message becomes visible again in the queue after the visibility timeout expires, and retries. After `maxReceiveCount` retries, it goes to the DLQ (if configured).

5. **What is an SNS subscription filter policy?**
   - A JSON policy on a subscription that filters which messages the subscriber receives, based on message attributes. Only messages matching the filter are delivered to that subscriber.

6. **Why do you need to confirm an SNS email subscription before receiving messages?**
   - AWS sends a confirmation email to prevent subscribing someone without their consent. Until confirmed, the endpoint receives nothing.

7. **What is the typical architecture for "fan-out" in AWS?**
   - SNS → multiple SQS queues. Each queue feeds a different Lambda or service. SNS delivers to all queues simultaneously; each queue processes independently.

8. **What is the visibility timeout in SQS?**
   - The period after a message is received by a consumer during which it is hidden from other consumers. If not deleted within that window, the message becomes visible again (implicit retry). Default: 30 seconds.

9. **How do you pass the SQS queue URL from Product Service CDK to Import Service CDK without hardcoding?**
   - Export via `CfnOutput` in Product Service stack. Import via `sqs.Queue.fromQueueArn()` in Import Service stack using the ARN as an environment variable or SSM Parameter Store value.

10. **Why does `catalogBatchProcess` publish one SNS message per batch rather than one per product?**
    - Fewer API calls, lower cost (SNS charges per publish), and the email is more readable as a batch summary.

---

## C. Tricky / Gotcha Questions

1. **You add an SQS Lambda trigger with `batchSize: 5` but Lambda only ever receives 1 message at a time. Why?**
   - `batchSize` is a *maximum*. If only 1 message is available in the queue when the poller fires, Lambda receives just 1. Messages must be queued up simultaneously to get a full batch.

2. **SNS email subscription is confirmed but you never receive notifications. What do you check?**
   - Verify `SNS_TOPIC_ARN` env var is correct in Lambda.
   - Verify Lambda role has `sns:Publish` permission (via `topic.grantPublish(lambda)`).
   - Check if a filter policy on the subscription is filtering out your messages.
   - Check Lambda CloudWatch logs for SNS publish errors.

3. **`importFileParser` sends to SQS but `catalogBatchProcess` receives empty product objects `{}`. Why?**
   - `SendMessageCommand.MessageBody` must be `JSON.stringify(record)`. If you pass the raw csv-parser object without stringifying, SQS receives `[object Object]`, which `JSON.parse` fails on.

4. **Your Lambda has `batchSize: 5` but the CSV only has 3 rows. How many Lambda invocations happen?**
   - One invocation with 3 messages (the full batch available). `batchSize` is a ceiling, not a minimum.

5. **You use `queue.grantSendMessages(importFileParser)` in Import Service stack but the queue lives in Product Service stack. CDK deploy fails with a permissions error. Why?**
   - `grantSendMessages` adds an inline policy to the Lambda role in the same stack. This works cross-stack because IAM is global — but you need to import the queue using `Queue.fromQueueArn()` first. If the ARN is wrong or the stacks aren't deployed in order (Product Service first), the import fails.

6. **Your SQS-triggered Lambda fails on every message but you have no DLQ. What happens to the messages?**
   - They keep retrying until the `maxReceiveCount` is hit (default: configurable, often 3–5). After that, without a DLQ, they are **silently dropped** when `MessageRetentionPeriod` expires.

7. **Why does your SNS email show the raw JSON string instead of human-readable text?**
   - SNS email subscriptions deliver the raw `Message` string. If you `JSON.stringify` your payload, that's what lands in the email. Either send a human-readable plain-text string, or use a Lambda subscriber that formats the email via SES.

8. **`PublishCommand` throws `AuthorizationError`. Lambda is in the same account. What's missing?**
   - The Lambda execution role is missing `sns:Publish` permission on the topic. `topic.grantPublish(lambda)` in CDK adds this. Without it, the Lambda can't publish regardless of being in the same account.

9. **You deploy Product Service, then Import Service. The Import Service Lambda can't find the queue ARN. Why?**
   - CDK `CfnOutput` values are only visible in the CloudFormation console after deploy. If you're passing the ARN as a hardcoded string or env var, you must manually copy it after the Product Service deploy. Consider using SSM Parameter Store for zero-manual-copy cross-stack sharing.

10. **Can two different SQS consumer Lambdas consume from the same standard queue simultaneously?**
    - Yes, but they will receive **different** messages (standard queue hides a message once received). If you want both consumers to get the **same** messages, use SNS fan-out → two separate SQS queues.

---

## D. Real-World Scenario Questions

1. **You're building a CSV import pipeline for 1 million rows per day. The Lambda times out at 15 minutes for large files. How do you redesign?**
   - Split concerns: importFileParser streams rows and sends each row to SQS (already done here). catalogBatchProcess handles DynamoDB writes in batches. For even larger scale, use `BatchWriteItem` (up to 25 items per call) inside the Lambda. For extreme scale, use AWS Glue or EMR.

2. **A junior dev says "let's just call the Product Service HTTP API from importFileParser instead of using SQS." What are the trade-offs?**
   - Direct HTTP: simpler, but tightly coupled — if Product Service is down or slow, Import Service is blocked. Rate limits or throttling on API Gateway become bottlenecks.
   - SQS: loose coupling, buffering (Import can keep sending even if Product is slow), natural retry semantics, batch processing. The right choice here.

3. **Product managers want to know when a batch import fails halfway through. How do you implement observability?**
   - Catch per-message errors in `catalogBatchProcess`, accumulate failures, publish an SNS message with error summary. Configure a DLQ on the SQS queue — failed messages land there. Set up a CloudWatch alarm on `ApproximateNumberOfMessagesNotVisible` for the DLQ > 0.

4. **Security audit: the SQS queue URL is hardcoded in the Import Service Lambda env var. What's the risk and fix?**
   - Low risk (queue URL isn't a secret), but it breaks if the queue is re-created with a new URL. Better: store queue URL in SSM Parameter Store and read at Lambda startup via `SSMClient`. Even simpler: use CDK cross-stack references so the URL is injected at deploy time and never hardcoded in source.

5. **The `catalogBatchProcess` Lambda is writing products and then crashes before publishing to SNS. What's the observable outcome?**
   - Products are in DynamoDB but no email notification was sent. The SQS batch was already processed (Lambda returned before crash) — so messages are deleted. This is a partial success. To prevent: use a try/catch and only acknowledge success if SNS publish also succeeds, or accept the rare missed notification as acceptable (notifications are non-critical here).

---

## E. AWS Certification Questions (SAA-C03 / DVA-C02 Level)

1. **A company wants to decouple a file ingestion service from a data processing service so that processing can continue even if the ingestion service is temporarily overloaded. Which AWS service should they use?**
   - **A) SNS B) SQS ✓ C) EventBridge D) Kinesis**
   - SQS buffers messages and decouples producers from consumers.

2. **An SQS-triggered Lambda fails repeatedly. After how many failures does the message get sent to the DLQ by default?**
   - **Answer:** The DLQ is not automatic — you must configure `maxReceiveCount` on the queue's `RedrivePolicy`. There is no built-in default DLQ.

3. **Which SQS queue type guarantees exactly-once message delivery?**
   - **A) Standard B) FIFO ✓ C) Both D) Neither**

4. **An SNS topic has three subscriptions: two SQS queues and one email. A message is published. How many times is the message delivered?**
   - **Answer:** 3 times — once to each subscriber independently (fan-out).

5. **What is the maximum number of SQS messages in a single Lambda batch trigger?**
   - **Answer:** 10 for Standard queues, 10 for FIFO queues (with `batchSize` configurable up to 10 in the event source mapping; up to 10,000 with batch windows).

6. **You publish a message to SNS with a message attribute `price = 1500`. Subscription A has no filter. Subscription B has filter `price >= 1000`. Which subscriptions receive the message?**
   - **Answer:** Both A and B. Subscription A has no filter (receives all). Subscription B's filter matches (1500 >= 1000).

7. **A Lambda is triggered by SQS and processes a batch of 10 messages. 3 messages fail and 7 succeed. What happens?**
   - **Answer:** By default, the entire batch is retried (all 10 messages go back to the queue). Use **partial batch response** (`ReportBatchItemFailures`) to only re-enqueue the 3 failed messages.

8. **What IAM permission does a Lambda need to send messages to an SQS queue?**
   - **Answer:** `sqs:SendMessage` on the queue ARN. In CDK: `queue.grantSendMessages(lambda)`.

9. **What is the maximum retention period for a message in an SQS queue?**
   - **Answer:** 14 days.

10. **Which AWS service would you use to route SNS messages to different processing pipelines based on the message content?**
    - **Answer:** SNS **Filter Policy** on individual subscriptions routes based on message attributes. For complex routing, use **EventBridge** with rules.

11. **An application needs to guarantee that messages from an SQS queue are processed in the order they were sent. Which queue type should you use?**
    - **Answer:** FIFO queue with the same `MessageGroupId` for ordered processing.

12. **What is the visibility timeout in SQS, and what happens if it expires before the Lambda finishes?**
    - **Answer:** The period a message is hidden from other consumers after being received. If the Lambda doesn't delete the message before timeout expires, the message becomes visible again and is re-delivered — causing duplicate processing. Set visibility timeout > Lambda max execution time.

