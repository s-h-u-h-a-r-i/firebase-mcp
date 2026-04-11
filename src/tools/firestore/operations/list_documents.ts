import { Tool } from '@modelcontextprotocol/sdk/types.js';

import type { ProjectContext } from '../../../project';
import { Task } from '../../../task';
import { collectionPathError } from '../utils/paths';

export class FirestoreListDocumentsError extends Error {
  readonly _tag = 'FirestoreListDocumentsError' as const;
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'FirestoreListDocumentsError';
  }
}

export const LIST_DOCUMENTS = 'list_documents' as const;

export interface ListDocumentsArgs {
  collection: string;
}

export const listDocumentsDefinition: Tool = {
  name: LIST_DOCUMENTS,
  description:
    'List all document IDs in a Firestore collection, including phantom documents (documents with no fields that exist only as parents of subcollections). Always includes subcollections per document. Use this when read_collection returns empty but subcollections are known to exist.',
  inputSchema: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        description:
          "Collection path, e.g. 'users' or 'shared/stores_data/ABC123'",
      },
      projectId: {
        type: 'string',
        description: 'Project key as defined in firebase-mcp.json',
      },
    },
    required: ['collection', 'projectId'],
  },
};

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
