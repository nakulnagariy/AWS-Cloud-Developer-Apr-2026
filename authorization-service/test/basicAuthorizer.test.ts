import { handler } from '../lambda/basicAuthorizer/index';
import type { APIGatewayTokenAuthorizerEvent } from 'aws-lambda';

const mockMethodArn = 'arn:aws:execute-api:us-east-1:123456789:api/stage/GET/import';

const buildEvent = (token: string): APIGatewayTokenAuthorizerEvent => ({
  type: 'TOKEN',
  authorizationToken: token,
  methodArn: mockMethodArn,
});

describe('basicAuthorizer', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, testuser: 'TEST_PASSWORD' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws Unauthorized when no token is provided', async () => {
    const event = buildEvent('');
    await expect(handler(event)).rejects.toThrow('Unauthorized');
  });

  it('throws Unauthorized when token is not Basic scheme', async () => {
    const token = 'Bearer sometoken';
    await expect(handler(buildEvent(token))).rejects.toThrow('Unauthorized');
  });

  it('throws Unauthorized when base64 decodes to missing username', async () => {
    // Encode ":TEST_PASSWORD" — no username
    const token = `Basic ${Buffer.from(':TEST_PASSWORD').toString('base64')}`;
    await expect(handler(buildEvent(token))).rejects.toThrow('Unauthorized');
  });

  it('returns Deny policy for unknown username (403 behavior)', async () => {
    const token = `Basic ${Buffer.from('unknownuser:TEST_PASSWORD').toString('base64')}`;
    const result = await handler(buildEvent(token));
    expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
    expect(result.principalId).toBe('unknownuser');
  });

  it('returns Deny policy for wrong password (403 behavior)', async () => {
    const token = `Basic ${Buffer.from('testuser:WRONG_PASSWORD').toString('base64')}`;
    const result = await handler(buildEvent(token));
    expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
  });

  it('returns Allow policy for valid credentials', async () => {
    const token = `Basic ${Buffer.from('testuser:TEST_PASSWORD').toString('base64')}`;
    const result = await handler(buildEvent(token));
    expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    expect(result.principalId).toBe('testuser');
  });

  it('sets the correct resource in the policy', async () => {
    const token = `Basic ${Buffer.from('testuser:TEST_PASSWORD').toString('base64')}`;
    const result = await handler(buildEvent(token));
    const statement = result.policyDocument.Statement[0] as { Resource: string };
    expect(statement.Resource).toBe(mockMethodArn);
  });
});
