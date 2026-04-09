import { Data, Effect, Schema } from 'effect';
import minimist from 'minimist';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export class ConfigError extends Data.TaggedError('ConfigError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const FirebaseConfigSchema = Schema.Struct({
  projectId: Schema.String,
  serviceAccountPath: Schema.String,
});

const FirestoreRulesSchema = Schema.Struct({
  allow: Schema.Array(Schema.String),
  deny: Schema.Array(Schema.String),
});

const FirestoreConfigSchema = Schema.Struct({
  rules: FirestoreRulesSchema,
  maxCollectionReadSize: Schema.optionalWith(Schema.Number, { default: () => 10 }),
  maxBatchFetchSize: Schema.optionalWith(Schema.Number, { default: () => 200 }),
});

const AppConfigSchema = Schema.Struct({
  firebase: FirebaseConfigSchema,
  firestore: FirestoreConfigSchema,
});

export type AppConfig = Schema.Schema.Type<typeof AppConfigSchema>;

export class ConfigService extends Effect.Service<ConfigService>()(
  'ConfigService',
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const args = minimist(process.argv.slice(2));
      const configPath: string = args['config'] ?? './firebase-mcp.json';
      const absolutePath = resolve(configPath);

      const raw = yield* Effect.try({
        try: () => readFileSync(absolutePath, 'utf-8'),
        catch: (cause) =>
          new ConfigError({
            message: `Config file not found: ${absolutePath}`,
            cause,
          }),
      });

      const json = yield* Effect.try({
        try: () => JSON.parse(raw) as unknown,
        catch: (cause) =>
          new ConfigError({ message: `Config file is not valid JSON`, cause }),
      });

      const config = yield* Schema.decodeUnknown(AppConfigSchema)(json).pipe(
        Effect.mapError(
          (cause) =>
            new ConfigError({ message: `Config validation failed`, cause }),
        ),
      );

      return {
        config,
      };
    }),
  },
) {}
