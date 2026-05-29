import type { FastifyInstance } from 'fastify';
import { SovraError } from '@sovra/contracts';
import type { Services } from '../services.js';

export function registerPublicRoutes(app: FastifyInstance, services: Services): void {
  app.post('/upload', async (req) => {
    const session = req.headers['x-sovra-session'];
    services.auth.requireSession(typeof session === 'string' ? session : undefined);

    const body = req.body as {
      parentPath?: string;
      name?: string;
      mime?: string;
      visibility?: 'public' | 'private';
      contentBase64?: string;
      encMeta?: unknown;
    };
    if (!body.name || !body.contentBase64) {
      throw new SovraError('upload_incomplete', 'name and content required');
    }
    const content = new Uint8Array(Buffer.from(body.contentBase64, 'base64'));
    return services.storage.upload({
      parentPath: body.parentPath ?? '/',
      name: body.name,
      content,
      mime: body.mime ?? 'application/octet-stream',
      visibility: body.visibility,
      encMeta: (body.encMeta as never) ?? null,
    });
  });

  app.get('/blob/:cid', async (req, reply) => {
    const { cid } = req.params as { cid: string };
    const bytes = await services.store.get(cid);
    reply.header('content-type', 'application/octet-stream');
    return reply.send(Buffer.from(bytes));
  });

  app.get('/s/:token', async (req) => {
    const { token } = req.params as { token: string };
    const identity = (req.query as { identity?: string }).identity;
    const resolved = services.shares.resolve(token, identity);
    return resolved;
  });

  app.get('/_tls/authorize', async (req, reply) => {
    const host = (req.query as { domain?: string }).domain;
    if (host && services.proxy.authorizeTls(host)) {
      return reply.code(200).send('ok');
    }
    return reply.code(403).send('denied');
  });
}
