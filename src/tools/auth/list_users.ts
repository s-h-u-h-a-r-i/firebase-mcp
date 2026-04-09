import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Data, Effect } from 'effect';
import { FirebaseService } from '../../firebase';

export class AuthListUsersError extends Data.TaggedError('AuthListUsersError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

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
    },
  },
};

export const listUsers = (input: ListUsersArgs) =>
  Effect.gen(function* () {
    const { auth } = yield* FirebaseService;

    // TODO: implement — call auth().listUsers(maxResults, pageToken)
    void auth;
    void input;

    return yield* Effect.fail(
      new AuthListUsersError({ message: 'list_users: not yet implemented' }),
    );
  });
