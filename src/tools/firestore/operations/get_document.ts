import type { ProjectContext } from '../../../project';
import { Task } from '../../../task';
import { documentPathError } from '../utils/paths';
import { normalizeDocument } from '../utils/types';

export class FirestoreGetError extends Error {
  readonly _tag = 'FirestoreGetError' as const;
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FirestoreGetError';
  }
}

export class DocumentNotFoundError extends Error {
  readonly _tag = 'DocumentNotFoundError' as const;
  constructor(readonly path: string) {
    super(`Document not found: ${path}`);
    this.name = 'DocumentNotFoundError';
  }
}

export const GET_DOCUMENT = 'get_document' as const;

export interface GetDocumentArgs {
  path: string;
  select?: string[];
}

export const getDocument = (ctx: ProjectContext, input: GetDocumentArgs) =>
  Task.gen(function* () {
    const err = documentPathError(input.path);
    if (err) {
      return yield* Task.fail(new FirestoreGetError(err));
    }
    yield* ctx.checkAccess(input.path);

    const db = ctx.firestore();

    const docRef = yield* Task.attempt({
      try: () => db.doc(input.path),
      catch: (cause) =>
        new FirestoreGetError(`Invalid document path: ${input.path}`, cause),
    });

    const [snap, subcollections] = yield* Task.attempt({
      try: () =>
        Promise.all([
          input.select?.length
            ? db
                .getAll(docRef, { fieldMask: input.select })
                .then((snaps) => snaps[0])
            : docRef.get(),
          docRef.listCollections(),
        ]),
      catch: (cause) =>
        new FirestoreGetError(`Failed to get document: ${input.path}`, cause),
    });

    if (!snap.exists) {
      return yield* Task.fail(new DocumentNotFoundError(input.path));
    }

    return {
      ...normalizeDocument(snap),
      collections: subcollections.map((c) => c.path),
    };
  });
