#!/usr/bin/env node

import { NodeRuntime } from '@effect/platform-node';
import { Effect, Layer } from 'effect';

import { ConfigService } from '../config';
import { FirebaseService } from '../firebase';

const appLayer = FirebaseService.Default.pipe(
  Layer.provideMerge(ConfigService.Default),
);

const program = Effect.gen(function* () {
  const config = yield* ConfigService.config;

  process.stderr.write(
    `[firebase-mcp] Loaded config for project: ${config.firebase.projectId}\n`,
  );

  yield* FirebaseService;
  process.stderr.write(`[firebase-mcp] Firebase initialized\n`);
}).pipe(Effect.provide(appLayer));

NodeRuntime.runMain(program);
