import { randomBytes } from 'node:crypto';
import { SovraError } from '@sovrasdk/contracts';
import type { ScopedDb, SecretsCapability } from '@sovrasdk/extension-api';
import type { SshClient, SshConnectOptions, SshSession, SshShellChannel } from './ssh.js';

export interface VpsCredentials {
  password?: string;
  privateKey?: string;
}

export interface AddConnectionInput {
  host: string;
  port?: number;
  username: string;
  credentials: VpsCredentials;
}

export interface VpsConnectionInfo {
  id: string;
  host: string;
  port: number;
  username: string;
  createdAt: number;
}

export interface VpsStatus {
  uptime: string;
  cpuLoad: string;
  memory: string;
  disk: string;
}

interface FailureWindow {
  count: number;
  firstAt: number;
}

interface ConnectionRow {
  id: string;
  host: string;
  port: number;
  username: string;
  cred_enc: string;
  created_at: number;
}

const STATUS_COMMAND =
  'uptime && echo "---" && cat /proc/loadavg && echo "---" && free -m | sed -n 2p && echo "---" && df -h / | sed -n 2p';

export class VpsService {
  private failures = new Map<string, FailureWindow>();
  private readonly connections: string;

  constructor(
    private readonly db: ScopedDb,
    private readonly ssh: SshClient,
    private readonly enc: SecretsCapability,
    private readonly now: () => number = Date.now,
  ) {
    this.connections = db.table('connection');
  }

  addConnection(input: AddConnectionInput): { id: string } {
    const id = randomBytes(12).toString('hex');
    const credEnc = this.enc.encrypt(JSON.stringify(input.credentials));
    this.db.run(
      `INSERT INTO ${this.connections} (id, host, port, username, cred_enc, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, input.host, input.port ?? 22, input.username, credEnc, this.now()],
    );
    return { id };
  }

  listConnections(): VpsConnectionInfo[] {
    return this.db
      .all<ConnectionRow>(`SELECT * FROM ${this.connections} ORDER BY created_at DESC`)
      .map((r) => ({
        id: r.id,
        host: r.host,
        port: r.port,
        username: r.username,
        createdAt: r.created_at,
      }));
  }

  private connectOptions(id: string): SshConnectOptions {
    const row = this.db.get<ConnectionRow>(`SELECT * FROM ${this.connections} WHERE id = ?`, [id]);
    if (!row) throw new SovraError('not_found', `vps connection ${id} not found`);
    const creds = JSON.parse(this.enc.decrypt(row.cred_enc)) as VpsCredentials;
    return {
      host: row.host,
      port: row.port,
      username: row.username,
      password: creds.password,
      privateKey: creds.privateKey,
    };
  }

  private guardRetry(id: string): void {
    const w = this.failures.get(id);
    if (w && this.now() - w.firstAt <= 60_000 && w.count >= 3) {
      throw new SovraError('vps_auth_failed', 'too many failed attempts, slow down', {
        detail: { id },
      });
    }
  }

  private recordFailure(id: string): void {
    const t = this.now();
    const w = this.failures.get(id);
    if (!w || t - w.firstAt > 60_000) {
      this.failures.set(id, { count: 1, firstAt: t });
    } else {
      w.count += 1;
    }
  }

  private async connect(id: string): Promise<SshSession> {
    this.guardRetry(id);
    try {
      const session = await this.ssh.connect(this.connectOptions(id));
      this.failures.delete(id);
      return session;
    } catch (cause) {
      this.recordFailure(id);
      throw new SovraError('vps_auth_failed', 'failed to authenticate to VPS', {
        detail: { id },
        cause,
      });
    }
  }

  async status(id: string): Promise<VpsStatus> {
    const session = await this.connect(id);
    try {
      const result = await session.exec(STATUS_COMMAND);
      const [uptime, loadavg, mem, disk] = result.stdout.split('---').map((s) => s.trim());
      return {
        uptime: uptime ?? '',
        cpuLoad: loadavg ?? '',
        memory: mem ?? '',
        disk: disk ?? '',
      };
    } finally {
      session.end();
    }
  }

  async serviceAction(
    id: string,
    action: 'start' | 'stop' | 'restart',
    serviceName: string,
  ): Promise<number> {
    if (!/^[a-zA-Z0-9._@-]+$/.test(serviceName)) {
      throw new SovraError('validation_error', 'invalid service name');
    }
    const session = await this.connect(id);
    try {
      const result = await session.exec(`systemctl ${action} ${serviceName}`);
      return result.code;
    } finally {
      session.end();
    }
  }

  async openConsole(id: string): Promise<{ channel: SshShellChannel; close: () => void }> {
    const session = await this.connect(id);
    const channel = await session.shell();
    return {
      channel,
      close: () => {
        channel.close();
        session.end();
      },
    };
  }
}
