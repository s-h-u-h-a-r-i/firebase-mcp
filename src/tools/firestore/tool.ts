import { Tool } from '@modelcontextprotocol/sdk/types.js';

import type { ProjectContext } from '../../project';
import { Task } from '../../task';
import {
  AGGREGATE_COLLECTION,
  aggregateCollection,
  AggregateCollectionArgs,
} from './operations/aggregate_collection';
import {
  DISTINCT_VALUES,
  distinctValues,
  DistinctValuesArgs,
} from './operations/distinct_values';
import {
  COUNT_DOCUMENTS,
  countDocuments,
  CountDocumentsArgs,
} from './operations/count_documents';
import {
  GET_COLLECTION_SCHEMA,
  getCollectionSchema,
  GetCollectionSchemaArgs,
} from './operations/get_collection_schema';
import { GET_DOCUMENT, getDocument, GetDocumentArgs } from './operations/get_document';
import {
  GET_MANY_DOCUMENTS,
  getManyDocuments,
  GetManyDocumentsArgs,
} from './operations/get_many_documents';
import {
  LIST_COLLECTIONS,
  listCollections,
  ListCollectionsArgs,
} from './operations/list_collections';
import {
  LIST_DOCUMENTS,
  listDocuments,
  ListDocumentsArgs,
} from './operations/list_documents';
import { LIST_INDEXES, listIndexes, ListIndexesArgs } from './operations/list_indexes';
import {
  QUERY_COLLECTION,
  queryCollection,
  QueryCollectionArgs,
} from './operations/query_collection';
import {
  QUERY_COLLECTION_GROUP,
  queryCollectionGroup,
  QueryCollectionGroupArgs,
} from './operations/query_collection_group';
import {
  READ_COLLECTION,
  readCollection,
  ReadCollectionArgs,
} from './operations/read_collections';
import { FILTER_SCHEMA_ITEM, ORDER_BY_SCHEMA_ITEM } from './utils/types';

const READ_OPERATIONS = [
  LIST_COLLECTIONS,
  LIST_DOCUMENTS,
  READ_COLLECTION,
  GET_DOCUMENT,
  GET_MANY_DOCUMENTS,
  QUERY_COLLECTION,
  QUERY_COLLECTION_GROUP,
  COUNT_DOCUMENTS,
  AGGREGATE_COLLECTION,
  GET_COLLECTION_SCHEMA,
  LIST_INDEXES,
  DISTINCT_VALUES,
] as const;

type ReadOperations = (typeof READ_OPERATIONS)[number];

export class UnknownFirestoreOperationError extends Error {
  readonly _tag = 'UnknownFirestoreOperationError' as const;
  constructor(readonly operation: string) {
    super(`Unknown firestore_read operation: ${operation}`);
    this.name = 'UnknownFirestoreOperationError';
  }
}

export const FIRESTORE_READ = 'firestore_read' as const;

export const firestoreReadDefinition: Tool = {
  name: FIRESTORE_READ,
  description:
    'Read from Firebase Firestore. Use the operation field to select what to do.',
  inputSchema: {
    type: 'object',
    required: ['operation', 'projectId'],
    properties: {
      operation: {
        type: 'string',
        enum: [...READ_OPERATIONS],
        description: [
          'Firestore paths alternate between collections (odd segments) and documents (even segments).',
          'Collection path examples: "users", "stores/ABC/orders". Document path examples: "users/123", "stores/ABC/orders/456".',
          'Operations that take `collection` require an ODD-segment path. Operations that take `path` require an EVEN-segment path.',
          'Passing the wrong path type returns a clear error with a suggested fix.',
          '',
          'The Firestore operation to perform:',
          '- list_collections: List root collections, or subcollections of a document. Args: path?(EVEN segments — document path, e.g. "stores/ABC"), includeCounts?(bool). Returns collection paths (ODD segments) → use with list_documents or read_collection.',
          '- list_documents: List all doc IDs including phantoms. Args: collection(ODD segments), includeCollections?(bool). Returns document paths (EVEN segments) → use with get_document or list_collections.',
          '- read_collection: Read documents from a collection. Args: collection(ODD segments), limit?, select?[], startAfter?(doc ID), includePhantoms?(bool)',
          '- get_document: Fetch a single document by path. Args: path(EVEN segments, e.g. "users/123"), select?[]',
          '- get_many_documents: Batch-fetch documents. Args: paths?[](each EVEN segments) OR (collection(ODD segments) + ids[]); select?[]',
          '- query_collection: Query with filters/ordering/pagination. Args: collection(ODD segments), filters?[], orderBy?[], limit?, select?[], startAfter?(doc ID)',
          '- query_collection_group: Query across all subcollections with the same name. Args: collectionId(single name, no slashes), filters?[], orderBy?[], limit?, select?[], startAfter?(full doc path)',
          '- count_documents: Server-side count without fetching docs. Args: collection(ODD segments), filters?[]',
          '- aggregate_collection: Server-side sum/avg/count aggregations. Args: collection(ODD segments), aggregations[]{alias,type,field?}, filters?[]',
          '- get_collection_schema: Infer field types by sampling docs. Args: collection(ODD segments), sampleSize?(default 20)',
          '- list_indexes: List composite indexes. Args: collectionGroup?(filter by name), includeNotReady?(bool)',
          '- distinct_values: Count occurrences of each unique value of a field. Args: collection(ODD segments) OR collectionId(single name — queries across ALL subcollections with that name, like query_collection_group), field(field name), filters?[]. Fetches all matching docs internally (up to maxBatchFetchSize). Returns values[] sorted by count desc. When using collectionId, also returns byCollection{} — counts broken down by each parent collection path, e.g. per-store breakdown.',
        ].join('\n'),
      },
      projectId: {
        type: 'string',
        description: 'Project key as defined in firebase-mcp.json',
      },
      path: {
        type: 'string',
        description:
          "Document path for get_document (e.g. 'users/123') or optional document path for list_collections subcollections",
      },
      collection: {
        type: 'string',
        description: "Collection path (e.g. 'users' or 'users/123/posts')",
      },
      collectionId: {
        type: 'string',
        description:
          "Collection name for query_collection_group (e.g. 'orders')",
      },
      paths: {
        type: 'array',
        items: { type: 'string' },
        description:
          "Full document paths for get_many_documents (e.g. ['users/123', 'orders/456'])",
      },
      ids: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Document IDs within the collection field for get_many_documents',
      },
      filters: {
        type: 'array',
        items: FILTER_SCHEMA_ITEM,
        description: 'Where-clause filters',
      },
      orderBy: {
        type: 'array',
        items: ORDER_BY_SCHEMA_ITEM,
        description: 'Ordering of results',
      },
      limit: {
        type: 'number',
        description: 'Max number of documents to return',
      },
      select: {
        type: 'array',
        items: { type: 'string' },
        description: 'Field paths to return. Omit for all fields.',
      },
      startAfter: {
        type: 'string',
        description:
          'Pagination cursor: doc ID for query_collection/read_collection, full doc path for query_collection_group',
      },
      aggregations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            alias: {
              type: 'string',
              description: 'Key name for this result in the response',
            },
            type: {
              type: 'string',
              enum: ['sum', 'avg', 'count'],
              description: '"sum" and "avg" require a field; "count" does not',
            },
            field: {
              type: 'string',
              description: 'Field path to aggregate (required for sum/avg)',
            },
          },
          required: ['alias', 'type'],
        },
        description: 'Aggregations for aggregate_collection',
      },
      includeCollections: {
        type: 'boolean',
        description: 'list_documents: also return subcollections of each doc',
      },
      includeCounts: {
        type: 'boolean',
        description: 'list_collections: include document count per collection',
      },
      includePhantoms: {
        type: 'boolean',
        description:
          'read_collection: fall back to listDocuments() when the collection returns no docs',
      },
      includeNotReady: {
        type: 'boolean',
        description:
          'list_indexes: include indexes still being created or needing repair',
      },
      sampleSize: {
        type: 'number',
        description:
          'get_collection_schema: number of documents to sample (default 20)',
      },
      collectionGroup: {
        type: 'string',
        description:
          'list_indexes: filter results to a specific collection group name',
      },
      field: {
        type: 'string',
        description: 'distinct_values: field name to count unique values for',
      },
    },
  },
};

export const dispatchFirestoreRead = (
  ctx: ProjectContext,
  operation: ReadOperations | (string & {}),
  args: unknown,
) => {
  const a = args;
  return Task.gen(function* () {
    switch (operation) {
      case LIST_COLLECTIONS:
        return yield* listCollections(ctx, a as ListCollectionsArgs);
      case LIST_DOCUMENTS:
        return yield* listDocuments(ctx, a as ListDocumentsArgs);
      case READ_COLLECTION:
        return yield* readCollection(ctx, a as ReadCollectionArgs);
      case GET_DOCUMENT:
        return yield* getDocument(ctx, a as GetDocumentArgs);
      case GET_MANY_DOCUMENTS:
        return yield* getManyDocuments(ctx, a as GetManyDocumentsArgs);
      case QUERY_COLLECTION:
        return yield* queryCollection(ctx, a as QueryCollectionArgs);
      case QUERY_COLLECTION_GROUP:
        return yield* queryCollectionGroup(ctx, a as QueryCollectionGroupArgs);
      case COUNT_DOCUMENTS:
        return yield* countDocuments(ctx, a as CountDocumentsArgs);
      case AGGREGATE_COLLECTION:
        return yield* aggregateCollection(ctx, a as AggregateCollectionArgs);
      case GET_COLLECTION_SCHEMA:
        return yield* getCollectionSchema(ctx, a as GetCollectionSchemaArgs);
      case LIST_INDEXES:
        return yield* listIndexes(ctx, a as ListIndexesArgs);
      case DISTINCT_VALUES:
        return yield* distinctValues(ctx, a as DistinctValuesArgs);
      default:
        return yield* Task.fail(
          new UnknownFirestoreOperationError(String(operation)),
        );
    }
  });
};
