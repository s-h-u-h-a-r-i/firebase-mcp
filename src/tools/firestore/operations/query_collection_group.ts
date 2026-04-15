import type { ProjectContext } from '../../../project';
import { Task } from '../../../task';
import type { OperationSchema } from '../../build-tool';
import type { FirestorePropKey } from '../properties';
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
    const maxLimit = ctx.config.firestore.maxCollectionReadSize;
    const limit = Math.min(input.limit ?? maxLimit, maxLimit);

    // For collection group pagination, startAfter must be a full path
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
      try: () => {
        let query: FirebaseFirestore.Query = db.collectionGroup(
          input.collectionId,
        );

        if (input.select?.length) {
          query = query.select(...input.select);
        }

        for (const filter of input.filters ?? []) {
          query = query.where(filter.field, filter.operator, filter.value);
        }

        for (const order of input.orderBy ?? []) {
          query = query.orderBy(order.field, order.direction ?? 'asc');
        }

        if (cursorSnap) {
          query = query.startAfter(cursorSnap);
        }

        return query.limit(limit).get();
      },
      catch: (cause) =>
        new FirestoreCollectionGroupQueryError(
          `Failed to query collection group: ${input.collectionId}`,
          cause,
        ),
    });

    const documents = snapshot.docs.map(normalizeDocument);
    const nextPageCursor =
      documents.length === limit ? documents[documents.length - 1].path : null;

    return { documents, nextPageCursor };
  });
