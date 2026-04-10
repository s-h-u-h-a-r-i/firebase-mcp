import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Data, Effect } from 'effect';
import { AggregateField } from 'firebase-admin/firestore';

import { AccessService } from '../../access';
import { FirebaseService } from '../../firebase';
import { FILTER_SCHEMA_ITEM, QueryFilter } from './types';

export class FirestoreAggregateError extends Data.TaggedError(
  'FirestoreAggregateError',
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const AGGREGATE_COLLECTION = 'aggregate_collection' as const;

export interface AggregationSpec {
  alias: string;
  type: 'sum' | 'avg' | 'count';
  field?: string;
}

export interface AggregateCollectionArgs {
  collection: string;
  aggregations: AggregationSpec[];
  filters?: QueryFilter[];
}

export const aggregateCollectionDefinition: Tool = {
  name: AGGREGATE_COLLECTION,
  description:
    'Run native server-side sum(), avg(), and count() aggregations over a Firestore collection without fetching documents. Supports optional where-clause filters.',
  inputSchema: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        description: "Collection path, e.g. 'orders' or 'stores/abc/orders'",
      },
      aggregations: {
        type: 'array',
        description:
          'One or more aggregations to compute in a single round-trip',
        items: {
          type: 'object',
          properties: {
            alias: {
              type: 'string',
              description:
                'Key name for this result in the response, e.g. "totalRevenue"',
            },
            type: {
              type: 'string',
              enum: ['sum', 'avg', 'count'],
              description: '"sum" and "avg" require a field; "count" does not',
            },
            field: {
              type: 'string',
              description: 'Field path to aggregate (required for sum and avg)',
            },
          },
          required: ['alias', 'type'],
        },
        minItems: 1,
      },
      filters: {
        type: 'array',
        description: 'Optional where-clause filters to narrow the aggregation',
        items: FILTER_SCHEMA_ITEM,
      },
      projectId: {
        type: 'string',
        description: 'Project key as defined in firebase-mcp.json',
      },
    },
    required: ['collection', 'aggregations', 'projectId'],
  },
};

export const aggregateCollection = (input: AggregateCollectionArgs) =>
  Effect.gen(function* () {
    const access = yield* AccessService;
    yield* access.check(input.collection);

    const { firestore } = yield* FirebaseService;

    const result = yield* Effect.tryPromise({
      try: () => {
        let query: FirebaseFirestore.Query = firestore().collection(
          input.collection,
        );

        for (const filter of input.filters ?? []) {
          query = query.where(filter.field, filter.operator, filter.value);
        }

        const spec = Object.fromEntries(
          input.aggregations.map((agg) => {
            if (agg.type === 'count')
              return [agg.alias, AggregateField.count()];
            if (agg.type === 'sum')
              return [agg.alias, AggregateField.sum(agg.field!)];
            return [agg.alias, AggregateField.average(agg.field!)];
          }),
        );

        return query
          .aggregate(spec)
          .get()
          .then((snap) => snap.data());
      },
      catch: (cause) =>
        new FirestoreAggregateError({
          message: `Failed to aggregate collection: ${input.collection}`,
          cause,
        }),
    });

    return { collection: input.collection, result };
  });
