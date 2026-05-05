import type { ProjectContext } from '../../../project';
import { Task } from '../../../task';
import type { OperationSchema } from '../../build-tool';
import type { FirestorePropKey } from '../properties';
import { collectionPathError } from '../utils/paths';
import { applyQueryConstraints, buildIndexErrorHint } from '../utils/query';
import { normalizeDocument, QueryFilter, QueryOrderBy } from '../utils/types';

export class FirestoreQueryError extends Error {
  readonly _tag = 'FirestoreQueryError' as const;
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FirestoreQueryError';
  }
}

export const QUERY_COLLECTION = 'query_collection' as const;

export const queryCollectionOp: OperationSchema<FirestorePropKey> = {
  name: QUERY_COLLECTION,
  description:
    'Query with filters/ordering/pagination. Args: collection(ODD segments), filters?[], orderBy?[], limit?, select?[], startAfter?(doc ID)',
  properties: [
    'collection',
    'filters',
    'orderBy',
    'limit',
    'select',
    'startAfter',
  ],
};

export interface QueryCollectionArgs {
  collection: string;
  filters?: QueryFilter[];
  orderBy?: QueryOrderBy[];
  limit?: number;
  select?: string[];
  startAfter?: string;
}

export const queryCollection = (
  ctx: ProjectContext,
  input: QueryCollectionArgs,
) =>
  Task.gen(function* () {
    const err = collectionPathError(input.collection);
    if (err) {
      return yield* Task.fail(new FirestoreQueryError(err));
    }
    yield* ctx.checkAccess(input.collection);

    const db = ctx.firestore();
    const limit = Math.min(
      input.limit ?? ctx.config.firestore.maxCollectionReadSize,
      ctx.config.firestore.maxCollectionReadSize,
    );

    const cursorSnap = input.startAfter
      ? yield* Task.attempt({
          try: () =>
            db.collection(input.collection).doc(input.startAfter!).get(),
          catch: (cause) =>
            new FirestoreQueryError(
              `Failed to fetch cursor document: ${input.startAfter}`,
              cause,
            ),
        })
      : null;

    const snapshot = yield* Task.attempt({
      try: () =>
        applyQueryConstraints(db.collection(input.collection), {
          select: input.select,
          filters: input.filters,
          orderBy: input.orderBy,
          cursorSnap,
          limit,
        }).get(),
      catch: (cause) =>
        new FirestoreQueryError(
          `Failed to query collection: ${input.collection}.${buildIndexErrorHint(cause)}`,
          cause,
        ),
    });

    const documents = snapshot.docs.map(normalizeDocument);
    const nextPageCursor =
      documents.length === limit ? documents[documents.length - 1].id : null;

    return { documents, nextPageCursor };
  });
