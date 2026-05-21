import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as path from 'path';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { S3EventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';

const IMPORT_BUCKET_NAME = 'import-service-ap-south-1-nakul-2026';

export class ImportServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const importBucket = s3.Bucket.fromBucketName(this, 'ImportBucket', IMPORT_BUCKET_NAME);

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
      },
    });

    importBucket.grantPut(importProductsFile, 'uploaded/*');
    importBucket.grantReadWrite(importFileParser);

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

    const importResource = api.root.addResource('import');
    importResource.addMethod('GET', new apigateway.LambdaIntegration(importProductsFile), {
      requestParameters: {
        'method.request.querystring.name': true,
      },
    });

    new cdk.CfnOutput(this, 'ImportServiceApiUrl', {
      value: api.url,
    });
  }
}
