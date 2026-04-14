import type { ProjectContext } from '../../../project';
import { Task } from '../../../task';
import { documentPathError } from '../utils/paths';

export class FirestoreListCollectionsError extends Error {
  readonly _tag = 'FirestoreListCollectionsError' as const;
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FirestoreListCollectionsError';
  }
}

export const LIST_COLLECTIONS = 'list_collections' as const;

export interface ListCollectionsArgs {
  path?: string;
  includeCounts?: boolean;
}

export const listCollections = (
  ctx: ProjectContext,
  input: ListCollectionsArgs,
) =>
  Task.gen(function* () {
    const db = ctx.firestore();

    if (input.path) {
      const err = documentPathError(input.path);
      if (err) {
        return yield* Task.fail(new FirestoreListCollectionsError(err));
      }
      yield* ctx.checkAccess(input.path);
    }

    const collections = yield* Task.attempt({
      try: () =>
        input.path
          ? db.doc(input.path).listCollections()
          : db.listCollections(),
      catch: (cause) =>
        new FirestoreListCollectionsError(
          input.path
            ? `Failed to list subcollections of: ${input.path}`
            : 'Failed to list root collections',
          cause,
        ),
    });

    if (input.includeCounts) {
      const results = yield* Task.attempt({
        try: () =>
          Promise.all(
            collections.map(async (col) => {
              const snap = await col.count().get();
              return { id: col.id, path: col.path, count: snap.data().count };
            }),
          ),
        catch: (cause) =>
          new FirestoreListCollectionsError(
            'Failed to get counts for collections',
            cause,
          ),
      });
      return results;
    }

    return collections.map((col) => ({ id: col.id, path: col.path }));
  });
