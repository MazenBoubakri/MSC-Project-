import fs from 'node:fs/promises';
import { UTApi } from 'uploadthing/server';

import { UPLOADTHING_TOKEN } from '../config/env.js';

let client = null;

function getClient() {
  if (!UPLOADTHING_TOKEN) return null;
  if (!client) client = new UTApi({ token: UPLOADTHING_TOKEN });
  return client;
}

// Proxies a file already saved to disk by multer to UploadThing and returns
// the public utfs.io URL. Returns null when UploadThing is not configured
// (caller keeps the local file). Throws on upload failure (caller falls back).
export async function uploadToUploadThing({ path, name, type }) {
  const utapi = getClient();
  if (!utapi) return null;

  const bytes = await fs.readFile(path);
  const file = new File([bytes], name, { type });
  const res = await utapi.uploadFiles(file, { contentDisposition: 'inline' });

  if (res.error || !res.data?.url) {
    throw new Error(res.error?.message ?? 'UploadThing upload failed');
  }
  return res.data.url;
}
