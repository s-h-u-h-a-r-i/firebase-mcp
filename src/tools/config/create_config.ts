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
  'timeouts.callMs controls how long a tool call is allowed to run before the server aborts it (default: 15000ms).',
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
