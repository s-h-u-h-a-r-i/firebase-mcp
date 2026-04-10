import { Tool } from '@modelcontextprotocol/sdk/types.js';

import type { ProjectContext } from '../../project';
import { Task } from '../../task';
import { normalizeDocument } from './types';

export class FirestoreGetManyError extends Error {
  readonly _tag = 'FirestoreGetManyError' as const;
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'FirestoreGetManyError';
  }
}

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
      projectId: {
        type: 'string',
        description: 'Project key as defined in firebase-mcp.json',
      },
    },
    required: ['projectId'],
  },
};

export const getManyDocuments = (
  ctx: ProjectContext,
  input: GetManyDocumentsArgs,
) =>
  Task.gen(function* () {
    const db = ctx.firestore();
    const maxBatchSize = ctx.config.firestore.maxBatchFetchSize;

    let allPaths: string[] = [];

    if (input.paths?.length) {
      allPaths = input.paths;
    } else if (input.collection && input.ids?.length) {
      allPaths = input.ids.map((id) => `${input.collection}/${id}`);
    } else {
      return yield* Task.fail(
        new FirestoreGetManyError(
          'Provide either paths, or both collection and ids.',
        ),
      );
    }

    if (allPaths.length > maxBatchSize) {
      return yield* Task.fail(
        new FirestoreGetManyError(
          `Batch size ${allPaths.length} exceeds maxBatchSize (${maxBatchSize}). Split into smaller batches.`,
        ),
      );
    }

    // Access check on each unique collection path
    const uniqueCollections = [
      ...new Set(allPaths.map((p) => p.split('/').slice(0, -1).join('/'))),
    ];
    for (const col of uniqueCollections) {
      yield* ctx.checkAccess(col);
    }

    const docRefs = allPaths.map((p) => db.doc(p));

    const snaps = yield* Task.attempt({
      try: () =>
        input.select?.length
          ? db.getAll(...docRefs, { fieldMask: input.select })
          : db.getAll(...docRefs),
      catch: (cause) =>
        new FirestoreGetManyError('Batch fetch failed', cause),
    });

    return snaps.map((snap) =>
      snap.exists
        ? { found: true, ...normalizeDocument(snap) }
        : { found: false, id: snap.id, path: snap.ref.path },
    );
  });
