import { Tool } from '@modelcontextprotocol/sdk/types.js';

import type { ProjectContext } from '../../../project';
import { Task } from '../../../task';
import { collectionPathError } from '../utils/paths';
import { FILTER_SCHEMA_ITEM, QueryFilter } from '../utils/types';

export class FirestoreCountError extends Error {
  readonly _tag = 'FirestoreCountError' as const;
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'FirestoreCountError';
  }
}

export const COUNT_DOCUMENTS = 'count_documents' as const;

export interface CountDocumentsArgs {
  collection: string;
  filters?: QueryFilter[];
}

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
        items: FILTER_SCHEMA_ITEM,
      },
      projectId: {
        type: 'string',
        description: 'Project key as defined in firebase-mcp.json',
      },
    },
    required: ['collection', 'projectId'],
  },
};

export const countDocuments = (ctx: ProjectContext, input: CountDocumentsArgs) =>
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
