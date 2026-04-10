import { Tool } from '@modelcontextprotocol/sdk/types.js';

import type { ProjectContext } from '../../../project';
import { Task } from '../../../task';
import { normalizeValue } from '../../normalize';

export class AuthGetUserError extends Error {
  readonly _tag = 'AuthGetUserError' as const;
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'AuthGetUserError';
  }
}

export class AuthUserNotFoundError extends Error {
  readonly _tag = 'AuthUserNotFoundError' as const;
  constructor(readonly identifier: string) {
    super(`User not found: ${identifier}`);
    this.name = 'AuthUserNotFoundError';
  }
}

export const GET_USER = 'get_user' as const;

export interface GetUserArgs {
  uid?: string;
  email?: string;
}

export const getUserDefinition: Tool = {
  name: GET_USER,
  description:
    'Fetch a Firebase Auth user by UID or email. Exactly one of uid or email must be provided.',
  inputSchema: {
    type: 'object',
    properties: {
      uid: {
        type: 'string',
        description: 'The Firebase Auth UID of the user.',
      },
      email: {
        type: 'string',
        description: 'The email address of the user.',
      },
      projectId: {
        type: 'string',
        description: 'Project key as defined in firebase-mcp.json',
      },
    },
    required: ['projectId'],
  },
};

export const getUser = (ctx: ProjectContext, input: GetUserArgs) =>
  Task.gen(function* () {
    if (!input.uid && !input.email) {
      return yield* Task.fail(
        new AuthGetUserError('Either uid or email must be provided'),
      );
    }

    const auth = ctx.auth();

    const userRecord = yield* Task.attempt({
      try: () =>
        input.uid ? auth.getUser(input.uid) : auth.getUserByEmail(input.email!),
      catch: (cause: unknown) => {
        const code =
          cause != null &&
          typeof cause === 'object' &&
          'code' in cause &&
          typeof (cause as { code: unknown }).code === 'string'
            ? (cause as { code: string }).code
            : '';

        if (code === 'auth/user-not-found') {
          return new AuthUserNotFoundError(input.uid ?? input.email ?? '');
        }

        return new AuthGetUserError(
          `Failed to fetch user: ${input.uid ?? input.email}`,
          cause,
        );
      },
    });

    return normalizeValue({
      ...userRecord.toJSON(),
      providerData: userRecord.providerData.map((p) => ({ ...p.toJSON() })),
    });
  });
