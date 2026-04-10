import { Tool } from '@modelcontextprotocol/sdk/types.js';

import type { ProjectContext } from '../../project';
import { Task } from '../../task';
import {
  FILTER_SCHEMA_ITEM,
  normalizeDocument,
  ORDER_BY_SCHEMA_ITEM,
  QueryFilter,
  QueryOrderBy,
} from './types';

export class FirestoreQueryError extends Error {
  readonly _tag = 'FirestoreQueryError' as const;
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'FirestoreQueryError';
  }
}

export const QUERY_COLLECTION = 'query_collection' as const;

export interface QueryCollectionArgs {
  collection: string;
  filters?: QueryFilter[];
  orderBy?: QueryOrderBy[];
  limit?: number;
  select?: string[];
  startAfter?: string;
}

export const queryCollectionDefinition: Tool = {
  name: QUERY_COLLECTION,
  description:
    'Query a Firestore collection with filters, ordering, and a limit. Supports cursor-based pagination via startAfter.',
  inputSchema: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        description: "Collection path, e.g. 'users' or 'users/123/posts'",
      },
      filters: {
        type: 'array',
        description: 'Optional list of where-clause filters',
        items: FILTER_SCHEMA_ITEM,
      },
      orderBy: {
        type: 'array',
        description: 'Optional ordering of results',
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
          'Document ID to start after for pagination. Use the nextPageCursor value returned from a previous call.',
      },
      projectId: {
        type: 'string',
        description: 'Project key as defined in firebase-mcp.json',
      },
    },
    required: ['collection', 'projectId'],
  },
};

export const queryCollection = (
  ctx: ProjectContext,
  input: QueryCollectionArgs,
) =>
  Task.gen(function* () {
    yield* ctx.checkAccess(input.collection);

    const db = ctx.firestore();
    const maxLimit = ctx.config.firestore.maxCollectionReadSize;
    const limit = Math.min(input.limit ?? maxLimit, maxLimit);

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
      try: () => {
        let query: FirebaseFirestore.Query = db.collection(input.collection);

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
        new FirestoreQueryError(
          `Failed to query collection: ${input.collection}`,
          cause,
        ),
    });

    const documents = snapshot.docs.map(normalizeDocument);
    const nextPageCursor =
      documents.length === limit ? documents[documents.length - 1].id : null;

    return { documents, nextPageCursor };
  });
