import sharp from 'sharp';

export const THUMBNAIL_MAX = 320;

export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/');
}

export async function generateThumbnail(content: Uint8Array): Promise<Uint8Array> {
  const out = await sharp(content)
    .rotate()
    .resize(THUMBNAIL_MAX, THUMBNAIL_MAX, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  return new Uint8Array(out);
}
