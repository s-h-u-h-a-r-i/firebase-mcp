import { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { AppConfigSchema } from '../../config/index.js';

export const CREATE_CONFIG = 'create_config' as const;

export const createConfigDefinition: Tool = {
  name: CREATE_CONFIG,
  description:
    'Returns a template showing the required structure of the firebase-mcp.json config file. Use this when no config file has been found. After creating the file, call reload_config to load it without restarting the server.',
  inputSchema: { type: 'object', properties: {} },
};

const CONFIG_TEMPLATE: z.input<typeof AppConfigSchema> = {
  projects: {
    'my-project': {
      firebase: {
        projectId: 'your-firebase-project-id',
        serviceAccountPath: '/absolute/path/to/service-account.json',
      },
      firestore: {
        rules: {
          allow: ['**'],
          deny: [],
        },
        maxCollectionReadSize: 100,
        maxBatchFetchSize: 200,
        paths: {
          example_orders: {
            template: 'customers/{customerId}/orders',
            description: 'Optional; named templates for list_paths / resolving paths with {placeholders}',
          },
        },
      },
      timeouts: {
        callMs: 15000,
      },
    },
  },
};

const INSTRUCTIONS = [
  'Create firebase-mcp.json at the path your MCP server was started with (default: ./firebase-mcp.json, override with --config /path/to/file).',
  'Replace "my-project" with a short identifier you will use as projectId in tool calls.',
  'Set firebase.projectId to your Firebase project ID (found in Firebase Console → Project Settings).',
  'Set firebase.serviceAccountPath to the absolute path of a service account JSON key file (Firebase Console → Project Settings → Service Accounts → Generate new private key).',
  'The firestore.rules.allow glob list controls which Firestore paths tools may read. ["**"] allows everything.',
  'firestore.rules.deny lists globs evaluated first; a match denies the path regardless of allow.',
  'firestore.maxCollectionReadSize caps how many documents are read by default on collection-oriented tools (default 100).',
  'firestore.maxBatchFetchSize caps batch fetch sizes (default 200).',
  'firestore.paths maps logical names to { template, description? }; templates may use {param} placeholders. Use list_paths after config load to see them. Remove the example entry or replace it with your own.',
  'timeouts.callMs controls how long a tool call is allowed to run before the server aborts it (integer ms, min 100, max 120000; default 15000).',
  'After saving the file, call reload_config to load it without restarting the server.',
];

export const createConfig = (): CallToolResult => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        success: true,
        data: {
          instructions: INSTRUCTIONS,
          template: CONFIG_TEMPLATE,
        },
      }),
    },
  ],
});
