import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as path from 'path';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { S3EventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';

const IMPORT_BUCKET_NAME = 'import-service-ap-south-1-nakul-2026';
// Queue ARN exported by the Product Service stack
const CATALOG_ITEMS_QUEUE_ARN = process.env.CATALOG_ITEMS_QUEUE_ARN ?? '';

export class ImportServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const importBucket = s3.Bucket.fromBucketName(this, 'ImportBucket', IMPORT_BUCKET_NAME);

    // Reference the SQS queue created by the Product Service stack
    const catalogItemsQueue = sqs.Queue.fromQueueArn(
      this,
      'CatalogItemsQueue',
      CATALOG_ITEMS_QUEUE_ARN,
    );

    const importProductsFile = new NodejsFunction(this, 'ImportProductsFileFunction', {
      runtime: Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '../lamda/importService/index.ts'),
      environment: {
        IMPORT_BUCKET_NAME,
      },
    });

    const importFileParser = new NodejsFunction(this, 'ImportFileParserFunction', {
      runtime: Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '../lamda/importFileParser/index.ts'),
      environment: {
        IMPORT_BUCKET_NAME,
        SQS_QUEUE_URL: catalogItemsQueue.queueUrl,
      },
    });

    importBucket.grantPut(importProductsFile, 'uploaded/*');
    importBucket.grantReadWrite(importFileParser);
    catalogItemsQueue.grantSendMessages(importFileParser);

    importFileParser.addEventSource(
      new S3EventSource(importBucket as unknown as s3.Bucket, {
        events: [s3.EventType.OBJECT_CREATED],
        filters: [{ prefix: 'uploaded/' }],
      }),
    );

    const api = new apigateway.RestApi(this, 'ImportServiceApi', {
      restApiName: 'Import Service API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    // Read the basicAuthorizer Lambda ARN from SSM (written by the Authorization Service stack)
    const basicAuthorizerArn = ssm.StringParameter.valueForStringParameter(
      this,
      '/authorization-service/basicAuthorizerArn',
    );

    const basicAuthorizerFn = lambda.Function.fromFunctionArn(
      this,
      'BasicAuthorizerFunction',
      basicAuthorizerArn,
    );

    const authorizer = new apigateway.TokenAuthorizer(this, 'BasicAuthorizer', {
      handler: basicAuthorizerFn,
      identitySource: apigateway.IdentitySource.header('Authorization'),
      // Disable cache so every request is checked (useful during development/testing)
      resultsCacheTtl: cdk.Duration.seconds(0),
    });

    const importResource = api.root.addResource('import');
    importResource.addMethod('GET', new apigateway.LambdaIntegration(importProductsFile), {
      requestParameters: {
        'method.request.querystring.name': true,
      },
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    });

    // API Gateway authorizer error responses bypass Lambda CORS headers,
    // so we must attach CORS headers directly to the gateway error responses.
    api.addGatewayResponse('Unauthorized', {
      type: apigateway.ResponseType.UNAUTHORIZED,
      statusCode: '401',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'",
        'Access-Control-Allow-Methods': "'*'",
      },
    });

    api.addGatewayResponse('AccessDenied', {
      type: apigateway.ResponseType.ACCESS_DENIED,
      statusCode: '403',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'",
        'Access-Control-Allow-Methods': "'*'",
      },
    });

    new cdk.CfnOutput(this, 'ImportServiceApiUrl', {
      value: api.url,
    });
  }
}
