import { describe, expect, it } from 'vitest';

import { ProjectConfigSchema } from './index';

// ---------------------------------------------------------------------------
// ProjectConfigSchema — the innermost validated unit, no file I/O needed
// ---------------------------------------------------------------------------

const validProject = {
  firebase: {
    projectId: 'my-project',
    serviceAccountPath: '/path/to/sa.json',
  },
  firestore: {
    rules: {
      allow: ['**'],
      deny: [],
    },
  },
};

describe('ProjectConfigSchema', () => {
  it('parses a fully valid project config', () => {
    const result = ProjectConfigSchema.safeParse(validProject);
    expect(result.success).toBe(true);
  });

  it('applies default maxCollectionReadSize of 100', () => {
    const result = ProjectConfigSchema.safeParse(validProject);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firestore.maxCollectionReadSize).toBe(100);
    }
  });

  it('applies default maxBatchFetchSize of 200', () => {
    const result = ProjectConfigSchema.safeParse(validProject);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firestore.maxBatchFetchSize).toBe(200);
    }
  });

  it('accepts explicit maxCollectionReadSize and maxBatchFetchSize', () => {
    const input = {
      ...validProject,
      firestore: {
        ...validProject.firestore,
        maxCollectionReadSize: 50,
        maxBatchFetchSize: 75,
      },
    };
    const result = ProjectConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firestore.maxCollectionReadSize).toBe(50);
      expect(result.data.firestore.maxBatchFetchSize).toBe(75);
    }
  });

  it('fails when firebase.projectId is missing', () => {
    const input = {
      ...validProject,
      firebase: { serviceAccountPath: '/path/to/sa.json' },
    };
    const result = ProjectConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('fails when firebase.serviceAccountPath is missing', () => {
    const input = {
      ...validProject,
      firebase: { projectId: 'my-project' },
    };
    const result = ProjectConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('fails when firestore.rules is missing', () => {
    const input = { ...validProject, firestore: {} };
    const result = ProjectConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('fails when firestore.rules.allow is not an array', () => {
    const input = {
      ...validProject,
      firestore: { rules: { allow: '**', deny: [] } },
    };
    const result = ProjectConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('fails when firestore.rules.deny is not an array', () => {
    const input = {
      ...validProject,
      firestore: { rules: { allow: ['**'], deny: 'none' } },
    };
    const result = ProjectConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('fails when the top-level object is missing', () => {
    expect(ProjectConfigSchema.safeParse(null).success).toBe(false);
    expect(ProjectConfigSchema.safeParse(undefined).success).toBe(false);
    expect(ProjectConfigSchema.safeParse('string').success).toBe(false);
  });
});
