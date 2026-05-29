import type { FastifyInstance } from 'fastify';
import { SovraError, authModeSchema } from '@sovra/contracts';
import type { Services } from '../services.js';

interface SessionBody {
  token?: string;
}

function requireAccount(services: Services, headers: Record<string, unknown>): string {
  const token = headers['x-sovra-session'];
  return services.auth.requireSession(typeof token === 'string' ? token : undefined);
}

export function registerInternalRoutes(app: FastifyInstance, services: Services): void {
  app.get('/internal/status', async () => ({
    hasAccount: services.auth.hasAccount(),
    schemaVersion: 1,
  }));

  app.post('/internal/setup', async (req) => {
    const body = req.body as {
      username?: string;
      authMode?: string;
      password?: string;
      pubkey?: string;
    };
    const authMode = authModeSchema.parse(body.authMode);
    if (!body.username) {
      throw new SovraError('validation_error', 'username required');
    }
    const id = services.auth.createAccount({
      username: body.username,
      authMode,
      password: body.password,
      pubkey: body.pubkey,
    });
    services.audit.record('account.create', body.username, 'ok', { authMode });
    return { accountId: id };
  });

  app.post('/internal/login', async (req) => {
    const body = req.body as {
      username?: string;
      password?: string;
      challenge?: string;
      signature?: string;
    };
    const source = req.ip;
    if (!body.username) throw new SovraError('validation_error', 'username required');
    let token: string;
    if (body.password !== undefined) {
      token = services.auth.loginWithPassword(body.username, body.password, source);
    } else if (body.challenge && body.signature) {
      token = services.auth.loginWithSignature(body.username, body.challenge, body.signature, source);
    } else {
      throw new SovraError('validation_error', 'credentials required');
    }
    services.audit.record('account.login', body.username, 'ok');
    return { token };
  });

  app.post('/internal/logout', async (req) => {
    const body = req.body as SessionBody;
    if (body.token) services.auth.sessions.revoke(body.token);
    return { ok: true };
  });

  app.get('/internal/files', async (req) => {
    requireAccount(services, req.headers as Record<string, unknown>);
    const path = (req.query as { path?: string }).path ?? '/';
    return { files: services.storage.list(path) };
  });

  app.post('/internal/files/:id/move', async (req) => {
    requireAccount(services, req.headers as Record<string, unknown>);
    const { id } = req.params as { id: string };
    const body = req.body as { parentPath?: string };
    if (!body.parentPath) throw new SovraError('validation_error', 'parentPath required');
    return services.storage.move(id, body.parentPath);
  });

  app.post('/internal/files/:id/trash', async (req) => {
    requireAccount(services, req.headers as Record<string, unknown>);
    const { id } = req.params as { id: string };
    services.storage.trash(id);
    return { ok: true };
  });

  app.post('/internal/files/:id/restore', async (req) => {
    requireAccount(services, req.headers as Record<string, unknown>);
    const { id } = req.params as { id: string };
    return services.storage.restore(id);
  });

  app.post('/internal/albums', async (req) => {
    requireAccount(services, req.headers as Record<string, unknown>);
    const body = req.body as { name?: string };
    if (!body.name) throw new SovraError('validation_error', 'name required');
    return services.storage.createAlbum(body.name);
  });

  app.post('/internal/albums/:id/items', async (req) => {
    requireAccount(services, req.headers as Record<string, unknown>);
    const { id } = req.params as { id: string };
    const body = req.body as { fileId?: string };
    if (!body.fileId) throw new SovraError('validation_error', 'fileId required');
    services.storage.addToAlbum(id, body.fileId);
    return { ok: true };
  });

  app.post('/internal/shares', async (req) => {
    requireAccount(services, req.headers as Record<string, unknown>);
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
    const link = services.shares.create({
      targetType: body.targetType,
      targetId: body.targetId,
      mode: body.mode,
      allowedIdentities: body.allowedIdentities,
      expiresInSeconds: body.expiresInSeconds,
      wrappedKey: body.wrappedKey,
    });
    services.audit.record('share.create', 'admin', 'ok', { token: link.token });
    return link;
  });

  app.delete('/internal/shares/:token', async (req) => {
    requireAccount(services, req.headers as Record<string, unknown>);
    const { token } = req.params as { token: string };
    services.shares.revoke(token);
    services.audit.record('share.revoke', 'admin', 'ok', { token });
    return { ok: true };
  });

  app.get('/internal/extensions', async (req) => {
    requireAccount(services, req.headers as Record<string, unknown>);
    return { extensions: services.extensions.list() };
  });

  app.get('/internal/audit', async (req) => {
    requireAccount(services, req.headers as Record<string, unknown>);
    const action = (req.query as { action?: string }).action;
    return { entries: services.audit.list(action ? { action } : {}) };
  });

  app.post('/internal/backup', async (req) => {
    requireAccount(services, req.headers as Record<string, unknown>);
    const body = req.body as { outputPath?: string };
    if (!body.outputPath) throw new SovraError('validation_error', 'outputPath required');
    const manifest = await services.backup.create(body.outputPath);
    services.audit.record('backup.create', 'admin', 'ok', { path: body.outputPath });
    return manifest;
  });

  app.post('/internal/restore', async (req) => {
    requireAccount(services, req.headers as Record<string, unknown>);
    const body = req.body as { archivePath?: string };
    if (!body.archivePath) throw new SovraError('validation_error', 'archivePath required');
    const manifest = await services.backup.restore(body.archivePath, {
      dbPath: services.config.dbPath,
      contentDir: services.config.contentDir,
    });
    services.audit.record('backup.restore', 'admin', 'ok', { path: body.archivePath });
    return manifest;
  });
}
