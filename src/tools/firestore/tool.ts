import type { ProjectContext } from '../../project';
import { Task } from '../../task';
import { buildTool } from '../build-tool';
import {
  AGGREGATE_COLLECTION,
  aggregateCollection,
  AggregateCollectionArgs,
  aggregateCollectionOp,
} from './operations/aggregate_collection';
import {
  COUNT_DOCUMENTS,
  countDocuments,
  CountDocumentsArgs,
  countDocumentsOp,
} from './operations/count_documents';
import {
  DISTINCT_VALUES,
  distinctValues,
  DistinctValuesArgs,
  distinctValuesOp,
} from './operations/distinct_values';
import {
  GET_COLLECTION_SCHEMA,
  getCollectionSchema,
  GetCollectionSchemaArgs,
  getCollectionSchemaOp,
} from './operations/get_collection_schema';
import {
  GET_DOCUMENT,
  getDocument,
  GetDocumentArgs,
  getDocumentOp,
} from './operations/get_document';
import {
  GET_MANY_DOCUMENTS,
  getManyDocuments,
  GetManyDocumentsArgs,
  getManyDocumentsOp,
} from './operations/get_many_documents';
import {
  LIST_COLLECTIONS,
  listCollections,
  ListCollectionsArgs,
  listCollectionsOp,
} from './operations/list_collections';
import {
  LIST_PATHS,
  listPaths,
  ListPathsArgs,
  listPathsOp,
} from './operations/list_paths';
import {
  LIST_DOCUMENTS,
  listDocuments,
  ListDocumentsArgs,
  listDocumentsOp,
} from './operations/list_documents';
import {
  LIST_INDEXES,
  listIndexes,
  ListIndexesArgs,
  listIndexesOp,
} from './operations/list_indexes';
import {
  QUERY_COLLECTION,
  queryCollection,
  QueryCollectionArgs,
  queryCollectionOp,
} from './operations/query_collection';
import {
  QUERY_COLLECTION_GROUP,
  queryCollectionGroup,
  QueryCollectionGroupArgs,
  queryCollectionGroupOp,
} from './operations/query_collection_group';
import {
  READ_COLLECTION,
  readCollection,
  ReadCollectionArgs,
  readCollectionOp,
} from './operations/read_collections';
import { FIRESTORE_PROPS } from './properties';

const READ_OPERATIONS = [
  LIST_PATHS,
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

export const firestoreReadDefinition = buildTool({
  name: FIRESTORE_READ,
  description:
    'Read from Firebase Firestore. Use the operation field to select what to do.',
  allProperties: FIRESTORE_PROPS,
  ops: [
    listPathsOp,
    listCollectionsOp,
    listDocumentsOp,
    readCollectionOp,
    getDocumentOp,
    getManyDocumentsOp,
    queryCollectionOp,
    queryCollectionGroupOp,
    countDocumentsOp,
    aggregateCollectionOp,
    getCollectionSchemaOp,
    listIndexesOp,
    distinctValuesOp,
  ],
});

export const dispatchFirestoreRead = (
  ctx: ProjectContext,
  operation: ReadOperations | (string & {}),
  args: unknown,
) => {
  const a = args;
  return Task.gen(function* () {
    switch (operation) {
      case LIST_PATHS:
        return yield* listPaths(ctx, a as ListPathsArgs);
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
