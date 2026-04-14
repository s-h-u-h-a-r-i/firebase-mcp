import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { AppConfig, getConfigPath, loadConfig, ProjectConfig } from '../config';
import { createProjectContext, ProjectContext } from '../project';
import {
  allToolDefinitions,
  CREATE_CONFIG,
  createConfig,
  dispatchTool,
  GET_CONFIG,
  getConfig,
  RELOAD_CONFIG,
  reloadConfig,
} from '../tools';

export class McpServerError extends Error {
  readonly _tag = 'McpServerError' as const;
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'McpServerError';
  }
}

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

export class FirebaseMcpServer {
  private appConfig: AppConfig | null = null;
  private readonly projectContexts = new Map<string, Promise<ProjectContext>>();
  private readonly mcpServer: McpServer;
  private readonly configPath: string;

  constructor() {
    this.configPath = getConfigPath();
    this.mcpServer = new McpServer(
      { name: 'firebase-mcp', version: '0.1.0' },
      { capabilities: { tools: {} } },
    );
  }

  async start(): Promise<void> {
    const { exit } = loadConfig(this.configPath).fork();
    const result = await exit;
    if (result._tag === 'ok') {
      this.appConfig = result.value;
    } else {
      process.stderr.write(
        `[firebase-mcp] Config not loaded (${this.configPath}): ${String(result._tag === 'err' ? result.error : result.cause)}. Use the create_config tool to see the required config structure.\n`,
      );
    }

    this.mcpServer.server.setRequestHandler(
      ListToolsRequestSchema,
      async () => ({ tools: allToolDefinitions }),
    );

    this.mcpServer.server.setRequestHandler(
      CallToolRequestSchema,
      (request) => this.handleToolCall(request.params.name, request.params.arguments ?? {}),
    );

    await this.mcpServer.server.connect(new StdioServerTransport());
  }

  private async handleToolCall(name: string, args: Record<string, unknown>) {
    if (name === CREATE_CONFIG) return createConfig();

    if (name === RELOAD_CONFIG) return reloadConfig(() => this.reloadAppConfig());

    if (!this.appConfig) {
      return toErrorResult(
        'CONFIG_NOT_FOUND',
        `No config loaded (looked for: ${this.configPath}). Call create_config to see the required file structure, create the file, then call reload_config to load it.`,
        { configPath: this.configPath },
      );
    }

    if (name === GET_CONFIG) return getConfig(this.appConfig);

    const projectId = typeof args.projectId === 'string' ? args.projectId : null;
    if (!projectId) {
      return toErrorResult(
        'MISSING_PROJECT_ID',
        'projectId is required. Call get_config to see available projects.',
      );
    }

    const projectConfig = this.appConfig.projects[projectId];
    if (!projectConfig) {
      return toErrorResult(
        'PROJECT_NOT_FOUND',
        `Project "${projectId}" not found in config. Call get_config to see available projects.`,
        { projectId, available: Object.keys(this.appConfig.projects) },
      );
    }

    const { projectId: _stripped, ...toolArgs } = args;

    let ctx: ProjectContext;
    try {
      ctx = await this.getOrInitProject(projectId, projectConfig);
    } catch (cause) {
      return toErrorResult(
        'FIREBASE_INIT_ERROR',
        `Failed to initialize Firebase for project "${projectId}": ${String(cause)}`,
      );
    }

    const { exit } = dispatchTool(
      ctx,
      name,
      toolArgs as Record<string, unknown> & { operation: string },
    ).fork();
    const toolResult = await exit;

    if (toolResult._tag === 'ok') return toolResult.value;

    return toErrorResult(
      'INTERNAL_ERROR',
      `Unexpected error: ${String(
        toolResult._tag === 'err' ? toolResult.error : toolResult.cause,
      )}`,
    );
  }

  private async reloadAppConfig() {
    const { exit } = loadConfig(this.configPath).fork();
    const result = await exit;
    if (result._tag !== 'ok') {
      throw result._tag === 'err' ? result.error : result.cause;
    }
    this.projectContexts.clear();
    this.appConfig = result.value;
    return { projects: Object.keys(result.value.projects) };
  }

  private getOrInitProject(
    projectId: string,
    config: ProjectConfig,
  ): Promise<ProjectContext> {
    const cached = this.projectContexts.get(projectId);
    if (cached) return cached;

    const { exit } = createProjectContext(config).fork();
    const promise = exit.then((result) => {
      if (result._tag === 'ok') return result.value;
      this.projectContexts.delete(projectId);
      throw result._tag === 'err' ? result.error : result.cause;
    });
    this.projectContexts.set(projectId, promise);
    return promise;
  }
}
