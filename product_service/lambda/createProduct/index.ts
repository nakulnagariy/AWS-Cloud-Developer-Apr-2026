import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('createProduct called', event);

  try {
    const { title, description, price, count } = JSON.parse(event.body ?? '{}');

    // Validate all required fields are present, correct types, and valid values
    if (
      !title ||
      typeof title !== 'string' ||
      !description ||
      typeof description !== 'string' ||
      typeof price !== 'number' ||
      price <= 0 ||
      typeof count !== 'number' ||
      count < 0 ||
      !Number.isInteger(count)
    ) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          message: 'Invalid product data. Required: title (string), description (string), price (positive number), count (non-negative integer)',
        }),
      };
    }

    const productId = crypto.randomUUID();

    // TransactWriteCommand — atomic write to both tables.
    // If either write fails (e.g. table unavailable, validation error),
    // the entire transaction is rolled back — no partial data is saved.
    // This ensures a product always has a corresponding stock record and vice versa.
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: process.env.PRODUCTS_TABLE,
              Item: { id: productId, title, description, price },
            },
          },
          {
            Put: {
              TableName: process.env.STOCKS_TABLE,
              Item: { product_id: productId, count },
            },
          },
        ],
      })
    );

    return {
      statusCode: 201,
      headers: CORS_HEADERS,
      body: JSON.stringify({ id: productId, title, description, price, count }),
    };
  } catch (err) {
    console.error('createProduct error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};

