import { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { Effect } from 'effect';

import {
  COUNT_DOCUMENTS,
  CountDocumentsArgs,
  GET_DOCUMENT,
  GetDocumentArgs,
  LIST_COLLECTIONS,
  LIST_DOCUMENTS,
  ListCollectionsArgs,
  ListDocumentsArgs,
  QUERY_COLLECTION,
  QueryCollectionArgs,
  READ_COLLECTION,
  ReadCollectionArgs,
  countDocuments,
  countDocumentsDefinition,
  getDocument,
  getDocumentDefinition,
  listCollections,
  listCollectionsDefinition,
  listDocuments,
  listDocumentsDefinition,
  queryCollection,
  queryCollectionDefinition,
  readCollection,
  readCollectionDefinition,
} from './firestore';

type ToolNames =
  | typeof COUNT_DOCUMENTS
  | typeof READ_COLLECTION
  | typeof GET_DOCUMENT
  | typeof LIST_COLLECTIONS
  | typeof LIST_DOCUMENTS
  | typeof QUERY_COLLECTION;

export const allToolDefinitions: Tool[] = [
  listCollectionsDefinition,
  listDocumentsDefinition,
  countDocumentsDefinition,
  readCollectionDefinition,
  getDocumentDefinition,
  queryCollectionDefinition,
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
      case COUNT_DOCUMENTS:
        return yield* countDocuments(args as unknown as CountDocumentsArgs);
      case LIST_COLLECTIONS:
        return yield* listCollections(args as unknown as ListCollectionsArgs);
      case LIST_DOCUMENTS:
        return yield* listDocuments(args as unknown as ListDocumentsArgs);
      case READ_COLLECTION:
        return yield* readCollection(args as unknown as ReadCollectionArgs);
      case GET_DOCUMENT:
        return yield* getDocument(args as unknown as GetDocumentArgs);
      case QUERY_COLLECTION:
        return yield* queryCollection(args as unknown as QueryCollectionArgs);
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
