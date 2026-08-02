import 'dotenv/config';

import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const start = async () => {
  const config = loadConfig();
  const server = await buildApp({ config });

  try {
    await server.listen({ port: config.port, host: config.host });
    server.log.info({ port: config.port, host: config.host }, 'Backend listening');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      server.log.info({ signal }, 'Shutting down gracefully');
      void server.close().then(
        () => process.exit(0),
        (error: unknown) => {
          server.log.error({ err: error }, 'Graceful shutdown failed');
          process.exit(1);
        },
      );
    });
  }
};

void start().catch((error: unknown) => {
  process.stderr.write(`Backend startup failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exit(1);
});
