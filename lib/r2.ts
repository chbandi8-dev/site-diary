import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
/**
 * Cloudflare R2 via the S3 API.
 *
 * The bucket is PRIVATE. Nothing is served from a public URL — every read goes
 * through a short-lived signed GET. Photo keys are unguessable, but an
 * unguessable URL is not an access control, and these are other people's homes.
 */

const BUCKET = process.env.R2_BUCKET!;
const TTL_SECONDS = 60 * 10;

let client: S3Client | null = null;

function r2(): S3Client {
  if (client) return client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY."
    );
  }

  client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}

/**
 * Keys are namespaced by house so a stray `list` can never span two clients,
 * and dated so the bucket stays browsable by a human debugging a bad upload.
 */
/**
 * Derived entirely from ids the server controls. Namespaced by house so a stray
 * `list` can never span two clients, and keyed by the photo's own id so a retry
 * overwrites itself rather than creating a duplicate.
 */
export function photoKey(houseId: string, photoId: string, ext: string): string {
  return `houses/${houseId}/photos/${photoId}.${ext}`;
}

export function documentKey(houseId: string, documentId: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  return `houses/${houseId}/documents/${documentId}-${safe}`;
}

/**
 * Presigned PUT. Both `contentType` and `contentLength` are part of the
 * signature, so the client can upload exactly the bytes it declared and
 * nothing else.
 */
export function signUpload(
  key: string,
  contentType: string,
  contentLength: number
): Promise<string> {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    }),
    { expiresIn: TTL_SECONDS }
  );
}

/** Does the object actually exist? Used to confirm an upload before trusting it. */
export async function objectExists(key: string): Promise<boolean> {
  try {
    await r2().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/** Presigned GET, for rendering a photo the caller has already been authorised to see. */
export function signDownload(key: string): Promise<string> {
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: TTL_SECONDS,
  });
}

/**
 * Server-side upload. Used for owner photos, which arrive one at a time and are
 * processed here rather than in the browser — it is the only way to be certain
 * the EXIF block, and the home's GPS coordinates in it, are actually gone.
 */
export async function putObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await r2().send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType })
  );
}

export async function deleteObject(key: string): Promise<void> {
  await r2().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export const R2_SIGNED_URL_TTL_SECONDS = TTL_SECONDS;
