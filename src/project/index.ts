import type { Auth } from 'firebase-admin/auth';

import micromatch from 'micromatch';
import type { ProjectConfig } from '../config';
import { FirebaseInitError, initFirebase } from '../firebase';
import { Task } from '../task';

export class AccessDeniedError extends Error {
  readonly _tag = 'AccessDeniedError' as const;
  constructor(readonly path: string) {
    super(`Access denied: ${path}`);
    this.name = 'AccessDeniedError';
  }
}

export interface ProjectContext {
  config: ProjectConfig;
  firestore: () => FirebaseFirestore.Firestore;
  auth: () => Auth;
  checkAccess: (path: string) => Task<void, AccessDeniedError>;
}

export const isAllowed = (
  path: string,
  rules: { allow: readonly string[]; deny: readonly string[] },
): boolean => {
  if (micromatch.isMatch(path, [...rules.deny])) return false;
  if (micromatch.isMatch(path, [...rules.allow])) return true;
  return false;
};

export const makeCheckAccess =
  (rules: { allow: readonly string[]; deny: readonly string[] }) =>
  (path: string): Task<void, AccessDeniedError> =>
    isAllowed(path, rules)
      ? Task.succeed(undefined)
      : Task.fail(new AccessDeniedError(path));

export const createProjectContext = (
  config: ProjectConfig,
): Task<ProjectContext, FirebaseInitError> =>
  initFirebase(config).map((clients) => ({
    config,
    firestore: clients.firestore,
    auth: clients.auth,
    checkAccess: makeCheckAccess(config.firestore.rules),
  }));
