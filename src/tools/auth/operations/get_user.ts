import type { ProjectContext } from '../../../project';
import { Task } from '../../../task';
import type { OperationSchema } from '../../build-tool';
import { normalizeValue } from '../../normalize';
import type { AuthPropKey } from '../properties';

export class AuthGetUserError extends Error {
  readonly _tag = 'AuthGetUserError' as const;
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
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

export const getUserOp: OperationSchema<AuthPropKey> = {
  name: GET_USER,
  description:
    'Fetch a user by uid, email, or phoneNumber. Args: uid? OR email? OR phoneNumber?',
  properties: ['uid', 'email', 'phoneNumber'],
};

export interface GetUserArgs {
  uid?: string;
  email?: string;
  phoneNumber?: string;
}

export const getUser = (ctx: ProjectContext, input: GetUserArgs) =>
  Task.gen(function* () {
    if (!input.uid && !input.email && !input.phoneNumber) {
      return yield* Task.fail(
        new AuthGetUserError(
          'Exactly one of uid, email, or phoneNumber must be provided',
        ),
      );
    }

    const auth = ctx.auth();

    const identifier = input.uid ?? input.email ?? input.phoneNumber!;

    const userRecord = yield* Task.attempt({
      try: () => {
        if (input.uid) return auth.getUser(input.uid);
        if (input.email) return auth.getUserByEmail(input.email);
        return auth.getUserByPhoneNumber(input.phoneNumber!);
      },
      catch: (cause: unknown) => {
        const code =
          cause != null &&
          typeof cause === 'object' &&
          'code' in cause &&
          typeof (cause as { code: unknown }).code === 'string'
            ? (cause as { code: string }).code
            : '';

        if (code === 'auth/user-not-found') {
          return new AuthUserNotFoundError(identifier);
        }

        return new AuthGetUserError(
          `Failed to fetch user: ${identifier}`,
          cause,
        );
      },
    });

    return normalizeValue({
      ...userRecord.toJSON(),
      providerData: userRecord.providerData.map((p) => ({ ...p.toJSON() })),
    });
  });
