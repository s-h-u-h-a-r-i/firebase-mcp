import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Data, Effect, Layer, ManagedRuntime } from 'effect';

import { AccessService } from '../access';
import {
  ConfigService,
  getConfigPath,
  loadConfig,
  ProjectConfig,
} from '../config';
import { FirebaseInitError, FirebaseService } from '../firebase';
import {
  allToolDefinitions,
  dispatchTool,
  GET_CONFIG,
  getConfig,
  RELOAD_CONFIG,
  reloadConfig,
} from '../tools';

export class McpServerError extends Data.TaggedError('McpServerError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const toErrorResult = (code: string, message: string, details?: unknown) => ({
  content: [
    {
      type: 'text' as const,
      text: JSON.stringify({
        success: false,
        error: { code, message, details },
      }),
    },
  ],
  isError: true,
});

export class McpServerService extends Effect.Service<McpServerService>()(
  'McpServerService',
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const configPath = getConfigPath();
      let appConfig = yield* loadConfig(configPath);

      const projectRuntimes = new Map<
        string,
        ManagedRuntime.ManagedRuntime<
          ConfigService | FirebaseService | AccessService,
          FirebaseInitError
        >
      >();

      const buildProjectRuntime = (projectConfig: ProjectConfig) => {
        const configLayer = Layer.succeed(ConfigService, {
          config: projectConfig,
        });
        const layer = Layer.mergeAll(
          configLayer,
          Layer.provide(FirebaseService.Default, configLayer),
          Layer.provide(AccessService.Default, configLayer),
        );
        return ManagedRuntime.make(layer);
      };

      const getOrInitProject = (projectId: string) => {
        const cached = projectRuntimes.get(projectId);
        if (cached) return cached;

        const projectConfig = appConfig.projects[projectId];
        if (!projectConfig) return null;

        const runtime = buildProjectRuntime(projectConfig);
        projectRuntimes.set(projectId, runtime);
        return runtime;
      };

      const disposeAllRuntimes = async () => {
        await Promise.all(
          [...projectRuntimes.values()].map((r) => r.dispose()),
        );
        projectRuntimes.clear();
      };

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
          const name = request.params.name;
          const args = request.params.arguments ?? {};

          if (name === GET_CONFIG) {
            return getConfig(appConfig);
          }

          if (name === RELOAD_CONFIG) {
            return reloadConfig(async () => {
              const newConfig = await Effect.runPromise(loadConfig(configPath));
              await disposeAllRuntimes();
              appConfig = newConfig;
              return { projects: Object.keys(newConfig.projects) };
            });
          }

          const projectId =
            typeof args.projectId === 'string' ? args.projectId : null;

          if (!projectId) {
            return toErrorResult(
              'MISSING_PROJECT_ID',
              'projectId is required. Call get_config to see available projects.',
            );
          }

          const runtime = getOrInitProject(projectId);

          if (!runtime) {
            return toErrorResult(
              'PROJECT_NOT_FOUND',
              `Project "${projectId}" not found in config. Call get_config to see available projects.`,
              { projectId, available: Object.keys(appConfig.projects) },
            );
          }

          const { projectId: _stripped, ...toolArgs } = args as Record<
            string,
            unknown
          >;

          return runtime
            .runPromise(dispatchTool(name, toolArgs))
            .catch((cause) => ({
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
