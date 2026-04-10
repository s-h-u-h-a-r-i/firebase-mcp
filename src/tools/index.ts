import { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';

import type { ProjectContext } from '../project';
import { Task } from '../task';
import * as AuthTool from './auth';
import * as ConfigTool from './config';
import * as FirestoreTool from './firestore';

export { AUTH_READ } from './auth';
export { GET_CONFIG, getConfig, RELOAD_CONFIG, reloadConfig } from './config';
export { FIRESTORE_READ } from './firestore';

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
  FirestoreTool.firestoreReadDefinition,
  AuthTool.authReadDefinition,
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
  args: Record<string, unknown> & { operation: string },
): Task<CallToolResult, never> => {
  const { operation, ...rest } = args;
  return Task.gen(function* () {
    switch (name) {
      case FirestoreTool.FIRESTORE_READ:
        return yield* FirestoreTool.dispatchFirestoreRead(ctx, operation, rest);
      case AuthTool.AUTH_READ:
        return yield* AuthTool.dispatchAuthRead(ctx, operation, rest);
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
        case 'UnknownFirestoreOperationError':
        case 'UnknownAuthOperationError':
        case 'UnknownTool':
          return Task.succeed(toErrorResult('UNKNOWN_TOOL', err.message));
      }
    });
};
