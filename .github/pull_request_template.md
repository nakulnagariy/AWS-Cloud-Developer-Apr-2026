## Task 5 - Integration with S3

### 1. What was done?

Describe implemented scope and current status.

Example:
- Service is done, but FE is not working.
- Additional scope: unit tests, file move uploaded -> parsed.

### 2. Link to Import Service API

- Import Service API URL: 

### 3. Link to FE PR (your own repository)

- FE PR: 

### 4. Product schema (required only if Swagger/OpenAPI is not provided)

Provide product schema here if there is no Swagger/OpenAPI file.

Example:
```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "price": 0,
  "count": 0
}
```

## Coverage Checklist (Task 5)

- [ ] AWS CDK Stack contains configuration for importProductsFile function
- [ ] importProductsFile returns a usable signed URL for S3 upload
- [ ] Frontend is integrated with importProductsFile lambda
- [ ] importFileParser is implemented and configured in CDK stack

## Optional Points

- [ ] +10: importProductsFile lambda has unit tests
- [ ] +10: importFileParser lambda has unit tests
- [ ] +10: Files are moved from uploaded/ to parsed/ after parsing

## Notes for Reviewer

- Branch: feat/task-5
- Region: ap-south-1
