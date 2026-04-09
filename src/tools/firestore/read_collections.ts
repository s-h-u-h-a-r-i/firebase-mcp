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

    const maxLimit = config.firestore.maxLimit;
    const limit = Math.min(input.limit ?? maxLimit, maxLimit);

    const snapshot = yield* Effect.tryPromise({
      try: () => {
        let query: FirebaseFirestore.Query = firestore().collection(
          input.collection,
        );

        if (input.select?.length) {
          query = query.select(...input.select);
        }

        return query.limit(limit).get();
      },
      catch: (cause) =>
        new FirestoreReadError({
          message: `Failed to read collection: ${input.collection}`,
          cause,
        }),
    });

    return snapshot.docs.map(normalizeDocument);
  });
