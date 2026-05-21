import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import csv from 'csv-parser';
import { Readable } from 'node:stream';
import type { S3Event } from 'aws-lambda';

const s3Client = new S3Client({});

type StreamBody = {
  transformToWebStream?: () => ReadableStream;
};

export const toNodeReadable = (body: unknown): Readable => {
  if (!body) {
    throw new Error('S3 object body is empty');
  }

  if (body instanceof Readable) {
    return body;
  }

  const maybeStreamBody = body as StreamBody;
  if (typeof maybeStreamBody.transformToWebStream === 'function') {
    return Readable.fromWeb(maybeStreamBody.transformToWebStream() as globalThis.ReadableStream);
  }

  throw new Error('Unsupported S3 object body type');
};

export const parseCsvStream = async (stream: Readable): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    stream
      .pipe(csv())
      .on('data', (record: Record<string, string>) => {
        console.log('CSV record:', JSON.stringify(record));
      })
      .on('end', () => resolve())
      .on('error', (error: unknown) => reject(error));
  });
};

export const moveFileToParsed = async (bucket: string, key: string): Promise<void> => {
  const parsedKey = key.replace(/^uploaded\//, 'parsed/');

  await s3Client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${key}`,
      Key: parsedKey,
    }),
  );

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );

  console.log(`Moved ${key} → ${parsedKey}`);
};

export const handler = async (event: S3Event): Promise<void> => {
  const IMPORT_BUCKET_NAME = process.env.IMPORT_BUCKET_NAME;

  if (!IMPORT_BUCKET_NAME) {
    throw new Error('Missing IMPORT_BUCKET_NAME environment variable');
  }

  for (const record of event.Records) {
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: IMPORT_BUCKET_NAME,
        Key: key,
      }),
    );

    const stream = toNodeReadable(response.Body);
    await parseCsvStream(stream);
    await moveFileToParsed(IMPORT_BUCKET_NAME, key);
  }
};
