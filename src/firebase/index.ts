import { Context, Data, Effect, Layer } from 'effect';
import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppConfig } from '../config';

export class FirebaseInitError extends Data.TaggedError('FirebaseInitError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export interface FirebaseServiceShape {
  firestore(): admin.firestore.Firestore;
}

export class FirebaseService extends Context.Tag('FirebaseService')<
  FirebaseService,
  FirebaseServiceShape
>() {
  static fromConfig(config: AppConfig) {
    return Layer.effect(
      FirebaseService,
      Effect.gen(function* () {
        const serviceAccountPath = resolve(config.firebase.serviceAccountPath);

        const serviceAccount = yield* Effect.try({
          try: () =>
            JSON.parse(
              readFileSync(serviceAccountPath, 'utf-8'),
            ) as admin.ServiceAccount,
          catch: (cause) =>
            new FirebaseInitError({
              message: `Service account not found: ${serviceAccountPath}`,
              cause,
            }),
        });

        yield* Effect.try({
          try: () => {
            if (admin.apps.length === 0) {
              admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: config.firebase.projectId,
              });
            }
          },
          catch: (cause) =>
            new FirebaseInitError({ message: `Firebase init failed`, cause }),
        });

        const db = admin.firestore();

        return {
          firestore() {
            return db;
          },
        };
      }),
    );
  }
}
