#!/usr/bin/env node

import { NodeRuntime } from '@effect/platform-node';
import { Effect } from 'effect';

import { McpServerService } from '../server';

const program = Effect.gen(function* () {
  const mcp = yield* McpServerService;
  yield* mcp.start();
  yield* Effect.sync(() =>
    process.stderr.write('[firebase-mcp] Server running on stdio\n'),
  );
}).pipe(Effect.provide(McpServerService.Default));

NodeRuntime.runMain(program);
