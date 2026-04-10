import { Tool } from '@modelcontextprotocol/sdk/types.js';

import type { ProjectContext } from '../../../project';
import { Task } from '../../../task';
import { normalizeValue } from '../../normalize';

export class AuthListUsersError extends Error {
  readonly _tag = 'AuthListUsersError' as const;
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'AuthListUsersError';
  }
}

export const LIST_USERS = 'list_users' as const;

export interface ListUsersArgs {
  maxResults?: number;
  pageToken?: string;
}

export const listUsersDefinition: Tool = {
  name: LIST_USERS,
  description:
    'List Firebase Auth users with optional pagination. Returns up to maxResults users and a nextPageToken if more exist.',
  inputSchema: {
    type: 'object',
    properties: {
      maxResults: {
        type: 'number',
        description:
          'Maximum number of users to return (1-1000). Defaults to 100.',
      },
      pageToken: {
        type: 'string',
        description:
          'Page token from a previous list_users response to fetch the next page.',
      },
      projectId: {
        type: 'string',
        description: 'Project key as defined in firebase-mcp.json',
      },
    },
    required: ['projectId'],
  },
};

export const listUsers = (ctx: ProjectContext, input: ListUsersArgs) =>
  Task.gen(function* () {
    const auth = ctx.auth();

    const result = yield* Task.attempt({
      try: () => auth.listUsers(input.maxResults ?? 100, input.pageToken),
      catch: (cause) =>
        new AuthListUsersError('Failed to list users', cause),
    });

    return {
      users: result.users.map((u) =>
        normalizeValue({
          ...u.toJSON(),
          providerData: u.providerData.map((p) => ({ ...p.toJSON() })),
        }),
      ),
      nextPageToken: result.pageToken ?? null,
    };
  });
