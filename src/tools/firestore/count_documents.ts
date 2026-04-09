import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Data, Effect } from 'effect';
import { WhereFilterOp } from 'firebase-admin/firestore';

import { AccessService } from '../../access';
import { FirebaseService } from '../../firebase';
import { QueryFilter } from './query_collection';

export class FirestoreCountError extends Data.TaggedError(
  'FirestoreCountError',
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const COUNT_DOCUMENTS = 'count_documents' as const;

export interface CountDocumentsArgs {
  collection: string;
  filters?: QueryFilter[];
}

const VALID_OPERATORS: WhereFilterOp[] = [
  '<',
  '<=',
  '==',
  '!=',
  '>=',
  '>',
  'array-contains',
  'array-contains-any',
  'in',
  'not-in',
];

export const countDocumentsDefinition: Tool = {
  name: COUNT_DOCUMENTS,
  description:
    'Count documents in a Firestore collection, with optional filters. Uses native server-side count — does not fetch documents.',
  inputSchema: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        description: "Collection path, e.g. 'users' or 'users/123/posts'",
      },
      filters: {
        type: 'array',
        description: 'Optional where-clause filters to narrow the count',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string', description: 'Field name to filter on' },
            operator: {
              type: 'string',
              enum: VALID_OPERATORS,
              description: 'Comparison operator',
            },
            value: {
              description:
                'Value to compare against (string, number, boolean, null, or array for in/array-contains-any/not-in)',
            },
          },
          required: ['field', 'operator', 'value'],
        },
      },
    },
    required: ['collection'],
  },
};

export const countDocuments = (input: CountDocumentsArgs) =>
  Effect.gen(function* () {
    const access = yield* AccessService;
    yield* access.check(input.collection);

    const { firestore } = yield* FirebaseService;

    const count = yield* Effect.tryPromise({
      try: () => {
        let query: FirebaseFirestore.Query = firestore().collection(
          input.collection,
        );

        for (const filter of input.filters ?? []) {
          query = query.where(filter.field, filter.operator, filter.value);
        }

        return query
          .count()
          .get()
          .then((snap) => snap.data().count);
      },
      catch: (cause) =>
        new FirestoreCountError({
          message: `Failed to count documents in: ${input.collection}`,
          cause,
        }),
    });

    return { collection: input.collection, count };
  });
