import type { ExtensionContext, ExtensionRouter, SovraExtension } from '@sovra/extension-api';
import type { Db } from '@sovra/core';
import { VpsService, type Encryptor } from './vps-service.js';
import { Ssh2Client } from './ssh.js';

export interface VpsDeps {
  db: Db;
  encryptor: Encryptor;
}

export function createVpsExtension(deps: VpsDeps): SovraExtension {
  const service = new VpsService(deps.db, new Ssh2Client(), deps.encryptor);

  return {
    activate(ctx: ExtensionContext, router: ExtensionRouter): void {
      router.post('/connections', async (req) => {
        const body = req.body as {
          host?: string;
          port?: number;
          username?: string;
          password?: string;
          privateKey?: string;
        };
        const conn = service.addConnection({
          host: body.host ?? '',
          port: body.port,
          username: body.username ?? '',
          credentials: { password: body.password, privateKey: body.privateKey },
        });
        ctx.audit.record('vps.add', 'ok', { id: conn.id });
        return { status: 200, body: conn };
      });

      router.get('/connections/:id/status', async (req) => {
        const id = req.query.id ?? '';
        const status = await service.status(id);
        return { status: 200, body: status };
      });

      router.post('/connections/:id/service', async (req) => {
        const id = req.query.id ?? '';
        const body = req.body as { action?: 'start' | 'stop' | 'restart'; service?: string };
        const code = await service.serviceAction(id, body.action ?? 'restart', body.service ?? '');
        return { status: 200, body: { code } };
      });
    },
    deactivate(): void {},
  };
}
