import { Tool } from '@modelcontextprotocol/sdk/types.js';

export interface OperationSchema<K extends string = string> {
  name: string;
  description: string;
  properties?: readonly K[];
}

export function buildTool<K extends string>(opts: {
  name: string;
  description: string;
  allProperties: Record<K, unknown>;
  ops: readonly OperationSchema<K>[];
}): Tool {
  const allToolProperties: Record<string, unknown> = {
    projectId: {
      type: 'string',
      description: 'Project key as defined in firebase-mcp.json',
    },
  };

  for (const op of opts.ops) {
    for (const key of op.properties ?? []) {
      allToolProperties[key] = opts.allProperties[key];
    }
  }

  const opDescription = opts.ops
    .map((op) => `- ${op.name}: ${op.description}`)
    .join('\n');

  return {
    name: opts.name,
    description: opts.description,
    inputSchema: {
      type: 'object',
      required: ['operation', 'projectId'],
      properties: {
        operation: {
          type: 'string',
          enum: opts.ops.map((op) => op.name),
          description: opDescription,
        },
        ...allToolProperties,
      },
    },
  };
}
