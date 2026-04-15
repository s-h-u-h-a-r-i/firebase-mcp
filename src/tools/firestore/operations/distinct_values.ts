import type { ProjectContext } from '../../../project';
import { Task } from '../../../task';
import type { OperationSchema } from '../../build-tool';
import type { FirestorePropKey } from '../properties';
import { collectionPathError } from '../utils/paths';
import { QueryFilter } from '../utils/types';

export class FirestoreDistinctValuesError extends Error {
  readonly _tag = 'FirestoreDistinctValuesError' as const;
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FirestoreDistinctValuesError';
  }
}

export const DISTINCT_VALUES = 'distinct_values' as const;

export const distinctValuesOp: OperationSchema<FirestorePropKey> = {
  name: DISTINCT_VALUES,
  description: [
    'Count occurrences of each unique value (or value combination) of one or more fields.',
    'Source: collection(ODD segments) OR collectionId(single name — queries across ALL subcollections with that name, like query_collection_group).',
    'Fields: field(single field name) OR fields([array of field names] — each result value becomes an object keyed by field name).',
    'groupByFields?([subset of fields] — use only these as the identity/grouping key;',
    '  remaining fields become label arrays of unique values seen per group,',
    '  e.g. groupByFields:["cashier"] with fields:["cashier","cashierNm"] groups by cashier ID',
    '  while collecting all cashierNm variants as a label — useful when a display name varies across collections but the ID is stable).',
    'filters?[].',
    'groupByPathSegment?(integer — when using collectionId, extracts this segment from the parent collection path as the byCollection key,',
    '  e.g. 2 turns "shared/stores_data/ABC123/data/purchase_orders" into "ABC123").',
    'minCollections?(integer or "all" — only return values present in at least this many distinct collection buckets;',
    '  "all" means present in every bucket found without knowing the count upfront;',
    '  operates on the groupByFields key so label variation across buckets does not cause missed matches;',
    '  all values are annotated with collectionCount and collections[] regardless).',
    'Fetches all matching docs internally (up to maxBatchFetchSize).',
    'Returns values[] sorted by count desc. When using collectionId, also returns byCollection{} broken down by parent collection (or extracted segment).',
  ].join(' '),
  properties: [
    'collection',
    'collectionId',
    'field',
    'fields',
    'groupByFields',
    'filters',
    'groupByPathSegment',
    'minCollections',
  ],
};

export interface DistinctValuesArgs {
  collection?: string;
  collectionId?: string;
  /** Single field shorthand. Use `fields` for multi-field grouping. */
  field?: string;
  /** Fields to fetch and group by. Use `groupByFields` to group on a subset while treating the rest as labels. */
  fields?: string[];
  /**
   * Subset of `fields` to use as the grouping/identity key.
   * Remaining fields are treated as labels: collected as arrays of unique values seen per group.
   * Useful when a display name may vary slightly across collections but the ID field is stable.
   */
  groupByFields?: string[];
  filters?: QueryFilter[];
  groupByPathSegment?: number;
  /**
   * Only return values that appear in at least this many distinct collection buckets.
   * Pass "all" to mean "present in every collection bucket found" without needing to
   * know the total count upfront. Only applies when using collectionId. All values are
   * annotated with collectionCount and collections[] regardless of whether this is set.
   */
  minCollections?: number | 'all';
}

type ScalarValue = string | null;

const rawToScalar = (raw: unknown): ScalarValue =>
  raw === undefined || raw === null ? null : String(raw);

const makeCompositeKey = (values: ScalarValue[]): string =>
  values.length === 1
    ? (values[0] ?? '__null__')
    : JSON.stringify(values.map((v) => v ?? '__null__'));

const parseCompositeKey = (key: string, fieldCount: number): ScalarValue[] => {
  if (fieldCount === 1) return [key === '__null__' ? null : key];
  const parts = JSON.parse(key) as string[];
  return parts.map((p) => (p === '__null__' ? null : p));
};

export const distinctValues = (
  ctx: ProjectContext,
  input: DistinctValuesArgs,
) =>
  Task.gen(function* () {
    const {
      collection,
      collectionId,
      filters,
      groupByPathSegment,
      minCollections,
    } = input;

    const fieldList: string[] = input.fields?.length
      ? input.fields
      : input.field
        ? [input.field]
        : [];

    if (fieldList.length === 0) {
      return yield* Task.fail(
        new FirestoreDistinctValuesError('Either field or fields is required.'),
      );
    }

    // Validate groupByFields is a non-empty subset of fieldList
    const groupByFields = input.groupByFields ?? fieldList;
    const invalidGroupBy = groupByFields.filter((f) => !fieldList.includes(f));
    if (invalidGroupBy.length > 0) {
      return yield* Task.fail(
        new FirestoreDistinctValuesError(
          `groupByFields contains fields not present in fields[]: ${invalidGroupBy.join(', ')}`,
        ),
      );
    }
    const labelFields = fieldList.filter((f) => !groupByFields.includes(f));

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

    // groupKey -> count
    const globalCounts = new Map<string, number>();
    // groupKey -> labelField -> Set of unique values seen
    const labelMap =
      labelFields.length > 0
        ? new Map<string, Map<string, Set<string>>>()
        : null;
    // collKey -> groupKey -> count (only in collection group mode)
    const byColl = collectionId ? new Map<string, Map<string, number>>() : null;

    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    let totalFetched = 0;

    while (true) {
      const snapshot: FirebaseFirestore.QuerySnapshot = yield* Task.attempt({
        try: () => {
          let query: FirebaseFirestore.Query = collection
            ? db.collection(collection).select(...fieldList)
            : db.collectionGroup(collectionId!).select(...fieldList);

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
        const groupKey = makeCompositeKey(
          groupByFields.map((f) => rawToScalar(doc.get(f))),
        );

        globalCounts.set(groupKey, (globalCounts.get(groupKey) ?? 0) + 1);

        if (labelMap) {
          if (!labelMap.has(groupKey)) labelMap.set(groupKey, new Map());
          const fieldSets = labelMap.get(groupKey)!;
          for (const f of labelFields) {
            if (!fieldSets.has(f)) fieldSets.set(f, new Set());
            const v = rawToScalar(doc.get(f));
            if (v !== null) fieldSets.get(f)!.add(v);
          }
        }

        if (byColl) {
          const collPath = doc.ref.parent.path;
          const collKey =
            groupByPathSegment !== undefined
              ? (collPath.split('/')[groupByPathSegment] ?? collPath)
              : collPath;
          if (!byColl.has(collKey)) byColl.set(collKey, new Map());
          const colCounts = byColl.get(collKey)!;
          colCounts.set(groupKey, (colCounts.get(groupKey) ?? 0) + 1);
        }
      }

      totalFetched += snapshot.docs.length;
      if (snapshot.docs.length < fetchLimit) break;
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    const resolvedMinCollections =
      minCollections === 'all' ? (byColl?.size ?? 0) : minCollections;

    // Build the values array
    const values = Array.from(globalCounts.entries())
      .map(([groupKey, count]) => {
        const groupScalars = parseCompositeKey(groupKey, groupByFields.length);

        // Build the value object
        let value: ScalarValue | Record<string, ScalarValue | string[]>;
        if (labelFields.length === 0 && groupByFields.length === 1) {
          // Simple single-field case: value is a plain scalar
          value = groupScalars[0];
        } else {
          const obj: Record<string, ScalarValue | string[]> =
            Object.fromEntries(
              groupByFields.map((f, i) => [f, groupScalars[i]]),
            );
          if (labelMap) {
            const fieldSets = labelMap.get(groupKey);
            for (const f of labelFields) {
              obj[f] = fieldSets?.get(f) ? Array.from(fieldSets.get(f)!) : [];
            }
          }
          value = obj;
        }

        const entry: {
          value: typeof value;
          count: number;
          collectionCount?: number;
          collections?: string[];
        } = { value, count };

        if (byColl) {
          const collections = Array.from(byColl.entries())
            .filter(([, colCounts]) => colCounts.has(groupKey))
            .map(([collKey]) => collKey);
          entry.collectionCount = collections.length;
          entry.collections = collections;
        }

        return entry;
      })
      .filter(
        (e) =>
          resolvedMinCollections === undefined ||
          (e.collectionCount ?? 0) >= resolvedMinCollections,
      )
      .sort((a, b) => b.count - a.count);

    const resolvedFields = fieldList.length === 1 ? fieldList[0] : fieldList;

    if (byColl) {
      // byCollection uses the same groupKey → scalar value mapping (no labels needed per-bucket)
      const byCollection: Record<
        string,
        { value: ScalarValue | Record<string, ScalarValue>; count: number }[]
      > = {};
      for (const [collKey, colCounts] of byColl.entries()) {
        byCollection[collKey] = Array.from(colCounts.entries())
          .map(([groupKey, count]) => {
            const groupScalars = parseCompositeKey(
              groupKey,
              groupByFields.length,
            );
            const value =
              groupByFields.length === 1
                ? groupScalars[0]
                : Object.fromEntries(
                    groupByFields.map((f, i) => [f, groupScalars[i]]),
                  );
            return { value, count };
          })
          .sort((a, b) => b.count - a.count);
      }
      return {
        fields: resolvedFields,
        totalDocsFetched: totalFetched,
        values,
        byCollection,
      };
    }

    return { fields: resolvedFields, totalDocsFetched: totalFetched, values };
  });
