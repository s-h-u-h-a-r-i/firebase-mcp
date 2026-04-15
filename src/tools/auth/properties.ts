export const AUTH_PROPS = {
  uid: {
    type: 'string',
    description: 'Firebase Auth UID',
  },
  email: {
    type: 'string',
    description: 'User email address',
  },
  phoneNumber: {
    type: 'string',
    description: 'E.164 phone number, e.g. +15555550100',
  },
  maxResults: {
    type: 'number',
    description: 'Maximum number of users to return, 1–1000 (default 100)',
  },
  pageToken: {
    type: 'string',
    description: 'Page token from a previous list_users response',
  },
} as const;

export type AuthPropKey = keyof typeof AUTH_PROPS;
