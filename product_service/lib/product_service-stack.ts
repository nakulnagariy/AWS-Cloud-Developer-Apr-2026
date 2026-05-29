import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as path from 'path';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

// Table names must match exactly what was created in the AWS Console (DynamoDB)
const PRODUCTS_TABLE = 'products';
const STOCKS_TABLE = 'stocks';

export class ProductServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── DynamoDB Table References ────────────────────────────────────────────
    // We use fromTableName() because the tables were created manually in the
    // AWS Console, NOT by this CDK stack. This creates a read-only reference
    // to an existing table — CDK won't create or delete it on deploy/destroy.
    // If you want CDK to manage the table lifecycle, use: new dynamodb.Table(...)
    const productsTable = dynamodb.Table.fromTableName(this, 'ProductsTable', PRODUCTS_TABLE);
    const stocksTable = dynamodb.Table.fromTableName(this, 'StocksTable', STOCKS_TABLE);

    // ─── Lambda: getProductsList ──────────────────────────────────────────────
    // NodejsFunction automatically bundles the TypeScript handler using esbuild.
    // 'entry' points to the .ts source file.
    // 'handler' is the name of the exported function inside that file.
    // 'environment' injects values as process.env.* inside the Lambda at runtime.
    const getProductListLambda = new NodejsFunction(this, 'GetProductListFunction', {
      runtime: Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '../lambda/getProductList/index.ts'),
      environment: {
        // These become process.env.PRODUCTS_TABLE and process.env.STOCKS_TABLE
        // inside the Lambda handler — avoids hardcoding table names in business logic
        PRODUCTS_TABLE,
        STOCKS_TABLE,
      },
    });

    // ─── Lambda: getProductsById ──────────────────────────────────────────────
    // Same setup as above but for the single-product lookup endpoint.
    // Each Lambda is its own isolated function with its own IAM role in AWS.
    const getProductByIdLambda = new NodejsFunction(this, 'GetProductByIdFunction', {
      runtime: Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '../lambda/getProductById/index.ts'),
      environment: {
        PRODUCTS_TABLE,
        STOCKS_TABLE,
      },
    });

    // ─── Lambda: createProduct ──────────────────────────────────────────────
    // Same setup as above but for the single-product lookup endpoint.
    // Each Lambda is its own isolated function with its own IAM role in AWS.
    const createProductLambda = new NodejsFunction(this, 'CreateProductFunction', {
      runtime: Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '../lambda/createProduct/index.ts'),
      environment: {
        PRODUCTS_TABLE,
        STOCKS_TABLE,
      },
    });

    // ─── IAM Permissions ─────────────────────────────────────────────────────
    // AWS denies all resource access by default (principle of least privilege).
    // grantReadData() adds an IAM policy to the Lambda's execution role that
    // allows: dynamodb:GetItem, dynamodb:Scan, dynamodb:Query, etc. on that table.
    // We need 4 grants: 2 Lambdas × 2 tables = each Lambda can read both tables.
    productsTable.grantReadData(getProductListLambda);  // getProductsList → products
    stocksTable.grantReadData(getProductListLambda);    // getProductsList → stocks
    
    productsTable.grantReadData(getProductByIdLambda);  // getProductsById → products
    stocksTable.grantReadData(getProductByIdLambda);    // getProductsById → stocks
    
    productsTable.grantWriteData(createProductLambda);  // createProduct → products
    stocksTable.grantWriteData(createProductLambda);    // createProduct → stocks

    // ─── SQS Queue: catalogItemsQueue ─────────────────────────────────────────
    const catalogItemsQueue = new sqs.Queue(this, 'CatalogItemsQueue', {
      queueName: 'catalogItemsQueue',
      // Dead-letter queue: after 5 failed processing attempts, message lands here
      deadLetterQueue: {
        maxReceiveCount: 5,
        queue: new sqs.Queue(this, 'CatalogItemsDLQ', { queueName: 'catalogItemsDLQ' }),
      },
    });

    // ─── SNS Topic: createProductTopic ────────────────────────────────────────
    const createProductTopic = new sns.Topic(this, 'CreateProductTopic', {
      topicName: 'createProductTopic',
    });

    // Email subscription — receives ALL messages (no filter)
    createProductTopic.addSubscription(
      new subs.EmailSubscription('nakul.nagariya1@gmail.com')
    );

    // Optional: second email subscription with a filter — only products with price >= 100
    // Uses Gmail + alias so both land in the same inbox but CDK treats them as distinct subscriptions
    createProductTopic.addSubscription(
      new subs.EmailSubscription('nakul.nagariya1+highprice@gmail.com', {
        filterPolicy: {
          price: sns.SubscriptionFilter.numericFilter({ greaterThanOrEqualTo: 100 }),
        },
      })
    );

    // ─── Lambda: catalogBatchProcess ─────────────────────────────────────────
    const catalogBatchProcessLambda = new NodejsFunction(this, 'CatalogBatchProcessFunction', {
      runtime: Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '../lambda/catalogBatchProcess/index.ts'),
      environment: {
        PRODUCTS_TABLE,
        STOCKS_TABLE,
        SNS_TOPIC_ARN: createProductTopic.topicArn,
      },
    });

    productsTable.grantWriteData(catalogBatchProcessLambda);
    stocksTable.grantWriteData(catalogBatchProcessLambda);
    createProductTopic.grantPublish(catalogBatchProcessLambda);

    // Trigger: SQS → catalogBatchProcess (up to 5 messages per invocation)
    catalogBatchProcessLambda.addEventSource(
      new SqsEventSource(catalogItemsQueue, { batchSize: 5 })
    );

    // Export queue URL and ARN so Import Service can reference it
    new cdk.CfnOutput(this, 'CatalogItemsQueueUrl', {
      value: catalogItemsQueue.queueUrl,
      exportName: 'CatalogItemsQueueUrl',
    });

    new cdk.CfnOutput(this, 'CatalogItemsQueueArn', {
      value: catalogItemsQueue.queueArn,
      exportName: 'CatalogItemsQueueArn',
    });

    // ─── API Gateway ──────────────────────────────────────────────────────────
    // RestApi creates an AWS API Gateway REST API.
    // defaultCorsPreflightOptions automatically adds an OPTIONS method to every
    // resource, which handles the browser's CORS preflight request.
    const api = new apigateway.RestApi(this, 'ProductServiceApi', {
      restApiName: 'Product Service API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,  // Access-Control-Allow-Origin: *
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    // ─── Routes ───────────────────────────────────────────────────────────────
    // api.root = '/'
    // addResource('products') = '/products'
    // addMethod('GET', ...) = wires HTTP GET on that path to the Lambda via LambdaIntegration
    const products = api.root.addResource('products');
    products.addMethod('GET', new apigateway.LambdaIntegration(getProductListLambda));
    // POST /products — handled by createProduct Lambda
    products.addMethod('POST', new apigateway.LambdaIntegration(createProductLambda));

    // addResource('{productId}') = '/products/{productId}' — the {} makes it a path parameter
    // accessible in the Lambda as event.pathParameters.productId
    const product = products.addResource('{productId}');
    product.addMethod('GET', new apigateway.LambdaIntegration(getProductByIdLambda));
  }
}
