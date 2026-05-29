import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { SovraError } from '@sovra/contracts';
import type { Services } from '../services.js';
import { registerInternalRoutes } from './internal-routes.js';
import { registerPublicRoutes } from './public-routes.js';
import { RateLimiter } from './rate-limit.js';

function sendError(reply: FastifyReply, err: unknown): void {
  if (SovraError.is(err)) {
    const status = httpStatusFor(err.code);
    reply.code(status).send(err.toJSON());
    return;
  }
  const wrapped = new SovraError('internal_error', 'unexpected error');
  reply.code(500).send(wrapped.toJSON());
}

function httpStatusFor(code: string): number {
  switch (code) {
    case 'unauthorized':
      return 401;
    case 'permission_denied':
      return 403;
    case 'not_found':
      return 404;
    case 'share_revoked':
      return 410;
    case 'quota_exceeded':
    case 'domain_conflict':
    case 'validation_error':
    case 'invalid_extension_manifest':
      return 400;
    case 'rate_limited':
      return 429;
    case 'auth_locked':
      return 423;
    default:
      return 500;
  }
}

export function buildApp(services: Services): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 * 1024 });

  app.decorate('services', services);

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err && typeof err === 'object' && 'validation' in err && err.validation) {
      const message = 'message' in err ? String((err as { message: unknown }).message) : 'invalid request';
      sendError(reply, new SovraError('validation_error', message));
      return;
    }
    sendError(reply, err);
  });

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.url.startsWith('/internal/')) {
      const token = req.headers['x-sovra-internal'];
      if (token !== services.config.internalToken) {
        sendError(reply, new SovraError('unauthorized', 'invalid internal token'));
      }
    }
  });

  const publicLimiter = new RateLimiter(services.config.rateLimit);
  const isPublicLimited = (url: string): boolean =>
    url.startsWith('/s/') || url.startsWith('/upload') || url.startsWith('/internal/login');

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!isPublicLimited(req.url)) return;
    const result = publicLimiter.check(req.ip);
    if (!result.allowed) {
      reply.header('retry-after', Math.ceil(result.retryAfterMs / 1000));
      reply.header('x-ratelimit-reset', String(Date.now() + result.retryAfterMs));
      sendError(reply, new SovraError('rate_limited', 'too many requests'));
    }
  });

  registerInternalRoutes(app, services);
  registerPublicRoutes(app, services);

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    services: Services;
  }
}
