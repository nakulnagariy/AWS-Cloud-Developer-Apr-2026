import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as dotenv from 'dotenv';

// Load .env file so credentials are available as process.env at synth time
dotenv.config({ path: path.join(__dirname, '../.env') });

export class AuthorizationServiceStack extends cdk.Stack {
  public readonly basicAuthorizerArn: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Collect all env vars from the loaded .env file to pass to the lambda.
    // The .env file must contain a line like: your_github_login=TEST_PASSWORD
    const envConfig = dotenv.config({ path: path.join(__dirname, '../.env') }).parsed ?? {};

    if (Object.keys(envConfig).length === 0) {
      console.warn(
        'WARNING: .env file is empty or missing. Copy .env.example to .env and fill in your credentials.',
      );
    }

    const basicAuthorizer = new NodejsFunction(this, 'BasicAuthorizerFunction', {
      functionName: 'basicAuthorizer',
      runtime: Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '../lambda/basicAuthorizer/index.ts'),
      environment: {
        // Spread all .env vars into the Lambda environment so the lambda
        // can look up process.env[username] at runtime
        ...envConfig,
      },
    });

    // Allow API Gateway (from any API in this account) to invoke this lambda
    basicAuthorizer.addPermission('ApiGatewayInvoke', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      action: 'lambda:InvokeFunction',
    });

    // Store the ARN in SSM Parameter Store for the Import Service to consume
    new ssm.StringParameter(this, 'BasicAuthorizerArnParam', {
      parameterName: '/authorization-service/basicAuthorizerArn',
      stringValue: basicAuthorizer.functionArn,
      description: 'ARN of the basicAuthorizer Lambda function',
    });

    new cdk.CfnOutput(this, 'BasicAuthorizerArn', {
      value: basicAuthorizer.functionArn,
      exportName: 'BasicAuthorizerArn',
      description: 'ARN of the basicAuthorizer Lambda function',
    });
  }
}
