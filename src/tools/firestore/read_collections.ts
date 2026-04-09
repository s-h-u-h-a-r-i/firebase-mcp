import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Data, Effect } from 'effect';
import { AccessService } from '../../access';
import { ConfigService } from '../../config';
import { FirebaseService } from '../../firebase';
import { normalizeDocument } from './normalize';

export class FirestoreReadError extends Data.TaggedError('FirestoreReadError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

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
    },
    required: ['collection'],
  },
};

export const readCollection = (input: ReadCollectionArgs) =>
  Effect.gen(function* () {
    const access = yield* AccessService;
    yield* access.check(input.collection);

    const { config } = yield* ConfigService;
    const { firestore } = yield* FirebaseService;

    const maxLimit = config.firestore.maxCollectionReadSize;
    const limit = Math.min(input.limit ?? maxLimit, maxLimit);

    const cursorSnap = input.startAfter
      ? yield* Effect.tryPromise({
          try: () =>
            firestore()
              .collection(input.collection)
              .doc(input.startAfter!)
              .get(),
          catch: (cause) =>
            new FirestoreReadError({
              message: `Failed to fetch cursor document: ${input.startAfter}`,
              cause,
            }),
        })
      : null;

    const snapshot = yield* Effect.tryPromise({
      try: () => {
        let query: FirebaseFirestore.Query = firestore().collection(
          input.collection,
        );

        if (input.select?.length) {
          query = query.select(...input.select);
        }

        if (cursorSnap) {
          query = query.startAfter(cursorSnap);
        }

        return query.limit(limit).get();
      },
      catch: (cause) =>
        new FirestoreReadError({
          message: `Failed to read collection: ${input.collection}`,
          cause,
        }),
    });

    const documents = snapshot.docs.map(normalizeDocument);

    if (documents.length === 0 && input.includePhantoms) {
      const refs = yield* Effect.tryPromise({
        try: () => firestore().collection(input.collection).listDocuments(),
        catch: (cause) =>
          new FirestoreReadError({
            message: `Failed to list phantom documents in: ${input.collection}`,
            cause,
          }),
      });

      const phantoms = refs.map((ref) => ({ id: ref.id, path: ref.path }));
      return { documents, phantoms };
    }

    const nextPageCursor =
      documents.length === limit ? documents[documents.length - 1].id : null;

    return { documents, nextPageCursor };
  });
