import type { ProjectContext } from '../../../project';
import { Task } from '../../../task';
import type { OperationSchema } from '../../build-tool';
import type { FirestorePropKey } from '../properties';
import { collectionPathError, documentPathError } from '../utils/paths';
import { normalizeDocument } from '../utils/types';

export class FirestoreGetManyError extends Error {
  readonly _tag = 'FirestoreGetManyError' as const;
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FirestoreGetManyError';
  }
}

export const GET_MANY_DOCUMENTS = 'get_many_documents' as const;

export const getManyDocumentsOp: OperationSchema<FirestorePropKey> = {
  name: GET_MANY_DOCUMENTS,
  description:
    'Batch-fetch documents. Args: paths?[](each EVEN segments) OR (collection(ODD segments) + ids[]); select?[]',
  properties: ['paths', 'collection', 'ids', 'select'],
};

export interface GetManyDocumentsArgs {
  paths?: string[];
  collection?: string;
  ids?: string[];
  select?: string[];
}

export const getManyDocuments = (
  ctx: ProjectContext,
  input: GetManyDocumentsArgs,
) =>
  Task.gen(function* () {
    const db = ctx.firestore();
    const maxBatchSize = ctx.config.firestore.maxBatchFetchSize;

    let allPaths: string[] = [];

    if (input.paths?.length) {
      for (const p of input.paths) {
        const err = documentPathError(p);
        if (err) {
          return yield* Task.fail(new FirestoreGetManyError(err));
        }
      }
      allPaths = input.paths;
    } else if (input.collection && input.ids?.length) {
      const collErr = collectionPathError(input.collection);
      if (collErr) {
        return yield* Task.fail(new FirestoreGetManyError(collErr));
      }
      allPaths = input.ids.map((id) => `${input.collection}/${id}`);
    } else {
      return yield* Task.fail(
        new FirestoreGetManyError(
          'Provide either paths, or both collection and ids.',
        ),
      );
    }

    if (allPaths.length > maxBatchSize) {
      return yield* Task.fail(
        new FirestoreGetManyError(
          `Batch size ${allPaths.length} exceeds maxBatchSize (${maxBatchSize}). Split into smaller batches.`,
        ),
      );
    }

    // Access check on each unique collection path
    const uniqueCollections = [
      ...new Set(allPaths.map((p) => p.split('/').slice(0, -1).join('/'))),
    ];
    for (const col of uniqueCollections) {
      yield* ctx.checkAccess(col);
    }

    const docRefs = allPaths.map((p) => db.doc(p));

    const snaps = yield* Task.attempt({
      try: () =>
        input.select?.length
          ? db.getAll(...docRefs, { fieldMask: input.select })
          : db.getAll(...docRefs),
      catch: (cause) => new FirestoreGetManyError('Batch fetch failed', cause),
    });

    return snaps.map((snap) =>
      snap.exists
        ? { found: true, ...normalizeDocument(snap) }
        : { found: false, id: snap.id, path: snap.ref.path },
    );
  });
