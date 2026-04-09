import { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { Effect } from 'effect';

import * as FirestoreTool from './firestore';

type ToolNames =
  | typeof FirestoreTool.COUNT_DOCUMENTS
  | typeof FirestoreTool.GET_COLLECTION_SCHEMA
  | typeof FirestoreTool.GET_MANY_DOCUMENTS
  | typeof FirestoreTool.LIST_INDEXES
  | typeof FirestoreTool.READ_COLLECTION
  | typeof FirestoreTool.GET_DOCUMENT
  | typeof FirestoreTool.LIST_COLLECTIONS
  | typeof FirestoreTool.LIST_DOCUMENTS
  | typeof FirestoreTool.QUERY_COLLECTION
  | typeof FirestoreTool.QUERY_COLLECTION_GROUP;

export const allToolDefinitions: Tool[] = [
  FirestoreTool.listCollectionsDefinition,
  FirestoreTool.listDocumentsDefinition,
  FirestoreTool.listIndexesDefinition,
  FirestoreTool.getCollectionSchemaDefinition,
  FirestoreTool.countDocumentsDefinition,
  FirestoreTool.readCollectionDefinition,
  FirestoreTool.getDocumentDefinition,
  FirestoreTool.getManyDocumentsDefinition,
  FirestoreTool.queryCollectionDefinition,
  FirestoreTool.queryCollectionGroupDefinition,
];

const toErrorResult = (
  code: string,
  message: string,
  details?: unknown,
): CallToolResult => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        success: false,
        error: { code, message, details },
      }),
    },
  ],
  isError: true,
});

const toSuccessResult = (data: unknown): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify({ success: true, data }) }],
});

export const dispatchTool = (
  name: ToolNames | (string & {}),
  args: Record<string, unknown>,
) =>
  Effect.gen(function* () {
    switch (name) {
      case FirestoreTool.COUNT_DOCUMENTS:
        return yield* FirestoreTool.countDocuments(
          args as unknown as FirestoreTool.CountDocumentsArgs,
        );
      case FirestoreTool.GET_COLLECTION_SCHEMA:
        return yield* FirestoreTool.getCollectionSchema(
          args as unknown as FirestoreTool.GetCollectionSchemaArgs,
        );
      case FirestoreTool.GET_MANY_DOCUMENTS:
        return yield* FirestoreTool.getManyDocuments(
          args as unknown as FirestoreTool.GetManyDocumentsArgs,
        );
      case FirestoreTool.LIST_INDEXES:
        return yield* FirestoreTool.listIndexes(
          args as unknown as FirestoreTool.ListIndexesArgs,
        );
      case FirestoreTool.QUERY_COLLECTION_GROUP:
        return yield* FirestoreTool.queryCollectionGroup(
          args as unknown as FirestoreTool.QueryCollectionGroupArgs,
        );
      case FirestoreTool.LIST_COLLECTIONS:
        return yield* FirestoreTool.listCollections(
          args as unknown as FirestoreTool.ListCollectionsArgs,
        );
      case FirestoreTool.LIST_DOCUMENTS:
        return yield* FirestoreTool.listDocuments(
          args as unknown as FirestoreTool.ListDocumentsArgs,
        );
      case FirestoreTool.READ_COLLECTION:
        return yield* FirestoreTool.readCollection(
          args as unknown as FirestoreTool.ReadCollectionArgs,
        );
      case FirestoreTool.GET_DOCUMENT:
        return yield* FirestoreTool.getDocument(
          args as unknown as FirestoreTool.GetDocumentArgs,
        );
      case FirestoreTool.QUERY_COLLECTION:
        return yield* FirestoreTool.queryCollection(
          args as unknown as FirestoreTool.QueryCollectionArgs,
        );
      default:
        return yield* Effect.fail({ _tag: 'UnknownTool' as const, name });
    }
  }).pipe(
    Effect.map(toSuccessResult),
    Effect.catchAll((err) => {
      switch (err._tag) {
        case 'AccessDeniedError':
          return Effect.succeed(
            toErrorResult(
              'ACCESS_DENIED',
              `Access to path '${err.path}' is not allowed`,
              { path: err.path, suggestion: { allow: [err.path] } },
            ),
          );
        case 'DocumentNotFoundError':
          return Effect.succeed(
            toErrorResult('NOT_FOUND', `Document not found: ${err.path}`, {
              path: err.path,
            }),
          );
        case 'FirestoreReadError':
        case 'FirestoreGetError':
        case 'FirestoreQueryError':
        case 'FirestoreListCollectionsError':
        case 'FirestoreListDocumentsError':
        case 'FirestoreCountError':
        case 'FirestoreSchemaError':
        case 'FirestoreGetManyError':
        case 'FirestoreListIndexesError':
        case 'FirestoreCollectionGroupQueryError':
          return Effect.succeed(
            toErrorResult('FIRESTORE_ERROR', err.message, {
              cause: String(err.cause),
            }),
          );
        case 'UnknownTool':
          return Effect.succeed(
            toErrorResult('UNKNOWN_TOOL', `Unknown tool: ${err.name}`),
          );
      }
    }),
  );
