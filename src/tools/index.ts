import { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';

import { Effect } from 'effect';
import {
  getDocument,
  getDocumentDefinition,
  readCollection,
  readCollectionDefinition,
} from './firestore';

export const allToolDefinitions: Tool[] = [
  readCollectionDefinition,
  getDocumentDefinition,
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

export const dispatchTool = (name: string, args: Record<string, unknown>) =>
  Effect.gen(function* () {
    switch (name) {
      case 'read_collection':
        return yield* readCollection(
          args as { collection: string; limit?: number },
        );
      case 'get_document':
        return yield* getDocument(args as { path: string });
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
