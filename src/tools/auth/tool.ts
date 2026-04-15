import type { ProjectContext } from '../../project';
import { Task } from '../../task';
import { buildTool } from '../build-tool';
import {
  GET_USER,
  getUser,
  GetUserArgs,
  getUserOp,
} from './operations/get_user';
import {
  LIST_USERS,
  listUsers,
  ListUsersArgs,
  listUsersOp,
} from './operations/list_users';
import { AUTH_PROPS } from './properties';

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

export const authReadDefinition = buildTool({
  name: AUTH_READ,
  description: 'Read from Firebase Authentication.',
  allProperties: AUTH_PROPS,
  ops: [getUserOp, listUsersOp],
});

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
