import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import type { SQSEvent } from 'aws-lambda';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const snsClient = new SNSClient({});

type ProductInput = {
  title: string;
  description: string;
  price: number;
  count: number;
};

// csv-parser returns all fields as strings, so we coerce price/count to numbers
// before validation. This handles both CSV-sourced SQS messages and any future
// callers that already send numeric types.
const parseAndValidateProduct = (data: unknown): ProductInput | null => {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  const title = d.title;
  const description = d.description;
  const price = typeof d.price === 'string' ? Number(d.price) : d.price;
  const count = typeof d.count === 'string' ? Number(d.count) : d.count;

  if (
    typeof title !== 'string' || title.length === 0 ||
    typeof description !== 'string' || description.length === 0 ||
    typeof price !== 'number' || !isFinite(price) || price <= 0 ||
    typeof count !== 'number' || !isFinite(count) || count < 0 || !Number.isInteger(count)
  ) {
    return null;
  }

  return { title, description, price, count };
};

export const handler = async (event: SQSEvent): Promise<void> => {
  const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE;
  const STOCKS_TABLE = process.env.STOCKS_TABLE;
  const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;

  if (!PRODUCTS_TABLE || !STOCKS_TABLE || !SNS_TOPIC_ARN) {
    throw new Error('Missing required environment variables: PRODUCTS_TABLE, STOCKS_TABLE, SNS_TOPIC_ARN');
  }

  const createdProducts: (ProductInput & { id: string })[] = [];

  for (const record of event.Records) {
    let data: unknown;
    try {
      data = JSON.parse(record.body);
    } catch {
      console.error('Failed to parse SQS message body:', record.body);
      continue;
    }

    const product = parseAndValidateProduct(data);
    if (!product) {
      console.error('Invalid product data in SQS message, skipping:', record.body);
      continue;
    }

    const { title, description, price, count } = product;
    const productId = crypto.randomUUID();

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: PRODUCTS_TABLE,
              Item: { id: productId, title, description, price },
            },
          },
          {
            Put: {
              TableName: STOCKS_TABLE,
              Item: { product_id: productId, count },
            },
          },
        ],
      })
    );

    createdProducts.push({ id: productId, title, description, price, count });
    console.log('Created product:', productId, title);
  }

  if (createdProducts.length > 0) {
    const maxPrice = Math.max(...createdProducts.map((p) => p.price));

    await snsClient.send(
      new PublishCommand({
        TopicArn: SNS_TOPIC_ARN,
        Subject: `Catalog Batch Import: ${createdProducts.length} product(s) created`,
        Message: JSON.stringify({ createdCount: createdProducts.length, products: createdProducts }, null, 2),
        MessageAttributes: {
          price: {
            DataType: 'Number',
            StringValue: String(maxPrice),
          },
        },
      })
    );

    console.log(`Published SNS notification for ${createdProducts.length} product(s)`);
  }
};
