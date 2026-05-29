import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SovraError } from '@sovrasdk/contracts';
import type { Services } from '../services.js';

function isControlHost(req: FastifyRequest, services: Services): boolean {
  const host = (req.headers.host ?? '').split(':')[0] ?? '';
  if (host === '' || host === 'localhost' || host === '127.0.0.1') return true;
  if (services.config.serverIp && host === services.config.serverIp) return true;
  if (services.config.primaryDomain && host === services.config.primaryDomain) return true;
  return false;
}

export function registerPublicRoutes(app: FastifyInstance, services: Services): void {
  app.get('/blob/:cid', async (req, reply) => {
    const { cid } = req.params as { cid: string };
    const bytes = await services.store.get(cid);
    reply.header('content-type', 'application/octet-stream');
    return reply.send(Buffer.from(bytes));
  });

  app.all('/ext/:id/*', async (req) => {
    const { id } = req.params as { id: string; '*': string };
    const wildcard = (req.params as Record<string, string>)['*'] ?? '';
    const path = '/' + wildcard;
    const method = req.method.toLowerCase() as 'get' | 'post' | 'delete';
    return services.extensions.registry.dispatch(
      id,
      method,
      path,
      {
        params: {},
        query: req.query as Record<string, string>,
        body: req.body ?? null,
        headers: req.headers as Record<string, string>,
      },
      { allowPublicOnly: true },
    );
  });

  app.get('/_tls/authorize', async (req, reply) => {
    const host = (req.query as { domain?: string }).domain;
    if (host && services.proxy.authorizeTls(host)) {
      return reply.code(200).send('ok');
    }
    return reply.code(403).send('denied');
  });

  app.setNotFoundHandler(async (req: FastifyRequest, reply: FastifyReply) => {
    if (isControlHost(req, services)) {
      reply.code(404).send(new SovraError('not_found', 'not found').toJSON());
      return;
    }
    const host = (req.headers.host ?? '').split(':')[0] ?? '';
    const url = new URL(req.url, 'http://placeholder');
    const result = await services.extensions.registry.hostDispatch({
      host,
      path: url.pathname,
      params: {},
      query: Object.fromEntries(url.searchParams) as Record<string, string>,
      body: null,
      headers: req.headers as Record<string, string>,
    });
    if (!result) {
      reply.code(404).send(new SovraError('not_found', `no site bound to ${host}`).toJSON());
      return;
    }
    if (result.headers) {
      for (const [k, v] of Object.entries(result.headers)) reply.header(k, v);
    }
    if (result.body instanceof Uint8Array || Buffer.isBuffer(result.body)) {
      reply.code(result.status).send(Buffer.from(result.body as Uint8Array));
      return;
    }
    reply.code(result.status).send(result.body);
  });
}
