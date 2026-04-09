import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Data, Effect } from 'effect';
import admin from 'firebase-admin';

import { ConfigService } from '../../config';

export class FirestoreListIndexesError extends Data.TaggedError(
  'FirestoreListIndexesError',
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const LIST_INDEXES = 'list_indexes' as const;

export interface ListIndexesArgs {
  collectionGroup?: string;
  includeNotReady?: boolean;
}

interface FirestoreIndexField {
  fieldPath: string;
  order?: 'ASCENDING' | 'DESCENDING';
  arrayConfig?: 'CONTAINS';
}

interface FirestoreIndexResponse {
  name: string;
  queryScope: 'COLLECTION' | 'COLLECTION_GROUP';
  fields: FirestoreIndexField[];
  state: 'READY' | 'CREATING' | 'NEEDS_REPAIR';
}

interface ApiResponse {
  indexes?: FirestoreIndexResponse[];
  nextPageToken?: string;
}

export const listIndexesDefinition: Tool = {
  name: LIST_INDEXES,
  description:
    'List Firestore composite indexes. Use this before running complex queries or collection group queries to check whether the required indexes exist. Returns index fields, query scope (COLLECTION or COLLECTION_GROUP), and state.',
  inputSchema: {
    type: 'object',
    properties: {
      collectionGroup: {
        type: 'string',
        description:
          'Filter to a specific collection group name, e.g. "stock" or "purchase_orders". Omit to return all indexes.',
      },
      includeNotReady: {
        type: 'boolean',
        description:
          'If true, includes indexes that are still CREATING or NEEDS_REPAIR. Defaults to false (only READY indexes).',
      },
    },
  },
};

export const listIndexes = (input: ListIndexesArgs) =>
  Effect.gen(function* () {
    const { config } = yield* ConfigService;
    const projectId = config.firebase.projectId;

    const token = yield* Effect.tryPromise({
      try: () => admin.app().options.credential!.getAccessToken(),
      catch: (cause) =>
        new FirestoreListIndexesError({
          message: 'Failed to get access token',
          cause,
        }),
    });

    // Fetch all pages of indexes
    const allIndexes: FirestoreIndexResponse[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups/-/indexes`,
      );
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const page = yield* Effect.tryPromise({
        try: () =>
          fetch(url.toString(), {
            headers: { Authorization: `Bearer ${token.access_token}` },
          }).then((r) => r.json() as Promise<ApiResponse>),
        catch: (cause) =>
          new FirestoreListIndexesError({
            message: 'Failed to fetch indexes from Firestore Management API',
            cause,
          }),
      });

      allIndexes.push(...(page.indexes ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);

    // Extract collection group from index name:
    // projects/{projectId}/databases/(default)/collectionGroups/{group}/indexes/{id}
    const parsed = allIndexes
      .map((idx) => {
        const parts = idx.name.split('/');
        const groupIdx = parts.indexOf('collectionGroups');
        const collectionGroup =
          groupIdx !== -1 ? parts[groupIdx + 1] : 'unknown';
        return {
          collectionGroup,
          queryScope: idx.queryScope,
          fields: idx.fields.map((f) => ({
            field: f.fieldPath,
            ...(f.order ? { order: f.order } : {}),
            ...(f.arrayConfig ? { arrayConfig: f.arrayConfig } : {}),
          })),
          state: idx.state,
        };
      })
      .filter((idx) => {
        if (!input.includeNotReady && idx.state !== 'READY') return false;
        if (
          input.collectionGroup &&
          idx.collectionGroup !== input.collectionGroup
        )
          return false;
        return true;
      });

    // Group by collection group for easier reading
    const grouped: Record<string, typeof parsed> = {};
    for (const idx of parsed) {
      if (!grouped[idx.collectionGroup]) grouped[idx.collectionGroup] = [];
      grouped[idx.collectionGroup].push(idx);
    }

    return {
      total: parsed.length,
      indexes: grouped,
    };
  });
