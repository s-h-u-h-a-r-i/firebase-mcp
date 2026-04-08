#!/usr/bin/env node

import { NodeRuntime } from '@effect/platform-node';
import { Effect } from 'effect';
import minimist from 'minimist';

import { loadConfig } from '../config';
import { FirebaseService } from '../firebase';

const args = minimist(process.argv.slice(2));
const configPath: string = args['config'] ?? './firebase-mcp.json';

const program = Effect.gen(function* () {
  // TODO: If config is incorrect then this will stderr. Will Tool using MCP be able to inform user about correct usage?
  const config = yield* loadConfig(configPath);

  process.stderr.write(
    `[firebase-mcp] Loaded config for project: ${config.firebase.projectId}\n`,
  );

  const appLayer = FirebaseService.fromConfig(config);

  yield* Effect.provide(
    Effect.gen(function* () {
      const firebase = yield* FirebaseService;
      process.stderr.write(`[firebase-mcp] Firebase initialized\n`);
    }),
    appLayer,
  );
});

NodeRuntime.runMain(program);
