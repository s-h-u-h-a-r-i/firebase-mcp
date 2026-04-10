import { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { AppConfig } from '../../config';

export const GET_CONFIG = 'get_config' as const;

export const getConfigDefinition: Tool = {
  name: GET_CONFIG,
  description:
    'Returns the current in-memory config, listing all available projects and their settings. Sensitive fields (e.g. serviceAccountPath) are omitted. Call this first to discover which projectId values are available for use with other tools.',
  inputSchema: { type: 'object', properties: {} },
};

const sanitize = (config: AppConfig): unknown => ({
  projects: Object.fromEntries(
    Object.entries(config.projects).map(([key, project]) => [
      key,
      {
        firebase: {
          projectId: project.firebase.projectId,
          serviceAccountPath: '[omitted]',
        },
        firestore: project.firestore,
      },
    ]),
  ),
});

export const getConfig = (appConfig: AppConfig): CallToolResult => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({ success: true, data: sanitize(appConfig) }),
    },
  ],
});
