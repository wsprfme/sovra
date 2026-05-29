import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { generateThumbnail, isImageMime, THUMBNAIL_MAX } from './thumbnail.js';

describe('thumbnail generation', () => {
  it('detects image mime types', () => {
    expect(isImageMime('image/png')).toBe(true);
    expect(isImageMime('text/plain')).toBe(false);
  });

  it('produces a downscaled webp thumbnail from a larger image', async () => {
    const source = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 10, g: 120, b: 200 } },
    })
      .png()
      .toBuffer();

    const thumb = await generateThumbnail(new Uint8Array(source));
    const meta = await sharp(thumb).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBeLessThanOrEqual(THUMBNAIL_MAX);
    expect(meta.height).toBeLessThanOrEqual(THUMBNAIL_MAX);
    expect(thumb.byteLength).toBeGreaterThan(0);
  });
});
