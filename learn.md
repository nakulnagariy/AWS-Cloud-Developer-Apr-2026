# Task 3 — Key Learnings

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
