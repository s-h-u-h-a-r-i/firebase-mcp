import { Data, Effect } from 'effect';
import admin from 'firebase-admin';
import type { Auth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigService } from '../config';

export class FirebaseInitError extends Data.TaggedError('FirebaseInitError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class FirebaseService extends Effect.Service<FirebaseService>()(
  'FirebaseService',
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const { config } = yield* ConfigService;

      const serviceAccountPath = resolve(config.firebase.serviceAccountPath);
      const appName = config.firebase.projectId;

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
          const existing = admin.apps.find((a) => a?.name === appName);
          if (!existing) {
            admin.initializeApp(
              {
                credential: admin.credential.cert(serviceAccount),
                projectId: appName,
              },
              appName,
            );
          }
        },
        catch: (cause) =>
          new FirebaseInitError({ message: `Firebase init failed`, cause }),
      });

      const app = admin.app(appName);
      const db = app.firestore();
      const authClient: Auth = app.auth();

      return { firestore: () => db, auth: (): Auth => authClient };
    }),
  },
) {}
