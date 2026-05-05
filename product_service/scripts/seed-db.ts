import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockProducts } from '../lambda/mock-data.js';

const REGION = process.env.AWS_REGION ?? 'ap-south-1';
const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE ?? 'products';
const STOCKS_TABLE = process.env.STOCKS_TABLE ?? 'stocks';

const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client);

async function seed() {
  console.log(`Seeding tables in region: ${REGION}`);
  console.log(`Products table: ${PRODUCTS_TABLE}`);
  console.log(`Stocks table: ${STOCKS_TABLE}\n`);

  for (const product of mockProducts) {
    const { count, ...productItem } = product;

    // Insert into products table (without count)
    await docClient.send(
      new PutCommand({
        TableName: PRODUCTS_TABLE,
        Item: productItem,
      })
    );

    // Insert into stocks table
    await docClient.send(
      new PutCommand({
        TableName: STOCKS_TABLE,
        Item: {
          product_id: product.id,
          count,
        },
      })
    );

    console.log(`✓ Seeded: ${product.title} (id: ${product.id})`);
  }

  console.log(`\nDone! Seeded ${mockProducts.length} products and ${mockProducts.length} stock records.`);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
