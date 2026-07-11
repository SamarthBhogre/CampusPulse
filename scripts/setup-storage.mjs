// Creates the 'event-covers' public bucket on Supabase Storage
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing env vars'); process.exit(1); }

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const bucketId = 'event-covers';
const { data: buckets } = await admin.storage.listBuckets();
const exists = buckets?.some((b) => b.id === bucketId);

if (!exists) {
  const { error } = await admin.storage.createBucket(bucketId, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'],
  });
  if (error) { console.error(error); process.exit(1); }
  console.log(`Created bucket '${bucketId}' (public).`);
} else {
  await admin.storage.updateBucket(bucketId, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'],
  });
  console.log(`Bucket '${bucketId}' already exists (updated settings).`);
}
console.log('Done.');
