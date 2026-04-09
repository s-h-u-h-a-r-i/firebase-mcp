import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Data, Effect } from 'effect';

import { AccessService } from '../../access';
import { FirebaseService } from '../../firebase';

export class FirestoreListCollectionsError extends Data.TaggedError(
  'FirestoreListCollectionsError',
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const LIST_COLLECTIONS = 'list_collections' as const;

export interface ListCollectionsArgs {
  path?: string;
}

export const listCollectionsDefinition: Tool = {
  name: LIST_COLLECTIONS,
  description:
    'List Firestore collections. Omit path to list all root-level collections, or provide a document path to list its subcollections.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description:
          "Optional document path whose subcollections to list, e.g. 'users/123'. Omit to list root-level collections.",
      },
    },
  },
};

export const listCollections = (input: ListCollectionsArgs) =>
  Effect.gen(function* () {
    const { firestore } = yield* FirebaseService;

    if (input.path) {
      const access = yield* AccessService;
      yield* access.check(input.path);
    }

    const collections = yield* Effect.tryPromise({
      try: () =>
        input.path
          ? firestore().doc(input.path).listCollections()
          : firestore().listCollections(),
      catch: (cause) =>
        new FirestoreListCollectionsError({
          message: input.path
            ? `Failed to list subcollections of: ${input.path}`
            : 'Failed to list root collections',
          cause,
        }),
    });

    return collections.map((col) => ({ id: col.id, path: col.path }));
  });
