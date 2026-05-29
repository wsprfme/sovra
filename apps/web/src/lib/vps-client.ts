import 'server-only';
import { coreClient } from './core-client';

export interface VpsConnection {
  id: string;
  host: string;
  port: number;
  username: string;
  createdAt: number;
}

const VPS = 'vps';

export const vpsClient = {
  listConnections: () =>
    coreClient.ext<{ connections: VpsConnection[] }>(VPS, 'GET', '/connections'),
};
