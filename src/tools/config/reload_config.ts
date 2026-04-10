import { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';

export const RELOAD_CONFIG = 'reload_config' as const;

export const reloadConfigDefinition: Tool = {
  name: RELOAD_CONFIG,
  description:
    'Re-reads the config file from disk and evicts all cached project runtimes. Use this after the user says they have changed their firebase-mcp.json config.',
  inputSchema: { type: 'object', properties: {} },
};

export interface ReloadResult {
  projects: string[];
}

export const reloadConfig = async (
  onReload: () => Promise<ReloadResult>,
): Promise<CallToolResult> => {
  try {
    const data = await onReload();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            data: { message: 'Config reloaded successfully', ...data },
          }),
        },
      ],
    };
  } catch (cause) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: {
              code: 'RELOAD_FAILED',
              message: `Failed to reload config: ${String(cause)}`,
            },
          }),
        },
      ],
      isError: true,
    };
  }
};
