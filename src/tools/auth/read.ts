import { Tool } from '@modelcontextprotocol/sdk/types.js';

import type { ProjectContext } from '../../project';
import { Task } from '../../task';
import { GET_USER, getUser, GetUserArgs } from './get_user';
import { LIST_USERS, listUsers, ListUsersArgs } from './list_users';

const READ_OPERATIONS = [GET_USER, LIST_USERS] as const;

type ReadOperations = (typeof READ_OPERATIONS)[number];

export class UnknownAuthOperationError extends Error {
  readonly _tag = 'UnknownAuthOperationError' as const;
  constructor(readonly operation: string) {
    super(`Unknown auth_read operation: ${operation}`);
    this.name = 'UnknownAuthOperationError';
  }
}

export const AUTH_READ = 'auth_read' as const;

export const authReadDefinition: Tool = {
  name: AUTH_READ,
  description: 'Read from Firebase Authentication.',
  inputSchema: {
    type: 'object',
    required: ['operation', 'projectId'],
    properties: {
      operation: {
        type: 'string',
        enum: [...READ_OPERATIONS],
        description: [
          'The Auth operation to perform:',
          '- get_user: Fetch a user by uid or email. Args: uid? OR email?',
          '- list_users: List users with pagination. Args: maxResults?(1-1000, default 100), pageToken?',
        ].join('\n'),
      },
      projectId: {
        type: 'string',
        description: 'Project key as defined in firebase-mcp.json',
      },
      uid: {
        type: 'string',
        description: 'Firebase Auth UID (get_user)',
      },
      email: {
        type: 'string',
        description: 'User email address (get_user)',
      },
      maxResults: {
        type: 'number',
        description:
          'Maximum number of users to return, 1–1000 (list_users, default 100)',
      },
      pageToken: {
        type: 'string',
        description:
          'Page token from a previous list_users response (list_users)',
      },
    },
  },
};

export const dispatchAuthRead = (
  ctx: ProjectContext,
  operation: ReadOperations | (string & {}),
  args: unknown,
) => {
  const a = args;
  return Task.gen(function* () {
    switch (operation) {
      case GET_USER:
        return yield* getUser(ctx, a as GetUserArgs);
      case LIST_USERS:
        return yield* listUsers(ctx, a as ListUsersArgs);
      default:
        return yield* Task.fail(
          new UnknownAuthOperationError(String(operation)),
        );
    }
  });
};
