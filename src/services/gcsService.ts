import { Storage } from '@google-cloud/storage';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'harx-training-files';

let storage: Storage | null = null;

function getStorage(): Storage {
  if (storage) return storage;

  const credentialsEnv = process.env.CLOUD_STORAGE_CREDENTIALS;
  if (!credentialsEnv) {
    throw new Error('CLOUD_STORAGE_CREDENTIALS env variable is not set');
  }

  let credentials: any;
  try {
    credentials = JSON.parse(credentialsEnv);
  } catch (e) {
    throw new Error('CLOUD_STORAGE_CREDENTIALS is not valid JSON');
  }

  storage = new Storage({
    projectId: credentials.project_id,
    credentials,
  });

  return storage;
}

export interface GCSUploadResult {
  url: string;
  publicId: string;
}

/**
 * Upload a buffer or file to Google Cloud Storage
 */
export async function uploadToGCS(
  fileBuffer: Buffer,
  originalName: string,
  mimeType: string,
  folder: string = 'trainings'
): Promise<GCSUploadResult> {
  const gcs = getStorage();
  const bucket = gcs.bucket(BUCKET_NAME);

  const ext = path.extname(originalName) || '';
  const uniqueId = uuidv4();
  const destFileName = `${folder}/${uniqueId}${ext}`;

  const file = bucket.file(destFileName);
  await file.save(fileBuffer, {
    metadata: {
      contentType: mimeType,
    },
    resumable: false,
  });

  // Make the file public
  await file.makePublic();

  const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${destFileName}`;
  return {
    url: publicUrl,
    publicId: destFileName,
  };
}

/**
 * Upload an Express Multer file to GCS
 */
export async function uploadMulterFileToGCS(
  file: Express.Multer.File,
  folder: string = 'trainings'
): Promise<GCSUploadResult> {
  return uploadToGCS(file.buffer || require('fs').readFileSync(file.path), file.originalname, file.mimetype, folder);
}
