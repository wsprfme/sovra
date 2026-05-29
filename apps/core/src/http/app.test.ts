import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { createServices, type Services } from '../services.js';

let services: Services;
let app: FastifyInstance;
let dir: string;
const TOKEN = 'test-internal-token';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sovra-http-'));
  services = createServices({
    dbPath: ':memory:',
    contentDir: join(dir, 'content'),
    host: '127.0.0.1',
    port: 0,
    internalToken: TOKEN,
    quotaBytes: Number.MAX_SAFE_INTEGER,
  });
  app = buildApp(services);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  services.close();
  await rm(dir, { recursive: true, force: true });
});

const internal = { 'x-sovra-internal': TOKEN };

describe('internal token guard', () => {
  it('rejects internal routes without the token', async () => {
    const res = await app.inject({ method: 'GET', url: '/internal/status' });
    expect(res.statusCode).toBe(401);
  });

  it('allows internal routes with the token', async () => {
    const res = await app.inject({ method: 'GET', url: '/internal/status', headers: internal });
    expect(res.statusCode).toBe(200);
    expect(res.json().hasAccount).toBe(false);
  });
});

describe('end-to-end flow', () => {
  it('setup, login, upload, fetch blob, share', async () => {
    const setup = await app.inject({
      method: 'POST',
      url: '/internal/setup',
      headers: internal,
      payload: { username: 'admin', authMode: 'password', password: 'longpassword' },
    });
    expect(setup.statusCode).toBe(200);

    const login = await app.inject({
      method: 'POST',
      url: '/internal/login',
      headers: internal,
      payload: { username: 'admin', password: 'longpassword' },
    });
    const token = login.json().token as string;
    expect(token).toBeTruthy();

    const content = Buffer.from('hello sovra').toString('base64');
    const upload = await app.inject({
      method: 'POST',
      url: '/upload',
      headers: { 'x-sovra-session': token },
      payload: { name: 'note.txt', mime: 'text/plain', visibility: 'public', contentBase64: content },
    });
    expect(upload.statusCode).toBe(200);
    const cid = upload.json().cid as string;

    const blob = await app.inject({ method: 'GET', url: `/blob/${cid}` });
    expect(blob.statusCode).toBe(200);
    expect(blob.rawPayload.toString()).toBe('hello sovra');

    const fileId = upload.json().id as string;
    const share = await app.inject({
      method: 'POST',
      url: '/internal/shares',
      headers: { ...internal, 'x-sovra-session': token },
      payload: { targetType: 'file', targetId: fileId, mode: 'public' },
    });
    expect(share.statusCode).toBe(200);
    const shareToken = share.json().token as string;
    const resolved = await app.inject({ method: 'GET', url: `/s/${shareToken}` });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json().share.targetId).toBe(fileId);
  });

  it('rejects upload without a session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/upload',
      payload: { name: 'x.txt', contentBase64: Buffer.from('x').toString('base64') },
    });
    expect(res.statusCode).toBe(401);
  });
});
