import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Data, Effect } from 'effect';
import { AccessService } from '../../access';
import { FirebaseService } from '../../firebase';
import { normalizeDocument } from './normalize';

export class FirestoreGetError extends Data.TaggedError('FirestoreGetError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class DocumentNotFoundError extends Data.TaggedError(
  'DocumentNotFoundError',
)<{
  readonly path: string;
}> {}

export const GET_DOCUMENT = 'get_document' as const;

export const getDocumentDefinition: Tool = {
  name: GET_DOCUMENT,
  description: 'Get a single Firestore document by path',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: "Full document path, e.g. 'users/123' ",
      },
    },
    required: ['path'],
  },
};

export const getDocument = (input: { path: string }) =>
  Effect.gen(function* () {
    const access = yield* AccessService;
    yield* access.check(input.path);

    const { firestore } = yield* FirebaseService;

    const docRef = yield* Effect.try({
      try: () => firestore().doc(input.path),
      catch: (cause) =>
        new FirestoreGetError({
          message: `Invalid document path: ${input.path}`,
          cause,
        }),
    });

    const snap = yield* Effect.tryPromise({
      try: () => docRef.get(),
      catch: (cause) =>
        new FirestoreGetError({
          message: `Failed to get document: ${input.path}`,
          cause,
        }),
    });

    if (!snap.exists) {
      return yield* Effect.fail(
        new DocumentNotFoundError({ path: input.path }),
      );
    }

    return normalizeDocument(snap);
  });
