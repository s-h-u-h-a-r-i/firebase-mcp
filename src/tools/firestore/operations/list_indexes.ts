import admin from 'firebase-admin';

import type { ProjectContext } from '../../../project';
import { Task } from '../../../task';
import type { OperationSchema } from '../../build-tool';
import type { FirestorePropKey } from '../properties';

export class FirestoreListIndexesError extends Error {
  readonly _tag = 'FirestoreListIndexesError' as const;
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FirestoreListIndexesError';
  }
}

export const LIST_INDEXES = 'list_indexes' as const;

export const listIndexesOp: OperationSchema<FirestorePropKey> = {
  name: LIST_INDEXES,
  description:
    'List composite indexes. Args: collectionGroup?(filter by name), includeNotReady?(bool)',
  properties: ['collectionGroup', 'includeNotReady'],
};

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

export const listIndexes = (ctx: ProjectContext, input: ListIndexesArgs) =>
  Task.gen(function* () {
    const projectId = ctx.config.firebase.projectId;

    const token = yield* Task.attempt({
      try: () => admin.app(projectId).options.credential!.getAccessToken(),
      catch: (cause) =>
        new FirestoreListIndexesError('Failed to get access token', cause),
    });

    const allIndexes: FirestoreIndexResponse[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups/-/indexes`,
      );
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const page = yield* Task.attempt({
        try: () =>
          fetch(url.toString(), {
            headers: { Authorization: `Bearer ${token.access_token}` },
          }).then((r) => r.json() as Promise<ApiResponse>),
        catch: (cause) =>
          new FirestoreListIndexesError(
            'Failed to fetch indexes from Firestore Management API',
            cause,
          ),
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

    return { total: parsed.length, indexes: grouped };
  });
