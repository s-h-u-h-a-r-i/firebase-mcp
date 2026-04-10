import { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';

import type { ProjectContext } from '../project';
import { Task } from '../task';
import * as AuthTool from './auth';
import * as ConfigTool from './config';
import * as FirestoreTool from './firestore';

export { GET_CONFIG, getConfig, RELOAD_CONFIG, reloadConfig } from './config';

class UnknownToolError extends Error {
  readonly _tag = 'UnknownTool' as const;
  constructor(readonly toolName: string) {
    super(`Unknown tool: ${toolName}`);
    this.name = 'UnknownToolError';
  }
}

export const allToolDefinitions: Tool[] = [
  ConfigTool.getConfigDefinition,
  ConfigTool.reloadConfigDefinition,
  FirestoreTool.aggregateCollectionDefinition,
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
  AuthTool.getUserDefinition,
  AuthTool.listUsersDefinition,
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
  ctx: ProjectContext,
  name: string,
  args: Record<string, unknown>,
): Task<CallToolResult, never> =>
  Task.gen(function* () {
    switch (name) {
      case FirestoreTool.AGGREGATE_COLLECTION:
        return yield* FirestoreTool.aggregateCollection(
          ctx,
          args as unknown as FirestoreTool.AggregateCollectionArgs,
        );
      case FirestoreTool.COUNT_DOCUMENTS:
        return yield* FirestoreTool.countDocuments(
          ctx,
          args as unknown as FirestoreTool.CountDocumentsArgs,
        );
      case FirestoreTool.GET_COLLECTION_SCHEMA:
        return yield* FirestoreTool.getCollectionSchema(
          ctx,
          args as unknown as FirestoreTool.GetCollectionSchemaArgs,
        );
      case FirestoreTool.GET_MANY_DOCUMENTS:
        return yield* FirestoreTool.getManyDocuments(
          ctx,
          args as unknown as FirestoreTool.GetManyDocumentsArgs,
        );
      case FirestoreTool.LIST_INDEXES:
        return yield* FirestoreTool.listIndexes(
          ctx,
          args as unknown as FirestoreTool.ListIndexesArgs,
        );
      case FirestoreTool.QUERY_COLLECTION_GROUP:
        return yield* FirestoreTool.queryCollectionGroup(
          ctx,
          args as unknown as FirestoreTool.QueryCollectionGroupArgs,
        );
      case FirestoreTool.LIST_COLLECTIONS:
        return yield* FirestoreTool.listCollections(
          ctx,
          args as unknown as FirestoreTool.ListCollectionsArgs,
        );
      case FirestoreTool.LIST_DOCUMENTS:
        return yield* FirestoreTool.listDocuments(
          ctx,
          args as unknown as FirestoreTool.ListDocumentsArgs,
        );
      case FirestoreTool.READ_COLLECTION:
        return yield* FirestoreTool.readCollection(
          ctx,
          args as unknown as FirestoreTool.ReadCollectionArgs,
        );
      case FirestoreTool.GET_DOCUMENT:
        return yield* FirestoreTool.getDocument(
          ctx,
          args as unknown as FirestoreTool.GetDocumentArgs,
        );
      case FirestoreTool.QUERY_COLLECTION:
        return yield* FirestoreTool.queryCollection(
          ctx,
          args as unknown as FirestoreTool.QueryCollectionArgs,
        );
      case AuthTool.GET_USER:
        return yield* AuthTool.getUser(
          ctx,
          args as unknown as AuthTool.GetUserArgs,
        );
      case AuthTool.LIST_USERS:
        return yield* AuthTool.listUsers(
          ctx,
          args as unknown as AuthTool.ListUsersArgs,
        );
      default:
        return yield* Task.fail(new UnknownToolError(name));
    }
  })
    .map(toSuccessResult)
    .catchAll((err): Task<CallToolResult, never> => {
      switch (err._tag) {
        case 'AccessDeniedError':
          return Task.succeed(
            toErrorResult(
              'ACCESS_DENIED',
              `Access to path '${err.path}' is not allowed`,
              { path: err.path, suggestion: { allow: [err.path] } },
            ),
          );
        case 'DocumentNotFoundError':
          return Task.succeed(
            toErrorResult('NOT_FOUND', `Document not found: ${err.path}`, {
              path: err.path,
            }),
          );
        case 'FirestoreAggregateError':
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
          return Task.succeed(
            toErrorResult('FIRESTORE_ERROR', err.message, {
              cause: String(err.cause),
            }),
          );
        case 'AuthGetUserError':
        case 'AuthListUsersError':
          return Task.succeed(
            toErrorResult('AUTH_ERROR', err.message, {
              cause: String(err.cause),
            }),
          );
        case 'AuthUserNotFoundError':
          return Task.succeed(
            toErrorResult('NOT_FOUND', `User not found: ${err.identifier}`, {
              identifier: err.identifier,
            }),
          );
        case 'UnknownTool':
          return Task.succeed(
            toErrorResult('UNKNOWN_TOOL', `Unknown tool: ${err.toolName}`),
          );
      }
    });
