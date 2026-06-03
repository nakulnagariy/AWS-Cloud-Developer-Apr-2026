import type {
  APIGatewayTokenAuthorizerEvent,
  APIGatewayAuthorizerResult,
  StatementEffect,
} from 'aws-lambda';

const generatePolicy = (
  principalId: string,
  effect: StatementEffect,
  resource: string,
): APIGatewayAuthorizerResult => ({
  principalId,
  policyDocument: {
    Version: '2012-10-17',
    Statement: [
      {
        Action: 'execute-api:Invoke',
        Effect: effect,
        Resource: resource,
      },
    ],
  },
});

export const handler = async (
  event: APIGatewayTokenAuthorizerEvent,
): Promise<APIGatewayAuthorizerResult> => {
  console.log('basicAuthorizer event:', JSON.stringify(event));

  const token = event.authorizationToken;

  // No authorization token provided → 401
  if (!token) {
    throw new Error('Unauthorized');
  }

  const parts = token.split(' ');

  // Token must be "Basic <base64>"
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'basic' || !parts[1]) {
    throw new Error('Unauthorized');
  }

  let username: string;
  let password: string;

  try {
    const decoded = Buffer.from(parts[1], 'base64').toString('utf-8');
    [username, password] = decoded.split(':');
  } catch {
    throw new Error('Unauthorized');
  }

  if (!username || !password) {
    throw new Error('Unauthorized');
  }

  const storedPassword = process.env[username];

  // Credentials not found or password mismatch → 403
  if (!storedPassword || storedPassword !== password) {
    return generatePolicy(username, 'Deny', event.methodArn);
  }

  // Valid credentials → Allow
  return generatePolicy(username, 'Allow', event.methodArn);
};
