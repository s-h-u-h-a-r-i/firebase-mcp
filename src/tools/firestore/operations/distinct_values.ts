import type { ProjectContext } from '../../../project';
import { Task } from '../../../task';
import { collectionPathError } from '../utils/paths';
import { QueryFilter } from '../utils/types';

export class FirestoreDistinctValuesError extends Error {
  readonly _tag = 'FirestoreDistinctValuesError' as const;
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'FirestoreDistinctValuesError';
  }
}

export const DISTINCT_VALUES = 'distinct_values' as const;

export interface DistinctValuesArgs {
  collection: string;
  field: string;
  filters?: QueryFilter[];
}

export const distinctValues = (ctx: ProjectContext, input: DistinctValuesArgs) =>
  Task.gen(function* () {
    const err = collectionPathError(input.collection);
    if (err) {
      return yield* Task.fail(new FirestoreDistinctValuesError(err));
    }
    yield* ctx.checkAccess(input.collection);

    const db = ctx.firestore();
    const fetchLimit = ctx.config.firestore.maxBatchFetchSize;

    const counts = new Map<string, number>();
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    let totalFetched = 0;

    while (true) {
      const snapshot: FirebaseFirestore.QuerySnapshot = yield* Task.attempt({
        try: () => {
          let query: FirebaseFirestore.Query = db
            .collection(input.collection)
            .select(input.field);

          for (const filter of input.filters ?? []) {
            query = query.where(filter.field, filter.operator, filter.value);
          }

          if (lastDoc) {
            query = query.startAfter(lastDoc);
          }

          return query.limit(fetchLimit).get();
        },
        catch: (cause) =>
          new FirestoreDistinctValuesError(
            `Failed to fetch documents from: ${input.collection}`,
            cause,
          ),
      });

      for (const doc of snapshot.docs) {
        const raw = doc.get(input.field);
        const key = raw === undefined || raw === null ? '__null__' : String(raw);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      totalFetched += snapshot.docs.length;

      if (snapshot.docs.length < fetchLimit) {
        break;
      }

      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    const values = Array.from(counts.entries())
      .map(([value, count]) => ({ value: value === '__null__' ? null : value, count }))
      .sort((a, b) => b.count - a.count);

    return { field: input.field, totalDocsFetched: totalFetched, values };
  });
