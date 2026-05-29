import { buildApp } from './http/app.js';
import { loadConfig } from './config.js';
import { createServices } from './services.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const services = createServices(config);
  await services.extensions.restore();
  const app = buildApp(services);

  const shutdown = async (): Promise<void> => {
    await app.close();
    services.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ host: config.host, port: config.port });
  process.stdout.write(`sovra core listening on ${config.host}:${config.port}\n`);
}

main().catch((err) => {
  process.stderr.write(`fatal: ${String(err)}\n`);
  process.exit(1);
});
