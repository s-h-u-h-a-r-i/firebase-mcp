import minimist from 'minimist';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

import { Task } from '../task';

export class ConfigError extends Error {
  readonly _tag = 'ConfigError' as const;
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'ConfigError';
  }
}

const FirebaseConfigSchema = z.object({
  projectId: z.string(),
  serviceAccountPath: z.string(),
});

const FirestoreRulesSchema = z.object({
  allow: z.array(z.string()),
  deny: z.array(z.string()),
});

const FirestoreConfigSchema = z.object({
  rules: FirestoreRulesSchema,
  maxCollectionReadSize: z.number().default(100),
  maxBatchFetchSize: z.number().default(200),
});

export const ProjectConfigSchema = z.object({
  firebase: FirebaseConfigSchema,
  firestore: FirestoreConfigSchema,
});

const AppConfigSchema = z.object({
  projects: z.record(z.string(), ProjectConfigSchema),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;

export const loadConfig = (configPath: string): Task<AppConfig, ConfigError> =>
  Task.attempt({
    try: () => {
      const absolutePath = resolve(configPath);
      const raw = readFileSync(absolutePath, 'utf-8');
      const json = JSON.parse(raw) as unknown;
      const result = AppConfigSchema.safeParse(json);
      if (!result.success) {
        throw new ConfigError('Config validation failed', result.error);
      }
      return result.data;
    },
    catch: (cause) => {
      if (cause instanceof ConfigError) return cause;
      return new ConfigError(`Failed to load config: ${configPath}`, cause);
    },
  });

export const getConfigPath = (): string => {
  const args = minimist(process.argv.slice(2));
  return args['config'] ?? './firebase-mcp.json';
};
