import { SovraError } from '@sovrasdk/contracts';
import type { ExtensionContext, ExtensionRouter, SovraExtension } from '@sovrasdk/extension-api';
import { VpsService } from './vps-service.js';
import { Ssh2Client } from './ssh.js';
import { migrations } from './migrations.js';

export function createVpsExtension(): SovraExtension {
  return {
    migrations,
    activate(ctx: ExtensionContext, router: ExtensionRouter): void {
      const service = new VpsService(ctx.db, new Ssh2Client(), ctx.secrets);

      router.get('/connections', () => ({
        status: 200,
        body: { connections: service.listConnections() },
      }));

      router.post('/connections', (req) => {
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
        const id = req.params.id ?? req.query.id ?? '';
        const status = await service.status(id);
        return { status: 200, body: status };
      });

      router.post('/connections/:id/service', async (req) => {
        const id = req.params.id ?? req.query.id ?? '';
        const body = req.body as { action?: 'start' | 'stop' | 'restart'; service?: string };
        if (!body.service) throw new SovraError('validation_error', 'service required');
        const code = await service.serviceAction(id, body.action ?? 'restart', body.service);
        return { status: 200, body: { code } };
      });
    },
    deactivate(): void {},
  };
}
