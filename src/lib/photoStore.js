import { useState, useEffect } from 'react';
import { photoUrl } from './closetApi';

/* ============================================================
   PHOTOS — clothing photos are compressed in the browser, then
   stored in Supabase Storage (see closetApi.js).
============================================================ */
// Compress an image File / data URL → JPEG blob, longest side ≤ maxDim, @ 0.85 quality.
// Returns { blob, width, height }.
export function compressImage(source, maxDim = 1000, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let createdUrl = null;
    const cleanup = () => { if (createdUrl) { URL.revokeObjectURL(createdUrl); createdUrl = null; } };
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          cleanup();
          if (!blob) return reject(new Error('toBlob failed'));
          resolve({ blob, width: w, height: h });
        }, 'image/jpeg', quality);
      } catch (e) { cleanup(); reject(e); }
    };
    img.onerror = () => { cleanup(); reject(new Error('image load failed')); };
    if (source instanceof Blob) { createdUrl = URL.createObjectURL(source); img.src = createdUrl; }
    else img.src = source;
  });
}

// Resolves an item's photo to something an <img> can show: a signed URL for
// photos in Supabase (photoPath), or an inline data/blob URL (photo).
export function usePhotoUrl(item) {
  const [url, setUrl] = useState(item?.photo || null);
  useEffect(() => {
    let cancelled = false;
    if (item?.photo) { setUrl(item.photo); return; }
    if (!item?.photoPath) { setUrl(null); return; }
    photoUrl(item.photoPath)
      .then(u => { if (!cancelled) setUrl(u); })
      .catch(() => { if (!cancelled) setUrl(null); });
    return () => { cancelled = true; };
  }, [item?.photoPath, item?.photo]);
  return url;
}
