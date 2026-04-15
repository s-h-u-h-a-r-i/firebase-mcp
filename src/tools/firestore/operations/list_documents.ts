import type { ProjectContext } from '../../../project';
import { Task } from '../../../task';
import type { OperationSchema } from '../../build-tool';
import type { FirestorePropKey } from '../properties';
import { collectionPathError } from '../utils/paths';

export class FirestoreListDocumentsError extends Error {
  readonly _tag = 'FirestoreListDocumentsError' as const;
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FirestoreListDocumentsError';
  }
}

export const LIST_DOCUMENTS = 'list_documents' as const;

export const listDocumentsOp: OperationSchema<FirestorePropKey> = {
  name: LIST_DOCUMENTS,
  description:
    'List all doc IDs including phantoms. Always includes subcollections per doc. Args: collection(ODD segments). Returns document paths (EVEN segments) with collections[] → use with get_document or list_collections.',
  properties: ['collection'],
};

export interface ListDocumentsArgs {
  collection: string;
}

export const listDocuments = (ctx: ProjectContext, input: ListDocumentsArgs) =>
  Task.gen(function* () {
    const err = collectionPathError(input.collection);
    if (err) {
      return yield* Task.fail(new FirestoreListDocumentsError(err));
    }
    yield* ctx.checkAccess(input.collection);

    const db = ctx.firestore();

    const refs = yield* Task.attempt({
      try: () => db.collection(input.collection).listDocuments(),
      catch: (cause) =>
        new FirestoreListDocumentsError(
          `Failed to list documents in: ${input.collection}`,
          cause,
        ),
    });

    const results = yield* Task.attempt({
      try: () =>
        Promise.all(
          refs.map(async (ref) => {
            const collections = await ref.listCollections();
            return {
              id: ref.id,
              path: ref.path,
              collections: collections.map((c) => c.path),
            };
          }),
        ),
      catch: (cause) =>
        new FirestoreListDocumentsError(
          `Failed to list subcollections in: ${input.collection}`,
          cause,
        ),
    });
    return results;
  });
