import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Data, Effect } from 'effect';

import { AccessService } from '../../access';
import { ConfigService } from '../../config';
import { FirebaseService } from '../../firebase';
import {
  FILTER_SCHEMA_ITEM,
  normalizeDocument,
  ORDER_BY_SCHEMA_ITEM,
  QueryFilter,
  QueryOrderBy,
} from './types';

export class FirestoreCollectionGroupQueryError extends Data.TaggedError(
  'FirestoreCollectionGroupQueryError',
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const QUERY_COLLECTION_GROUP = 'query_collection_group' as const;

export interface QueryCollectionGroupArgs {
  collectionId: string;
  filters?: QueryFilter[];
  orderBy?: QueryOrderBy[];
  limit?: number;
  select?: string[];
  startAfter?: string;
}

export const queryCollectionGroupDefinition: Tool = {
  name: QUERY_COLLECTION_GROUP,
  description:
    'Query across all Firestore collections with the same name, regardless of their parent path. Use this to query data across multiple stores or parent documents at once. Check list_indexes first to confirm a collection-group-scoped index exists for any filters or ordering you plan to use.',
  inputSchema: {
    type: 'object',
    properties: {
      collectionId: {
        type: 'string',
        description:
          "The collection name to query across all parents, e.g. 'purchase_orders' or 'stock'.",
      },
      filters: {
        type: 'array',
        description: 'Optional list of where-clause filters',
        items: FILTER_SCHEMA_ITEM,
      },
      orderBy: {
        type: 'array',
        description:
          'Optional ordering of results. Requires a collection-group index.',
        items: ORDER_BY_SCHEMA_ITEM,
      },
      limit: {
        type: 'number',
        description: 'Max number of documents to return',
      },
      select: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional list of field paths to return. Omit to return all fields.',
      },
      startAfter: {
        type: 'string',
        description:
          'Full document path to start after for pagination, e.g. "shared/stores_data/ABC/data/purchase_orders/51721". Use the path from the last document in the previous page.',
      },
    },
    required: ['collectionId'],
  },
};

export const queryCollectionGroup = (input: QueryCollectionGroupArgs) =>
  Effect.gen(function* () {
    const access = yield* AccessService;
    yield* access.check(input.collectionId);

    const { config } = yield* ConfigService;
    const { firestore } = yield* FirebaseService;

    const maxLimit = config.firestore.maxCollectionReadSize;
    const limit = Math.min(input.limit ?? maxLimit, maxLimit);

    // For collection group pagination, startAfter must be a full path
    const cursorSnap = input.startAfter
      ? yield* Effect.tryPromise({
          try: () => firestore().doc(input.startAfter!).get(),
          catch: (cause) =>
            new FirestoreCollectionGroupQueryError({
              message: `Failed to fetch cursor document: ${input.startAfter}`,
              cause,
            }),
        })
      : null;

    const snapshot = yield* Effect.tryPromise({
      try: () => {
        let query: FirebaseFirestore.Query = firestore().collectionGroup(
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
        new FirestoreCollectionGroupQueryError({
          message: `Failed to query collection group: ${input.collectionId}`,
          cause,
        }),
    });

    const documents = snapshot.docs.map(normalizeDocument);
    const nextPageCursor =
      documents.length === limit ? documents[documents.length - 1].path : null;

    return { documents, nextPageCursor };
  });
