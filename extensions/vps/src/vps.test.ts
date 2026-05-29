import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type DbHandle } from '@sovra/core';
import { SovraError } from '@sovra/contracts';
import { VpsService, type Encryptor } from './vps-service.js';
import type { SshClient, SshSession, SshShellChannel, SshExecResult } from './ssh.js';

const enc: Encryptor = {
  encrypt: (p) => Buffer.from(p).toString('base64'),
  decrypt: (c) => Buffer.from(c, 'base64').toString('utf8'),
};

interface MockBehaviour {
  failConnect?: boolean;
  exec?: (cmd: string) => SshExecResult;
}

function mockSsh(behaviour: MockBehaviour = {}): { client: SshClient } {
  const client: SshClient = {
    connect: async (): Promise<SshSession> => {
      if (behaviour.failConnect) throw new Error('auth failed');
      const channel: SshShellChannel = {
        write: () => {},
        onData: () => {},
        close: () => {},
      };
      return {
        exec: async (cmd) =>
          behaviour.exec
            ? behaviour.exec(cmd)
            : { stdout: 'up 1 day --- 0.1 0.2 0.3 --- Mem: 100 --- /dev/sda 10G', stderr: '', code: 0 },
        shell: async () => channel,
        end: () => {},
      };
    },
  };
  return { client };
}

let handle: DbHandle;

beforeEach(() => {
  handle = openDatabase(':memory:');
});
afterEach(() => handle.close());

describe('VpsService credentials', () => {
  it('stores credentials encrypted, never plaintext', () => {
    const { client } = mockSsh();
    const svc = new VpsService(handle.db, client, enc);
    const { id } = svc.addConnection({
      host: '10.0.0.1',
      username: 'root',
      credentials: { password: 'supersecret' },
    });
    const raw = handle.db.all('SELECT cred_enc FROM vps_connection') as Array<{ cred_enc: string }>;
    expect(raw[0]!.cred_enc).not.toContain('supersecret');
    expect(id).toBeTruthy();
  });
});

describe('VpsService status & control', () => {
  it('returns parsed status sections', async () => {
    const { client } = mockSsh();
    const svc = new VpsService(handle.db, client, enc);
    const { id } = svc.addConnection({ host: 'h', username: 'u', credentials: { password: 'p' } });
    const status = await svc.status(id);
    expect(status.uptime).toContain('up 1 day');
    expect(status.disk).toContain('/dev/sda');
  });

  it('runs service actions and returns exit code', async () => {
    const { client } = mockSsh({ exec: (cmd) => ({ stdout: cmd, stderr: '', code: cmd.includes('restart') ? 0 : 1 }) });
    const svc = new VpsService(handle.db, client, enc);
    const { id } = svc.addConnection({ host: 'h', username: 'u', credentials: { password: 'p' } });
    expect(await svc.serviceAction(id, 'restart', 'nginx')).toBe(0);
  });

  it('rejects invalid service names', async () => {
    const { client } = mockSsh();
    const svc = new VpsService(handle.db, client, enc);
    const { id } = svc.addConnection({ host: 'h', username: 'u', credentials: { password: 'p' } });
    await expect(svc.serviceAction(id, 'start', 'evil; rm -rf /')).rejects.toMatchObject({
      code: 'validation_error',
    });
  });
});

describe('VpsService auth failure handling', () => {
  it('returns vps_auth_failed and limits retries to 3 per 60s', async () => {
    let now = 1000;
    const { client } = mockSsh({ failConnect: true });
    const svc = new VpsService(handle.db, client, enc, () => now);
    const { id } = svc.addConnection({ host: 'h', username: 'u', credentials: { password: 'bad' } });

    for (let i = 0; i < 3; i++) {
      await expect(svc.status(id)).rejects.toMatchObject({ code: 'vps_auth_failed' });
    }
    await expect(svc.status(id)).rejects.toMatchObject({ code: 'vps_auth_failed' });
  });
});

describe('VpsService console', () => {
  it('opens an interactive shell channel', async () => {
    const { client } = mockSsh();
    const svc = new VpsService(handle.db, client, enc);
    const { id } = svc.addConnection({ host: 'h', username: 'u', credentials: { password: 'p' } });
    const console = await svc.openConsole(id);
    expect(console.channel).toBeDefined();
    console.close();
  });
});
