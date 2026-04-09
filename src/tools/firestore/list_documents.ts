import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Data, Effect } from 'effect';
import { AccessService } from '../../access';
import { FirebaseService } from '../../firebase';

export class FirestoreListDocumentsError extends Data.TaggedError(
  'FirestoreListDocumentsError',
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const LIST_DOCUMENTS = 'list_documents' as const;

export interface ListDocumentsArgs {
  collection: string;
}

export const listDocumentsDefinition: Tool = {
  name: LIST_DOCUMENTS,
  description:
    'List all document IDs in a Firestore collection, including phantom documents (documents with no fields that exist only as parents of subcollections). Use this when read_collection returns empty but subcollections are known to exist.',
  inputSchema: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        description:
          "Collection path, e.g. 'users' or 'shared/stores_data/ABC123'",
      },
    },
    required: ['collection'],
  },
};

export const listDocuments = (input: ListDocumentsArgs) =>
  Effect.gen(function* () {
    const access = yield* AccessService;
    yield* access.check(input.collection);

    const { firestore } = yield* FirebaseService;

    const refs = yield* Effect.tryPromise({
      try: () => firestore().collection(input.collection).listDocuments(),
      catch: (cause) =>
        new FirestoreListDocumentsError({
          message: `Failed to list documents in: ${input.collection}`,
          cause,
        }),
    });

    return refs.map((ref) => ({ id: ref.id, path: ref.path }));
  });
