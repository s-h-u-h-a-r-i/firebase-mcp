import { Tool } from '@modelcontextprotocol/sdk/types.js';

import type { ProjectContext } from '../../../project';
import { Task } from '../../../task';
import { collectionPathError } from '../utils/paths';
import { normalizeDocument } from '../utils/types';

export class FirestoreReadError extends Error {
  readonly _tag = 'FirestoreReadError' as const;
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'FirestoreReadError';
  }
}

export const READ_COLLECTION = 'read_collection' as const;

export interface ReadCollectionArgs {
  collection: string;
  limit?: number;
  select?: string[];
  includePhantoms?: boolean;
  startAfter?: string;
}

export const readCollectionDefinition: Tool = {
  name: READ_COLLECTION,
  description: 'Read documents from a Firestore collection',
  inputSchema: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        description: "Collection path, e.g. 'users' or 'users/123/posts'",
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
      includePhantoms: {
        type: 'boolean',
        description:
          'If true and the collection returns no documents, automatically falls back to listDocuments() to surface phantom documents (documents with no fields that exist only as parents of subcollections).',
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

export const readCollection = (ctx: ProjectContext, input: ReadCollectionArgs) =>
  Task.gen(function* () {
    const err = collectionPathError(input.collection);
    if (err) {
      return yield* Task.fail(new FirestoreReadError(err));
    }
    yield* ctx.checkAccess(input.collection);

    const db = ctx.firestore();
    const maxLimit = ctx.config.firestore.maxCollectionReadSize;
    const limit = Math.min(input.limit ?? maxLimit, maxLimit);

    const cursorSnap = input.startAfter
      ? yield* Task.attempt({
          try: () =>
            db.collection(input.collection).doc(input.startAfter!).get(),
          catch: (cause) =>
            new FirestoreReadError(
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

        if (cursorSnap) {
          query = query.startAfter(cursorSnap);
        }

        return query.limit(limit).get();
      },
      catch: (cause) =>
        new FirestoreReadError(
          `Failed to read collection: ${input.collection}`,
          cause,
        ),
    });

    const documents = snapshot.docs.map(normalizeDocument);

    if (documents.length === 0 && input.includePhantoms) {
      const refs = yield* Task.attempt({
        try: () => db.collection(input.collection).listDocuments(),
        catch: (cause) =>
          new FirestoreReadError(
            `Failed to list phantom documents in: ${input.collection}`,
            cause,
          ),
      });

      const phantoms = refs.map((ref) => ({ id: ref.id, path: ref.path }));
      return { documents, phantoms };
    }

    const nextPageCursor =
      documents.length === limit ? documents[documents.length - 1].id : null;

    return { documents, nextPageCursor };
  });
