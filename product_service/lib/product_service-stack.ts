import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';

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
