import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('getProductsList called', event);

  try {
    const [productsResult, stocksResult] = await Promise.all([
      docClient.send(new ScanCommand({ TableName: process.env.PRODUCTS_TABLE })),
      docClient.send(new ScanCommand({ TableName: process.env.STOCKS_TABLE })),
    ]);

    const products = productsResult.Items ?? [];
    const stocks = stocksResult.Items ?? [];

    const joined = products.map((product) => {
      const stock = stocks.find((s) => s.product_id === product.id);
      return { ...product, count: stock?.count ?? 0 };
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(joined),
    };
  } catch (err) {
    console.error('getProductsList error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};

