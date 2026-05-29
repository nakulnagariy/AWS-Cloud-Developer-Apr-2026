import { mockClient } from 'aws-sdk-client-mock';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { Readable } from 'node:stream';
import type { S3Event } from 'aws-lambda';

// Set env vars before module load
process.env.IMPORT_BUCKET_NAME = 'test-bucket';
process.env.SQS_QUEUE_URL = 'https://sqs.ap-south-1.amazonaws.com/123456789012/catalogItemsQueue';

const s3Mock = mockClient(S3Client);
const sqsMock = mockClient(SQSClient);

import {
  handler,
  moveFileToParsed,
} from '../lamda/importFileParser/index';

const buildS3Event = (key: string): S3Event =>
  ({
    Records: [
      {
        s3: {
          bucket: { name: 'test-bucket' },
          object: { key },
        },
      },
    ],
  } as unknown as S3Event);

const makeReadable = (content: string): Readable => Readable.from([content]);

describe('moveFileToParsed', () => {
  beforeEach(() => s3Mock.reset());

  it('copies to parsed/ and deletes from uploaded/', async () => {
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectCommand).resolves({});

    await moveFileToParsed('test-bucket', 'uploaded/products.csv');

    const copyCalls = s3Mock.commandCalls(CopyObjectCommand);
    expect(copyCalls).toHaveLength(1);
    expect(copyCalls[0].args[0].input.Key).toBe('parsed/products.csv');
    expect(copyCalls[0].args[0].input.CopySource).toBe('test-bucket/uploaded/products.csv');

    const deleteCalls = s3Mock.commandCalls(DeleteObjectCommand);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].args[0].input.Key).toBe('uploaded/products.csv');
  });
});

describe('importFileParser handler', () => {
  beforeEach(() => {
    s3Mock.reset();
    sqsMock.reset();
    sqsMock.on(SendMessageCommand).resolves({ MessageId: 'test-id' });
    process.env.IMPORT_BUCKET_NAME = 'test-bucket';
    process.env.SQS_QUEUE_URL = 'https://sqs.ap-south-1.amazonaws.com/123456789012/catalogItemsQueue';
  });

  afterEach(() => {
    process.env.IMPORT_BUCKET_NAME = 'test-bucket';
  });

  afterAll(() => {
    delete process.env.IMPORT_BUCKET_NAME;
    delete process.env.SQS_QUEUE_URL;
  });

  it('parses CSV, logs records, and moves file to parsed/', async () => {
    const csvContent = 'name,price\nProduct A,10\n';
    s3Mock
      .on(GetObjectCommand)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .resolves({ Body: makeReadable(csvContent) as any });
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectCommand).resolves({});

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await handler(buildS3Event('uploaded/products.csv'));

    expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(1);
    expect(s3Mock.commandCalls(CopyObjectCommand)).toHaveLength(1);
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(1);
    logSpy.mockRestore();
  });

  it('decodes URL-encoded S3 keys (spaces via +)', async () => {
    s3Mock
      .on(GetObjectCommand)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .resolves({ Body: makeReadable('name,price\nA,1\n') as any });
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectCommand).resolves({});

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await handler(buildS3Event('uploaded/my+file.csv'));

    const getCall = s3Mock.commandCalls(GetObjectCommand)[0];
    expect(getCall.args[0].input.Key).toBe('uploaded/my file.csv');
    logSpy.mockRestore();
  });
});
