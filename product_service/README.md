# Product Service

REST API for the product catalog, built with AWS CDK, AWS Lambda, and AWS API Gateway.

## Deployed API

| Endpoint | Method | Description |
|---|---|---|
| `https://2hy6bydj7k.execute-api.ap-south-1.amazonaws.com/prod/products` | GET | Returns all products |
| `https://2hy6bydj7k.execute-api.ap-south-1.amazonaws.com/prod/products/{productId}` | GET | Returns product by ID |

## Useful commands

* `npm run build`    compile typescript to js
* `npm run watch`    watch for changes and compile
* `npm run test`     perform the jest unit tests
* `npm run deploy`   deploy this stack to AWS
* `npm run destroy`  tear down the stack
* `npm run diff`     compare deployed stack with current state
* `npm run synth`    emits the synthesized CloudFormation template
