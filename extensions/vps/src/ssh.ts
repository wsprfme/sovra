import { Client, type ConnectConfig } from 'ssh2';

export interface SshExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface SshShellChannel {
  write(data: string): void;
  onData(cb: (chunk: string) => void): void;
  close(): void;
}

export interface SshSession {
  exec(command: string): Promise<SshExecResult>;
  shell(): Promise<SshShellChannel>;
  end(): void;
}

export interface SshConnectOptions {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

export interface SshClient {
  connect(options: SshConnectOptions): Promise<SshSession>;
}

class Ssh2Session implements SshSession {
  constructor(private readonly client: Client) {}

  exec(command: string): Promise<SshExecResult> {
    return new Promise((resolve, reject) => {
      this.client.exec(command, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        let stdout = '';
        let stderr = '';
        stream
          .on('close', (code: number) => resolve({ stdout, stderr, code: code ?? 0 }))
          .on('data', (d: Buffer) => {
            stdout += d.toString('utf8');
          });
        stream.stderr.on('data', (d: Buffer) => {
          stderr += d.toString('utf8');
        });
      });
    });
  }

  shell(): Promise<SshShellChannel> {
    return new Promise((resolve, reject) => {
      this.client.shell((err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          write: (data) => stream.write(data),
          onData: (cb) => stream.on('data', (d: Buffer) => cb(d.toString('utf8'))),
          close: () => stream.end(),
        });
      });
    });
  }

  end(): void {
    this.client.end();
  }
}

export class Ssh2Client implements SshClient {
  connect(options: SshConnectOptions): Promise<SshSession> {
    return new Promise((resolve, reject) => {
      const client = new Client();
      const config: ConnectConfig = {
        host: options.host,
        port: options.port,
        username: options.username,
        readyTimeout: 15000,
      };
      if (options.password) config.password = options.password;
      if (options.privateKey) config.privateKey = options.privateKey;

      client
        .on('ready', () => resolve(new Ssh2Session(client)))
        .on('error', (err) => reject(err))
        .connect(config);
    });
  }
}
