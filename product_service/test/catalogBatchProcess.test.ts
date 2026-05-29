import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import type { SQSEvent } from 'aws-lambda';

// Set env vars before module load
process.env.PRODUCTS_TABLE = 'products';
process.env.STOCKS_TABLE = 'stocks';
process.env.SNS_TOPIC_ARN = 'arn:aws:sns:ap-south-1:123456789012:createProductTopic';

const dynamoMock = mockClient(DynamoDBDocumentClient);
const snsMock = mockClient(SNSClient);

import { handler } from '../lambda/catalogBatchProcess/index';

const buildSQSEvent = (records: object[]): SQSEvent => ({
  Records: records.map((body, i) => ({
    messageId: `msg-${i}`,
    receiptHandle: `rh-${i}`,
    body: JSON.stringify(body),
    attributes: {} as SQSEvent['Records'][0]['attributes'],
    messageAttributes: {},
    md5OfBody: '',
    eventSource: 'aws:sqs',
    eventSourceARN: 'arn:aws:sqs:ap-south-1:123456789012:catalogItemsQueue',
    awsRegion: 'ap-south-1',
  })),
});

// numeric types — as you'd send from a typed caller
const validProduct = { title: 'Laptop', description: 'A laptop', price: 1200, count: 5 };
// string types — exactly what csv-parser produces after reading a CSV file
const validProductFromCsv = { title: 'Laptop', description: 'A laptop', price: '1200', count: '5' };

describe('catalogBatchProcess handler', () => {
  beforeEach(() => {
    dynamoMock.reset();
    snsMock.reset();
  });

  it('creates products in DynamoDB and publishes SNS for a valid batch', async () => {
    dynamoMock.on(TransactWriteCommand).resolves({});
    snsMock.on(PublishCommand).resolves({ MessageId: 'test-msg-id' });

    const event = buildSQSEvent([validProduct, { ...validProduct, title: 'Mouse', price: 25 }]);
    await handler(event);

    const writeCalls = dynamoMock.commandCalls(TransactWriteCommand);
    expect(writeCalls).toHaveLength(2);

    const snsCalls = snsMock.commandCalls(PublishCommand);
    expect(snsCalls).toHaveLength(1);
    const snsInput = snsCalls[0].args[0].input;
    expect(snsInput.TopicArn).toBe(process.env.SNS_TOPIC_ARN);
    expect(snsInput.Subject).toContain('2 product(s)');
  });

  it('writes to both products and stocks tables in a transaction', async () => {
    dynamoMock.on(TransactWriteCommand).resolves({});
    snsMock.on(PublishCommand).resolves({});

    await handler(buildSQSEvent([validProduct]));

    const writeCalls = dynamoMock.commandCalls(TransactWriteCommand);
    expect(writeCalls).toHaveLength(1);
    const items = writeCalls[0].args[0].input.TransactItems!;
    expect(items).toHaveLength(2);
    const tableNames = items.map((i) => i.Put?.TableName);
    expect(tableNames).toContain('products');
    expect(tableNames).toContain('stocks');
  });

  it('skips invalid messages and does not call DynamoDB for them', async () => {
    dynamoMock.on(TransactWriteCommand).resolves({});
    snsMock.on(PublishCommand).resolves({});

    const event = buildSQSEvent([
      { title: '', description: 'bad', price: 10, count: 1 },   // empty title
      { title: 'OK', description: 'ok', price: -5, count: 1 },  // negative price
      { title: 'OK', description: 'ok', price: 10, count: -1 }, // negative count
      { title: 'OK', description: 'ok', price: 10, count: 1.5 },// non-integer count
      { title: 'OK', description: 'ok', price: '0', count: '1' },// zero price as string
    ]);

    await handler(event);

    expect(dynamoMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(0);
  });

  it('coerces CSV string fields (price/count as strings) into numbers and creates the product', async () => {
    dynamoMock.on(TransactWriteCommand).resolves({});
    snsMock.on(PublishCommand).resolves({});

    await handler(buildSQSEvent([validProductFromCsv]));

    const writeCalls = dynamoMock.commandCalls(TransactWriteCommand);
    expect(writeCalls).toHaveLength(1);

    // Verify the stored item has numeric price and count, not strings
    const productItem = writeCalls[0].args[0].input.TransactItems![0].Put!.Item;
    const stocksItem = writeCalls[0].args[0].input.TransactItems![1].Put!.Item;
    expect(typeof productItem!.price).toBe('number');
    expect(productItem!.price).toBe(1200);
    expect(typeof stocksItem!.count).toBe('number');
    expect(stocksItem!.count).toBe(5);

    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(1);
  });

  it('skips messages with invalid JSON body without throwing', async () => {
    dynamoMock.on(TransactWriteCommand).resolves({});
    snsMock.on(PublishCommand).resolves({});

    const event: SQSEvent = {
      Records: [{
        messageId: 'bad',
        receiptHandle: 'rh-bad',
        body: 'not-json{{',
        attributes: {} as SQSEvent['Records'][0]['attributes'],
        messageAttributes: {},
        md5OfBody: '',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:ap-south-1:123456789012:catalogItemsQueue',
        awsRegion: 'ap-south-1',
      }],
    };

    await expect(handler(event)).resolves.not.toThrow();
    expect(dynamoMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('does not publish SNS when all messages are invalid', async () => {
    dynamoMock.on(TransactWriteCommand).resolves({});
    snsMock.on(PublishCommand).resolves({});

    await handler(buildSQSEvent([{ foo: 'bar' }]));

    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(0);
  });

  it('includes max price as SNS message attribute', async () => {
    dynamoMock.on(TransactWriteCommand).resolves({});
    snsMock.on(PublishCommand).resolves({});

    const event = buildSQSEvent([
      { title: 'Cheap', description: 'item', price: 10, count: 1 },
      { title: 'Expensive', description: 'item', price: 500, count: 1 },
    ]);

    await handler(event);

    const snsCalls = snsMock.commandCalls(PublishCommand);
    const priceAttr = snsCalls[0].args[0].input.MessageAttributes?.price;
    expect(priceAttr?.StringValue).toBe('500');
  });

  it('throws if required env vars are missing', async () => {
    const origArn = process.env.SNS_TOPIC_ARN;
    delete process.env.SNS_TOPIC_ARN;

    await expect(handler(buildSQSEvent([validProduct]))).rejects.toThrow(
      'Missing required environment variables'
    );

    process.env.SNS_TOPIC_ARN = origArn;
  });
});
