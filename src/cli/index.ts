#!/usr/bin/env node

import { FirebaseMcpServer } from '../server';

async function main() {
  const server = new FirebaseMcpServer();
  await server.start();
  process.stderr.write('[firebase-mcp] Server running on stdio\n');
}

main().catch((err) => {
  process.stderr.write(`[firebase-mcp] Fatal: ${String(err)}\n`);
  process.exit(1);
});
