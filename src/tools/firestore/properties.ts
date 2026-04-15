import { VALID_OPERATORS } from './utils/types';

const FILTER_SCHEMA_ITEM = {
  type: 'object',
  properties: {
    field: { type: 'string', description: 'Field name to filter on' },
    operator: {
      type: 'string',
      enum: VALID_OPERATORS,
      description: 'Comparison operator',
    },
    value: {
      description:
        'Value to compare against (string, number, boolean, null, or array for in/array-contains-any/not-in)',
    },
  },
  required: ['field', 'operator', 'value'],
} as const;

const ORDER_BY_SCHEMA_ITEM = {
  type: 'object',
  properties: {
    field: { type: 'string', description: 'Field to order by' },
    direction: {
      type: 'string',
      enum: ['asc', 'desc'],
      description: "Sort direction (default: 'asc')",
    },
  },
  required: ['field'],
} as const;

export const FIRESTORE_PROPS = {
  path: {
    type: 'string',
    description: "Document path (EVEN segments, e.g. 'users/123' or 'stores/ABC')",
  },
  collection: {
    type: 'string',
    description: "Collection path (ODD segments, e.g. 'users' or 'users/123/posts')",
  },
  collectionId: {
    type: 'string',
    description: "Collection name without slashes (e.g. 'orders') for collection group operations",
  },
  paths: {
    type: 'array',
    items: { type: 'string' },
    description: "Full document paths for batch fetch (e.g. ['users/123', 'orders/456'])",
  },
  ids: {
    type: 'array',
    items: { type: 'string' },
    description: 'Document IDs within the collection field (used with collection for get_many_documents)',
  },
  filters: {
    type: 'array',
    items: FILTER_SCHEMA_ITEM,
    description: 'Where-clause filters',
  },
  orderBy: {
    type: 'array',
    items: ORDER_BY_SCHEMA_ITEM,
    description: 'Ordering of results',
  },
  limit: {
    type: 'number',
    description: 'Max number of documents to return',
  },
  select: {
    type: 'array',
    items: { type: 'string' },
    description: 'Field paths to return. Omit for all fields.',
  },
  startAfter: {
    type: 'string',
    description:
      'Pagination cursor: doc ID for collection queries, full doc path for collection group queries',
  },
  includeCounts: {
    type: 'boolean',
    description: 'Include document count per collection',
  },
  includePhantoms: {
    type: 'boolean',
    description: 'Fall back to listDocuments() when the collection returns no docs',
  },
  sampleSize: {
    type: 'number',
    description: 'Number of documents to sample (default 20)',
  },
  aggregations: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        alias: { type: 'string', description: 'Key name for this result in the response' },
        type: {
          type: 'string',
          enum: ['sum', 'avg', 'count'],
          description: '"sum" and "avg" require a field; "count" does not',
        },
        field: { type: 'string', description: 'Field path to aggregate (required for sum/avg)' },
      },
      required: ['alias', 'type'],
    },
    description: 'Aggregation specs for aggregate_collection',
  },
  collectionGroup: {
    type: 'string',
    description: 'Filter results to a specific collection group name',
  },
  includeNotReady: {
    type: 'boolean',
    description: 'Include indexes still being created or needing repair',
  },
  field: {
    type: 'string',
    description: 'Single field name to count unique values for. Use fields[] for multi-field grouping.',
  },
  fields: {
    type: 'array',
    items: { type: 'string' },
    description:
      'Multiple field names to fetch. Each result value is an object keyed by field name. Use groupByFields to group on a subset.',
  },
  groupByFields: {
    type: 'array',
    items: { type: 'string' },
    description:
      'Subset of fields[] to use as the grouping/identity key. Remaining fields are collected as label arrays (unique values seen per group). Allows minCollections to operate on a stable ID field even when a display name varies across collections.',
  },
  groupByPathSegment: {
    type: 'number',
    description:
      'When using collectionId: 0-based index of the path segment to use as the byCollection key instead of the full path (e.g. 2 extracts "ABC123" from "shared/stores_data/ABC123/data/purchase_orders")',
  },
  minCollections: {
    type: ['number', 'string'],
    description:
      'When using collectionId: only return values that appear in at least this many distinct collection buckets. Pass a number (e.g. 2) or "all" to mean "present in every collection bucket found". All returned values are annotated with collectionCount and collections[] regardless.',
  },
} as const;

export type FirestorePropKey = keyof typeof FIRESTORE_PROPS;
