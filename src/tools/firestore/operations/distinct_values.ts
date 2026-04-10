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
  collection?: string;
  collectionId?: string;
  field: string;
  filters?: QueryFilter[];
  groupByPathSegment?: number;
}

type ValueCount = { value: string | null; count: number };

const toValueCounts = (map: Map<string, number>): ValueCount[] =>
  Array.from(map.entries())
    .map(([value, count]) => ({ value: value === '__null__' ? null : value, count }))
    .sort((a, b) => b.count - a.count);

export const distinctValues = (ctx: ProjectContext, input: DistinctValuesArgs) =>
  Task.gen(function* () {
    const { collection, collectionId, field, filters, groupByPathSegment } = input;

    if (!collection && !collectionId) {
      return yield* Task.fail(
        new FirestoreDistinctValuesError(
          'Either collection or collectionId is required.',
        ),
      );
    }
    if (collection && collectionId) {
      return yield* Task.fail(
        new FirestoreDistinctValuesError(
          'Provide either collection or collectionId, not both.',
        ),
      );
    }

    if (collection) {
      const err = collectionPathError(collection);
      if (err) return yield* Task.fail(new FirestoreDistinctValuesError(err));
      yield* ctx.checkAccess(collection);
    }

    const db = ctx.firestore();
    const fetchLimit = ctx.config.firestore.maxBatchFetchSize;

    const globalCounts = new Map<string, number>();
    // only populated when using collectionId (collection group mode)
    const byColl = collectionId ? new Map<string, Map<string, number>>() : null;

    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    let totalFetched = 0;

    while (true) {
      const snapshot: FirebaseFirestore.QuerySnapshot = yield* Task.attempt({
        try: () => {
          let query: FirebaseFirestore.Query = collection
            ? db.collection(collection).select(field)
            : db.collectionGroup(collectionId!).select(field);

          for (const filter of filters ?? []) {
            query = query.where(filter.field, filter.operator, filter.value);
          }

          if (lastDoc) query = query.startAfter(lastDoc);

          return query.limit(fetchLimit).get();
        },
        catch: (cause) =>
          new FirestoreDistinctValuesError(
            `Failed to fetch documents from: ${collection ?? collectionId}`,
            cause,
          ),
      });

      for (const doc of snapshot.docs) {
        const raw = doc.get(field);
        const key = raw === undefined || raw === null ? '__null__' : String(raw);

        globalCounts.set(key, (globalCounts.get(key) ?? 0) + 1);

        if (byColl) {
          const collPath = doc.ref.parent.path;
          const groupKey =
            groupByPathSegment !== undefined
              ? (collPath.split('/')[groupByPathSegment] ?? collPath)
              : collPath;
          if (!byColl.has(groupKey)) byColl.set(groupKey, new Map());
          const colCounts = byColl.get(groupKey)!;
          colCounts.set(key, (colCounts.get(key) ?? 0) + 1);
        }
      }

      totalFetched += snapshot.docs.length;

      if (snapshot.docs.length < fetchLimit) break;

      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    const values = toValueCounts(globalCounts);

    if (byColl) {
      const byCollection: Record<string, ValueCount[]> = {};
      for (const [collPath, counts] of byColl.entries()) {
        byCollection[collPath] = toValueCounts(counts);
      }
      return { field, totalDocsFetched: totalFetched, values, byCollection };
    }

    return { field, totalDocsFetched: totalFetched, values };
  });
