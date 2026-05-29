import type { FastifyInstance } from 'fastify';
import { SovraError, authModeSchema, permissionSchema, type Permission } from '@sovra/contracts';
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
    schemaVersion: 2,
    primaryDomain: services.config.primaryDomain,
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

  app.get('/internal/extensions', async (req) => {
    requireAccount(services, req.headers as Record<string, unknown>);
    return { extensions: services.extensions.list() };
  });

  app.get('/internal/extensions/catalog', async (req) => {
    requireAccount(services, req.headers as Record<string, unknown>);
    return { catalog: services.extensions.available() };
  });

  app.post('/internal/extensions/install', async (req) => {
    requireAccount(services, req.headers as Record<string, unknown>);
    const body = req.body as { id?: string };
    if (!body.id) throw new SovraError('validation_error', 'id required');
    const record = services.extensions.installFromCatalog(body.id);
    return record;
  });

  app.post('/internal/extensions/:id/enable', async (req) => {
    requireAccount(services, req.headers as Record<string, unknown>);
    const { id } = req.params as { id: string };
    const body = req.body as { permissions?: string[] };
    const approved: Permission[] = (body.permissions ?? []).map((p) => permissionSchema.parse(p));
    await services.extensions.enable(id, approved);
    return { ok: true };
  });

  app.post('/internal/extensions/:id/disable', async (req) => {
    requireAccount(services, req.headers as Record<string, unknown>);
    const { id } = req.params as { id: string };
    await services.extensions.disable(id);
    return { ok: true };
  });

  app.delete('/internal/extensions/:id', async (req) => {
    requireAccount(services, req.headers as Record<string, unknown>);
    const { id } = req.params as { id: string };
    const deleteData = (req.query as { deleteData?: string }).deleteData === 'true';
    await services.extensions.uninstall(id, { deleteData });
    return { ok: true };
  });

  app.all('/internal/ext/:id/*', async (req) => {
    requireAccount(services, req.headers as Record<string, unknown>);
    const { id } = req.params as { id: string; '*': string };
    const wildcard = (req.params as Record<string, string>)['*'] ?? '';
    const path = '/' + wildcard;
    const method = req.method.toLowerCase() as 'get' | 'post' | 'delete';
    return services.extensions.registry.dispatch(id, method, path, {
      params: {},
      query: req.query as Record<string, string>,
      body: req.body ?? null,
      headers: req.headers as Record<string, string>,
    });
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
