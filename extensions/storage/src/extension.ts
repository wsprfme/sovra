import { SovraError } from '@sovrasdk/contracts';
import type { ExtensionContext, ExtensionRouter, SovraExtension } from '@sovrasdk/extension-api';
import { StorageService } from './storage-service.js';
import { ShareService } from './share-service.js';
import { migrations } from './migrations.js';
import type { EncMeta, Visibility } from './types.js';

function quotaFromEnv(env: Readonly<Record<string, string>>): number {
  const raw = Number(env.SOVRA_QUOTA_BYTES);
  return Number.isFinite(raw) && raw > 0 ? raw : Number.MAX_SAFE_INTEGER;
}

export function createStorageExtension(): SovraExtension {
  return {
    migrations,
    activate(ctx: ExtensionContext, router: ExtensionRouter): void {
      if (!ctx.storage) {
        throw new SovraError('permission_denied', 'storage capability not granted');
      }
      const svc = new StorageService(ctx.db, ctx.storage, quotaFromEnv(ctx.env));
      const shareSvc = new ShareService(ctx.db);

      router.get('/files', (req) => {
        const path = req.query.path ?? '/';
        return { status: 200, body: { files: svc.list(path) } };
      });

      router.get('/usage', () => ({ status: 200, body: { usedBytes: svc.usedBytes() } }));

      router.post('/files', async (req) => {
        const body = req.body as {
          parentPath?: string;
          name?: string;
          mime?: string;
          visibility?: Visibility;
          contentBase64?: string;
          encMeta?: EncMeta | null;
        };
        if (!body.name || !body.contentBase64) {
          throw new SovraError('upload_incomplete', 'name and content required');
        }
        const content = new Uint8Array(Buffer.from(body.contentBase64, 'base64'));
        const file = await svc.upload({
          parentPath: body.parentPath ?? '/',
          name: body.name,
          content,
          mime: body.mime ?? 'application/octet-stream',
          visibility: body.visibility,
          encMeta: body.encMeta ?? null,
        });
        ctx.audit.record('file.upload', 'ok', { id: file.id });
        return { status: 200, body: file };
      });

      router.post('/folders', (req) => {
        const body = req.body as { path?: string; name?: string };
        if (!body.name) throw new SovraError('validation_error', 'name required');
        const folder = svc.createFolder(body.path ?? '/', body.name);
        return { status: 200, body: folder };
      });

      router.post('/files/:id/move', (req) => {
        const id = req.params.id ?? req.query.id ?? '';
        const body = req.body as { parentPath?: string };
        if (!body.parentPath) throw new SovraError('validation_error', 'parentPath required');
        return { status: 200, body: svc.move(id, body.parentPath) };
      });

      router.post('/files/:id/trash', (req) => {
        const id = req.params.id ?? req.query.id ?? '';
        svc.trash(id);
        ctx.audit.record('file.trash', 'ok', { id });
        return { status: 200, body: { ok: true } };
      });

      router.post('/files/:id/restore', (req) => {
        const id = req.params.id ?? req.query.id ?? '';
        return { status: 200, body: svc.restore(id) };
      });

      router.post('/albums', (req) => {
        const body = req.body as { name?: string };
        if (!body.name) throw new SovraError('validation_error', 'name required');
        return { status: 200, body: svc.createAlbum(body.name) };
      });

      router.get('/albums', () => ({ status: 200, body: { albums: svc.listAlbums() } }));

      router.get('/albums/:id/items', (req) => {
        const id = req.params.id ?? req.query.id ?? '';
        return { status: 200, body: { files: svc.albumItems(id) } };
      });

      router.post('/albums/:id/items', (req) => {
        const id = req.params.id ?? req.query.id ?? '';
        const body = req.body as { fileId?: string };
        if (!body.fileId) throw new SovraError('validation_error', 'fileId required');
        svc.addToAlbum(id, body.fileId);
        return { status: 200, body: { ok: true } };
      });

      router.post('/shares', (req) => {
        const body = req.body as {
          targetType?: 'file' | 'album';
          targetId?: string;
          mode?: 'public' | 'restricted';
          allowedIdentities?: string[];
          expiresInSeconds?: number;
          wrappedKey?: string;
        };
        if (!body.targetType || !body.targetId || !body.mode) {
          throw new SovraError('validation_error', 'targetType, targetId, mode required');
        }
        const link = shareSvc.create({
          targetType: body.targetType,
          targetId: body.targetId,
          mode: body.mode,
          allowedIdentities: body.allowedIdentities,
          expiresInSeconds: body.expiresInSeconds,
          wrappedKey: body.wrappedKey,
        });
        ctx.audit.record('share.create', 'ok', { token: link.token });
        return { status: 200, body: link };
      });

      router.delete('/shares/:token', (req) => {
        const token = req.params.token ?? req.query.token ?? '';
        shareSvc.revoke(token);
        ctx.audit.record('share.revoke', 'ok', { token });
        return { status: 200, body: { ok: true } };
      });

      router.public.get('/s/:token', (req) => {
        const token = req.params.token ?? req.query.token ?? '';
        const identity = req.query.identity;
        const resolved = shareSvc.resolve(token, identity);
        let file = null;
        if (resolved.share.targetType === 'file') {
          file = svc.fileMeta(resolved.share.targetId);
        }
        const files =
          resolved.share.targetType === 'album' ? svc.albumItems(resolved.share.targetId) : [];
        return { status: 200, body: { ...resolved, file, files } };
      });
    },
    deactivate(): void {},
  };
}
