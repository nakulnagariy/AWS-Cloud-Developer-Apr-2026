import { mockClient } from 'aws-sdk-client-mock';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { APIGatewayProxyEvent } from 'aws-lambda';

// Set env var before any module code can read it
process.env.IMPORT_BUCKET_NAME = 'test-bucket';

// Mock the presigner before importing the handler so the module-level client is captured
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

const s3Mock = mockClient(S3Client);
const mockGetSignedUrl = getSignedUrl as jest.Mock;

// Import handler AFTER mocks are in place
import { handler } from '../lamda/importService/index';

const buildEvent = (params?: Record<string, string>): APIGatewayProxyEvent =>
  ({
    queryStringParameters: params ?? null,
    headers: {},
    body: null,
    isBase64Encoded: false,
    pathParameters: null,
    stageVariables: null,
    requestContext: {},
    resource: '',
    path: '/import',
    httpMethod: 'GET',
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
  } as unknown as APIGatewayProxyEvent);

describe('importProductsFile handler', () => {
  beforeEach(() => {
    s3Mock.reset();
    jest.resetAllMocks();
    process.env.IMPORT_BUCKET_NAME = 'test-bucket';
  });

  afterEach(() => {
    process.env.IMPORT_BUCKET_NAME = 'test-bucket';
  });

  afterAll(() => {
    delete process.env.IMPORT_BUCKET_NAME;
  });

  it('returns 400 when name query param is missing', async () => {
    const result = await handler(buildEvent());

    expect(result.statusCode).toBe(400);
    expect(result.body).toContain('name');
  });

  it('returns a signed URL string with status 200', async () => {
    const fakeUrl = 'https://s3.amazonaws.com/test-bucket/uploaded/products.csv?X-Amz-Signature=abc';
    mockGetSignedUrl.mockResolvedValue(fakeUrl);

    const result = await handler(buildEvent({ name: 'products.csv' }));

    expect(result.statusCode).toBe(200);
    expect(result.body).toBe(fakeUrl);
  });

  it('includes CORS headers in all responses', async () => {
    const result = await handler(buildEvent());

    expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
  });

  it('generates signed URL with correct S3 key (uploaded/fileName)', async () => {
    const fakeUrl = 'https://signed-url';
    mockGetSignedUrl.mockResolvedValue(fakeUrl);

    const result = await handler(buildEvent({ name: 'my-products.csv' }));

    expect(result.statusCode).toBe(200);
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
    // second arg to getSignedUrl is the PutObjectCommand — check its input
    const command = mockGetSignedUrl.mock.calls[0][1] as { input: { Key: string; Bucket: string } };
    expect(command.input.Key).toBe('uploaded/my-products.csv');
    expect(command.input.Bucket).toBe('test-bucket');
  });

  it('returns 500 on unexpected getSignedUrl error', async () => {
    mockGetSignedUrl.mockRejectedValue(new Error('AWS error'));

    const result = await handler(buildEvent({ name: 'products.csv' }));

    expect(result.statusCode).toBe(500);
  });
});
