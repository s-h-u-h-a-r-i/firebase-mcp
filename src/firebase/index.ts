import admin from 'firebase-admin';
import type { Auth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ProjectConfig } from '../config';
import { Task } from '../task';

export class FirebaseInitError extends Error {
  readonly _tag = 'FirebaseInitError' as const;
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'FirebaseInitError';
  }
}

export interface FirebaseClients {
  firestore: () => FirebaseFirestore.Firestore;
  auth: () => Auth;
}

export const initFirebase = (
  config: ProjectConfig,
): Task<FirebaseClients, FirebaseInitError> =>
  Task.attempt({
    try: (): FirebaseClients => {
      const serviceAccountPath = resolve(config.firebase.serviceAccountPath);
      const appName = config.firebase.projectId;

      const serviceAccount = JSON.parse(
        readFileSync(serviceAccountPath, 'utf-8'),
      ) as admin.ServiceAccount;

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

      const app = admin.app(appName);
      const db = app.firestore();
      const authClient: Auth = app.auth();

      return { firestore: () => db, auth: (): Auth => authClient };
    },
    catch: (cause) =>
      new FirebaseInitError(
        `Failed to initialize Firebase for project: ${config.firebase.projectId}`,
        cause,
      ),
  });
