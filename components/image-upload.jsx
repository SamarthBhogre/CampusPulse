'use client';

import { useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Upload, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

export default function ImageUpload({ value, onChange }) {
  const supabase = getSupabaseBrowserClient();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function upload(file) {
    if (!file) return;
    const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);
    if (!allowedTypes.has(file.type)) return toast.error('Please choose a PNG, JPG, WEBP, or GIF image');
    if (file.size > 5 * 1024 * 1024) return toast.error('File must be under 5 MB');
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('You must be signed in');
      const extByType = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/webp': 'webp',
        'image/gif': 'gif',
      };
      const ext = extByType[file.type] || 'jpg';
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from('event-covers').upload(path, file, {
        cacheControl: '3600', upsert: false, contentType: file.type,
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from('event-covers').getPublicUrl(path);
      onChange(pub.publicUrl);
      toast.success('Image uploaded');
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {value ? (
        <div className="relative rounded-lg overflow-hidden border border-border group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="cover" className="w-full aspect-video object-cover" />
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-background/80 backdrop-blur hover:bg-background transition"
            aria-label="Remove image"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 text-white text-sm transition"
          >
            Replace image
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files?.[0]); }}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-sm">Uploading…</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <ImageIcon className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-foreground">Drop an image or click to upload</p>
              <p className="text-xs">PNG, JPG or WEBP • up to 5 MB</p>
            </div>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => upload(e.target.files?.[0])}
      />
      {value && (
        <div className="mt-2 flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => inputRef.current?.click()} className="gap-2">
            <Upload className="w-3.5 h-3.5" /> Replace
          </Button>
        </div>
      )}
    </div>
  );
}
