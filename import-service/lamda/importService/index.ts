import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const s3Client = new S3Client({});

const buildResponse = (statusCode: number, body: string): APIGatewayProxyResult => ({
  statusCode,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
  },
  body,
});

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const IMPORT_BUCKET_NAME = process.env.IMPORT_BUCKET_NAME;
    const fileName = event.queryStringParameters?.name;

    if (!fileName) {
      return buildResponse(400, 'Missing required query parameter: name');
    }

    if (!IMPORT_BUCKET_NAME) {
      console.error('Missing IMPORT_BUCKET_NAME environment variable');
      return buildResponse(500, 'Import bucket is not configured');
    }

    const command = new PutObjectCommand({
      Bucket: IMPORT_BUCKET_NAME,
      Key: `uploaded/${fileName}`,
      ContentType: 'text/csv',
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    return buildResponse(200, signedUrl);
  } catch (error) {
    console.error('Failed to generate signed URL', error);
    return buildResponse(500, 'Internal server error');
  }
};