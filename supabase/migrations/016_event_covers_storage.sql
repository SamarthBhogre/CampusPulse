-- Configure the Storage bucket used by components/image-upload.jsx.
-- The database stores only the public URL in events.cover_image; image bytes
-- belong in Supabase Storage.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'event-covers',
  'event-covers',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public URLs need public read access. Uploads remain authenticated and are
-- restricted to a user's own folder: <auth.uid()>/<generated-file-name>.
drop policy if exists "event_covers_public_read" on storage.objects;
create policy "event_covers_public_read"
on storage.objects
for select
to public
using (bucket_id = 'event-covers');

drop policy if exists "event_covers_authenticated_insert" on storage.objects;
create policy "event_covers_authenticated_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'event-covers'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "event_covers_authenticated_update" on storage.objects;
create policy "event_covers_authenticated_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'event-covers'
  and owner_id = (select auth.uid()::text)
)
with check (
  bucket_id = 'event-covers'
  and owner_id = (select auth.uid()::text)
);

drop policy if exists "event_covers_authenticated_delete" on storage.objects;
create policy "event_covers_authenticated_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'event-covers'
  and owner_id = (select auth.uid()::text)
);
