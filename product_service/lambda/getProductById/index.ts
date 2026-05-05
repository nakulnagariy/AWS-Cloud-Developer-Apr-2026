import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('getProductsById called', event);

  const productId = event.pathParameters?.productId;

  if (!productId) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: 'Product ID is required' }),
    };
  }

  try {
    const [productResult, stockResult] = await Promise.all([
      docClient.send(new GetCommand({
        TableName: process.env.PRODUCTS_TABLE,
        Key: { id: productId },
      })),
      docClient.send(new GetCommand({
        TableName: process.env.STOCKS_TABLE,
        Key: { product_id: productId },
      })),
    ]);

    if (!productResult.Item) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: 'Product not found' }),
      };
    }

    const joined = {
      ...productResult.Item,
      count: stockResult.Item?.count ?? 0,
    };

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(joined),
    };
  } catch (err) {
    console.error('getProductsById error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
