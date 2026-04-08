import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Data, Effect, Layer, Runtime } from 'effect';
import { AccessService } from '../access';
import { ConfigService } from '../config';
import { FirebaseService } from '../firebase';
import { allToolDefinitions, dispatchTool } from '../tools';

export class McpServerError extends Data.TaggedError('McpServerError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class McpServerService extends Effect.Service<McpServerService>()(
  'McpServerService',
  {
    accessors: true,
    dependencies: [
      Layer.provide(FirebaseService.Default, ConfigService.Default),
      Layer.provide(AccessService.Default, ConfigService.Default),
      ConfigService.Default,
    ],
    effect: Effect.gen(function* () {
      const runtime = yield* Effect.runtime();
      const runPromise = Runtime.runPromise(runtime);

      const context = yield* Effect.context<
        AccessService | ConfigService | FirebaseService
      >();

      const mcpServer = new McpServer(
        { name: 'firebase-mcp', version: '0.1.0' },
        { capabilities: { tools: {} } },
      );

      mcpServer.server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: allToolDefinitions,
      }));

      mcpServer.server.setRequestHandler(
        CallToolRequestSchema,
        async (request) => {
          const args = request.params.arguments ?? {};
          return runPromise(
            dispatchTool(request.params.name, args).pipe(
              Effect.provide(context),
            ),
          ).catch((cause) => ({
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: { code: 'INTERNAL_ERROR', message: String(cause) },
                }),
              },
            ],
            isError: true,
          }));
        },
      );

      return {
        start() {
          return Effect.tryPromise({
            try: () => mcpServer.server.connect(new StdioServerTransport()),
            catch: (cause) =>
              new McpServerError({
                message: 'Failed to connect stdio transport',
                cause,
              }),
          });
        },
      };
    }),
  },
) {}
