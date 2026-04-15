import type { ProjectContext } from '../../../project';
import { Task } from '../../../task';
import type { OperationSchema } from '../../build-tool';
import type { FirestorePropKey } from '../properties';
import { collectionPathError } from '../utils/paths';
import { QueryFilter } from '../utils/types';

export class FirestoreCountError extends Error {
  readonly _tag = 'FirestoreCountError' as const;
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FirestoreCountError';
  }
}

export const COUNT_DOCUMENTS = 'count_documents' as const;

export const countDocumentsOp: OperationSchema<FirestorePropKey> = {
  name: COUNT_DOCUMENTS,
  description:
    'Server-side count without fetching docs. Args: collection(ODD segments), filters?[]',
  properties: ['collection', 'filters'],
};

export interface CountDocumentsArgs {
  collection: string;
  filters?: QueryFilter[];
}

export const countDocuments = (
  ctx: ProjectContext,
  input: CountDocumentsArgs,
) =>
  Task.gen(function* () {
    const err = collectionPathError(input.collection);
    if (err) {
      return yield* Task.fail(new FirestoreCountError(err));
    }
    yield* ctx.checkAccess(input.collection);

    const count = yield* Task.attempt({
      try: () => {
        let query: FirebaseFirestore.Query = ctx
          .firestore()
          .collection(input.collection);

        for (const filter of input.filters ?? []) {
          query = query.where(filter.field, filter.operator, filter.value);
        }

        return query
          .count()
          .get()
          .then((snap) => snap.data().count);
      },
      catch: (cause) =>
        new FirestoreCountError(
          `Failed to count documents in: ${input.collection}`,
          cause,
        ),
    });

    return { collection: input.collection, count };
  });
