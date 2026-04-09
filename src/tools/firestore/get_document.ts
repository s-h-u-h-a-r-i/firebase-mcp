import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Data, Effect } from 'effect';

import { AccessService } from '../../access';
import { FirebaseService } from '../../firebase';
import { normalizeDocument } from './types';

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

export interface GetDocumentArgs {
  path: string;
  select?: string[];
}

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
      select: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional list of field paths to return. Omit to return all fields.',
      },
    },
    required: ['path'],
  },
};

export const getDocument = (input: GetDocumentArgs) =>
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
      try: () =>
        input.select?.length
          ? firestore()
              .getAll(docRef, { fieldMask: input.select })
              .then((snaps) => snaps[0])
          : docRef.get(),
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
