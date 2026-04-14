import type { ProjectContext } from '../../../project';
import { Task } from '../../../task';
import { normalizeValue } from '../../normalize';

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
