import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Data, Effect } from 'effect';

import { FirebaseService } from '../../firebase';
import { normalizeValue } from '../normalize';

export class AuthGetUserError extends Data.TaggedError('AuthGetUserError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class AuthUserNotFoundError extends Data.TaggedError(
  'AuthUserNotFoundError',
)<{
  readonly identifier: string;
}> {}

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

export const getUser = (input: GetUserArgs) =>
  Effect.gen(function* () {
    if (!input.uid && !input.email) {
      return yield* Effect.fail(
        new AuthGetUserError({
          message: 'Either uid or email must be provided',
        }),
      );
    }

    const { auth } = yield* FirebaseService;

    const userRecord = yield* Effect.tryPromise({
      try: () =>
        input.uid
          ? auth().getUser(input.uid)
          : auth().getUserByEmail(input.email!),
      catch: (cause: unknown) => {
        const code =
          cause != null &&
          typeof cause === 'object' &&
          'code' in cause &&
          typeof (cause as { code: unknown }).code === 'string'
            ? (cause as { code: string }).code
            : '';

        if (code === 'auth/user-not-found') {
          return new AuthUserNotFoundError({
            identifier: input.uid ?? input.email ?? '',
          });
        }

        return new AuthGetUserError({
          message: `Failed to fetch user: ${input.uid ?? input.email}`,
          cause,
        });
      },
    });

    return normalizeValue({
      ...userRecord.toJSON(),
      providerData: userRecord.providerData.map((p) => ({ ...p.toJSON() })),
    });
  });
