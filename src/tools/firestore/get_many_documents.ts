import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Data, Effect } from 'effect';

import { AccessService } from '../../access';
import { ConfigService } from '../../config';
import { FirebaseService } from '../../firebase';
import { normalizeDocument } from './normalize';

export class FirestoreGetManyError extends Data.TaggedError(
  'FirestoreGetManyError',
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const GET_MANY_DOCUMENTS = 'get_many_documents' as const;

export interface GetManyDocumentsArgs {
  paths?: string[];
  collection?: string;
  ids?: string[];
  select?: string[];
}

export const getManyDocumentsDefinition: Tool = {
  name: GET_MANY_DOCUMENTS,
  description:
    'Fetch multiple Firestore documents in a single batch. Provide either an array of full document paths, or a collection path plus an array of document IDs. More efficient than calling get_document repeatedly.',
  inputSchema: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        items: { type: 'string' },
        description:
          "Full document paths, e.g. ['users/123', 'orders/456']. Use this for fetching documents across different collections.",
      },
      collection: {
        type: 'string',
        description:
          "Collection path when all documents are in the same collection, e.g. 'shared/stores_data/ABC/data/stock'.",
      },
      ids: {
        type: 'array',
        items: { type: 'string' },
        description:
          "Document IDs within the collection specified by the collection field, e.g. ['0021451', '01010000'].",
      },
      select: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional list of field paths to return. Omit to return all fields.',
      },
    },
  },
};

export const getManyDocuments = (input: GetManyDocumentsArgs) =>
  Effect.gen(function* () {
    const access = yield* AccessService;
    const { config } = yield* ConfigService;
    const { firestore } = yield* FirebaseService;

    const maxBatchSize = config.firestore.maxBatchFetchSize;

    // Resolve all paths — full paths take priority, otherwise build from collection + ids
    let allPaths: string[] = [];

    if (input.paths?.length) {
      allPaths = input.paths;
    } else if (input.collection && input.ids?.length) {
      allPaths = input.ids.map((id) => `${input.collection}/${id}`);
    } else {
      return yield* Effect.fail(
        new FirestoreGetManyError({
          message: 'Provide either paths, or both collection and ids.',
        }),
      );
    }

    if (allPaths.length > maxBatchSize) {
      return yield* Effect.fail(
        new FirestoreGetManyError({
          message: `Batch size ${allPaths.length} exceeds maxBatchSize (${maxBatchSize}). Split into smaller batches.`,
        }),
      );
    }

    // Access check on each unique collection path
    const uniqueCollections = [
      ...new Set(allPaths.map((p) => p.split('/').slice(0, -1).join('/'))),
    ];
    for (const col of uniqueCollections) {
      yield* access.check(col);
    }

    const docRefs = allPaths.map((p) => firestore().doc(p));

    const snaps = yield* Effect.tryPromise({
      try: () =>
        input.select?.length
          ? firestore().getAll(...docRefs, { fieldMask: input.select })
          : firestore().getAll(...docRefs),
      catch: (cause) =>
        new FirestoreGetManyError({
          message: 'Batch fetch failed',
          cause,
        }),
    });

    return snaps.map((snap) =>
      snap.exists
        ? { found: true, ...normalizeDocument(snap) }
        : { found: false, id: snap.id, path: snap.ref.path },
    );
  });
