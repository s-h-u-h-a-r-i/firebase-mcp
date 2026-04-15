import type { ProjectContext } from '../../../project';
import { Task } from '../../../task';
import type { OperationSchema } from '../../build-tool';
import { normalizeValue } from '../../normalize';
import type { AuthPropKey } from '../properties';

export class AuthListUsersError extends Error {
  readonly _tag = 'AuthListUsersError' as const;
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AuthListUsersError';
  }
}

export const LIST_USERS = 'list_users' as const;

export const listUsersOp: OperationSchema<AuthPropKey> = {
  name: LIST_USERS,
  description:
    'List users with pagination. Args: maxResults?(1-1000, default 100), pageToken?',
  properties: ['maxResults', 'pageToken'],
};

export interface ListUsersArgs {
  maxResults?: number;
  pageToken?: string;
}

export const listUsers = (ctx: ProjectContext, input: ListUsersArgs) =>
  Task.gen(function* () {
    const auth = ctx.auth();

    const result = yield* Task.attempt({
      try: () => auth.listUsers(input.maxResults ?? 100, input.pageToken),
      catch: (cause) => new AuthListUsersError('Failed to list users', cause),
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
