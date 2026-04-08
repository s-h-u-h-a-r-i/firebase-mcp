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

export const readCollectionDefinition: Tool = {
  name: 'read_collection',
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
    },
    required: ['collection'],
  },
};

export const readCollection = (input: { collection: string; limit?: number }) =>
  Effect.gen(function* () {
    const access = yield* AccessService;
    yield* access.check(input.collection);

    const { config } = yield* ConfigService;
    const { firestore } = yield* FirebaseService;

    const maxLimit = config.firestore.maxLimit;
    const limit = Math.min(input.limit ?? maxLimit, maxLimit);

    const snapshot = yield* Effect.tryPromise({
      try: () => firestore().collection(input.collection).limit(limit).get(),
      catch: (cause) =>
        new FirestoreReadError({
          message: `Failed to read collection: ${input.collection}`,
          cause,
        }),
    });

    return snapshot.docs.map(normalizeDocument);
  });
