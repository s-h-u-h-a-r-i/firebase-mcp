import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { AppConfig, getConfigPath, loadConfig, ProjectConfig } from '../config';
import { createProjectContext, ProjectContext } from '../project';
import { Exit } from '../task';
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
    const exit = await loadConfig(this.configPath).unsafeRun();
    if (Exit.isOk(exit)) {
      this.appConfig = exit.value;
    } else {
      process.stderr.write(
        `[firebase-mcp] Config not loaded (${this.configPath}): ${String(Exit.isErr(exit) ? exit.error : exit.cause)}. Use the create_config tool to see the required config structure.\n`,
      );
    }

    this.mcpServer.server.setRequestHandler(
      ListToolsRequestSchema,
      async () => ({ tools: allToolDefinitions }),
    );

    this.mcpServer.server.setRequestHandler(CallToolRequestSchema, (request) =>
      this.handleToolCall(request.params.name, request.params.arguments ?? {}),
    );

    await this.mcpServer.server.connect(new StdioServerTransport());
  }

  private async handleToolCall(name: string, args: Record<string, unknown>) {
    if (name === CREATE_CONFIG) return createConfig();

    if (name === RELOAD_CONFIG)
      return reloadConfig(() => this.reloadAppConfig());

    if (!this.appConfig) {
      return toErrorResult(
        'CONFIG_NOT_FOUND',
        `No config loaded (looked for: ${this.configPath}). Call create_config to see the required file structure, create the file, then call reload_config to load it.`,
        { configPath: this.configPath },
      );
    }

    if (name === GET_CONFIG) return getConfig(this.appConfig);

    const projectId =
      typeof args.projectId === 'string' ? args.projectId : null;
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

    const timeoutMs = projectConfig.timeouts.callMs;

    const toolExit = await dispatchTool(
      ctx,
      name,
      toolArgs as Record<string, unknown> & { operation: string },
    )
      .withTimeout(timeoutMs)
      .unsafeRun();

    if (Exit.isOk(toolExit)) return toolExit.value;
    if (Exit.isErr(toolExit) && toolExit.error._tag === 'TimeoutError') {
      return toErrorResult(
        'TIMEOUT',
        `Tool "${name}" timed out after ${timeoutMs}ms for project "${projectId}".`,
        { projectId, timeoutMs, tool: name },
      );
    }

    return toErrorResult(
      'INTERNAL_ERROR',
      `Unexpected error: ${String(
        Exit.isErr(toolExit) ? toolExit.error : toolExit.cause,
      )}`,
    );
  }

  private async reloadAppConfig() {
    const exit = await loadConfig(this.configPath).unsafeRun();
    if (exit._tag !== 'ok') {
      throw Exit.isErr(exit) ? exit.error : exit.cause;
    }
    this.projectContexts.clear();
    this.appConfig = exit.value;
    return { projects: Object.keys(exit.value.projects) };
  }

  private getOrInitProject(
    projectId: string,
    config: ProjectConfig,
  ): Promise<ProjectContext> {
    const cached = this.projectContexts.get(projectId);
    if (cached) return cached;

    const promise = createProjectContext(config)
      .unsafeRun()
      .then((exit) => {
        if (Exit.isOk(exit)) return exit.value;
        this.projectContexts.delete(projectId);
        throw Exit.isErr(exit) ? exit.error : exit.cause;
      });
    this.projectContexts.set(projectId, promise);
    return promise;
  }
}
