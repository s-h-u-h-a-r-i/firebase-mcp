import type { ProjectContext } from '../../../project';
import { Task } from '../../../task';
import type { OperationSchema } from '../../build-tool';
import type { FirestorePropKey } from '../properties';
import { applyQueryConstraints, buildIndexErrorHint } from '../utils/query';
import { normalizeDocument, QueryFilter, QueryOrderBy } from '../utils/types';

export class FirestoreCollectionGroupQueryError extends Error {
  readonly _tag = 'FirestoreCollectionGroupQueryError' as const;
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FirestoreCollectionGroupQueryError';
  }
}

export const QUERY_COLLECTION_GROUP = 'query_collection_group' as const;

export const queryCollectionGroupOp: OperationSchema<FirestorePropKey> = {
  name: QUERY_COLLECTION_GROUP,
  description:
    'Query across all subcollections with the same name. Args: collectionId(single name, no slashes), filters?[], orderBy?[], limit?, select?[], startAfter?(full doc path)',
  properties: [
    'collectionId',
    'filters',
    'orderBy',
    'limit',
    'select',
    'startAfter',
  ],
};

export interface QueryCollectionGroupArgs {
  collectionId: string;
  filters?: QueryFilter[];
  orderBy?: QueryOrderBy[];
  limit?: number;
  select?: string[];
  startAfter?: string;
}

export const queryCollectionGroup = (
  ctx: ProjectContext,
  input: QueryCollectionGroupArgs,
) =>
  Task.gen(function* () {
    yield* ctx.checkAccess(input.collectionId);

    const db = ctx.firestore();
    const limit = Math.min(
      input.limit ?? ctx.config.firestore.maxCollectionReadSize,
      ctx.config.firestore.maxCollectionReadSize,
    );

    // collection group pagination requires a full doc path as cursor
    const cursorSnap = input.startAfter
      ? yield* Task.attempt({
          try: () => db.doc(input.startAfter!).get(),
          catch: (cause) =>
            new FirestoreCollectionGroupQueryError(
              `Failed to fetch cursor document: ${input.startAfter}`,
              cause,
            ),
        })
      : null;

    const snapshot = yield* Task.attempt({
      try: () =>
        applyQueryConstraints(db.collectionGroup(input.collectionId), {
          select: input.select,
          filters: input.filters,
          orderBy: input.orderBy,
          cursorSnap,
          limit,
        }).get(),
      catch: (cause) =>
        new FirestoreCollectionGroupQueryError(
          `Failed to query collection group: ${input.collectionId}.${buildIndexErrorHint(cause)}`,
          cause,
        ),
    });

    const documents = snapshot.docs.map(normalizeDocument);
    const nextPageCursor =
      documents.length === limit ? documents[documents.length - 1].path : null;

    return { documents, nextPageCursor };
  });
