import { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { AppConfig } from '../../config';

export const GET_CONFIG = 'get_config' as const;

export const getConfigDefinition: Tool = {
  name: GET_CONFIG,
  description:
    'Returns all in-memory project configs (excluding sensitive fields, e.g. serviceAccountPath). Use to find available projectId values. If hasPaths is true, use firestore_read list_paths for path templates.',
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
        firestore: {
          rules: project.firestore.rules,
          maxCollectionReadSize: project.firestore.maxCollectionReadSize,
          maxBatchFetchSize: project.firestore.maxBatchFetchSize,
          hasPaths: Object.keys(project.firestore.paths).length > 0,
        },
        timeouts: project.timeouts,
      },
    ])
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
