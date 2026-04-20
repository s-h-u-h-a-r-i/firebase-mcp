import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ConfigError,
  ProjectConfigSchema,
  getConfigPath,
  loadConfig,
} from './index';

vi.mock('node:fs');

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
  timeouts: {
    callMs: 15000,
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

  it('applies default call timeout of 15000ms when timeouts is omitted', () => {
    const { timeouts: _timeouts, ...projectWithoutTimeouts } = validProject;
    const result = ProjectConfigSchema.safeParse(projectWithoutTimeouts);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timeouts.callMs).toBe(15000);
    }
  });

  it('accepts explicit timeouts.callMs', () => {
    const input = {
      ...validProject,
      timeouts: {
        callMs: 25000,
      },
    };
    const result = ProjectConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timeouts.callMs).toBe(25000);
    }
  });

  it('fails when timeouts.callMs is below minimum', () => {
    const input = {
      ...validProject,
      timeouts: {
        callMs: 99,
      },
    };
    const result = ProjectConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
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

// ---------------------------------------------------------------------------
// ConfigError
// ---------------------------------------------------------------------------

describe('ConfigError', () => {
  it('sets _tag to ConfigError', () => {
    const err = new ConfigError('test message');
    expect(err._tag).toBe('ConfigError');
  });

  it('sets name to ConfigError', () => {
    const err = new ConfigError('test message');
    expect(err.name).toBe('ConfigError');
  });

  it('sets message correctly', () => {
    const err = new ConfigError('something went wrong');
    expect(err.message).toBe('something went wrong');
  });

  it('accepts an optional cause', () => {
    const cause = new Error('root cause');
    const err = new ConfigError('wrapper', cause);
    expect(err.cause).toBe(cause);
  });

  it('cause is undefined when not provided', () => {
    const err = new ConfigError('no cause');
    expect(err.cause).toBeUndefined();
  });

  it('is an instance of Error', () => {
    expect(new ConfigError('x')).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// loadConfig
// ---------------------------------------------------------------------------

const validAppConfigJson = JSON.stringify({
  projects: {
    'my-project': {
      firebase: {
        projectId: 'my-project',
        serviceAccountPath: '/path/to/sa.json',
      },
      firestore: {
        rules: { allow: ['**'], deny: [] },
      },
    },
  },
});

async function runTask<A, E>(task: import('../task').Task<A, E>) {
  return task.unsafeRun();
}

describe('loadConfig', () => {
  beforeEach(() => {
    vi.mocked(readFileSync).mockReturnValue(validAppConfigJson);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns AppConfig on a valid config file', async () => {
    const result = await runTask(loadConfig('/fake/firebase-mcp.json'));
    expect(result._tag).toBe('ok');
    if (result._tag === 'ok') {
      expect(result.value.projects['my-project'].firebase.projectId).toBe(
        'my-project',
      );
    }
  });

  it('applies schema defaults inside loadConfig result', async () => {
    const result = await runTask(loadConfig('/fake/firebase-mcp.json'));
    expect(result._tag).toBe('ok');
    if (result._tag === 'ok') {
      const proj = result.value.projects['my-project'];
      expect(proj.firestore.maxCollectionReadSize).toBe(100);
      expect(proj.firestore.maxBatchFetchSize).toBe(200);
      expect(proj.timeouts.callMs).toBe(15000);
    }
  });

  it('returns a ConfigError when the file cannot be read', async () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });
    const result = await runTask(loadConfig('/nonexistent.json'));
    expect(result._tag).toBe('err');
    if (result._tag === 'err') {
      expect(result.error).toBeInstanceOf(ConfigError);
      expect(result.error.message).toContain('/nonexistent.json');
    }
  });

  it('returns a ConfigError when the file contains invalid JSON', async () => {
    vi.mocked(readFileSync).mockReturnValue('not valid json {{');
    const result = await runTask(loadConfig('/bad.json'));
    expect(result._tag).toBe('err');
    if (result._tag === 'err') {
      expect(result.error).toBeInstanceOf(ConfigError);
    }
  });

  it('returns a ConfigError with "Config validation failed" when schema is invalid', async () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ projects: { bad: {} } }),
    );
    const result = await runTask(loadConfig('/invalid-schema.json'));
    expect(result._tag).toBe('err');
    if (result._tag === 'err') {
      expect(result.error).toBeInstanceOf(ConfigError);
      expect(result.error.message).toBe('Config validation failed');
    }
  });

  it('passes a ConfigError thrown in try directly through the catch without re-wrapping', async () => {
    // Schema validation failure throws a ConfigError, which the catch clause
    // detects via instanceof and returns as-is (no double-wrapping).
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ projects: { p: { firebase: {} } } }),
    );
    const result = await runTask(loadConfig('/path.json'));
    expect(result._tag).toBe('err');
    if (result._tag === 'err') {
      expect(result.error._tag).toBe('ConfigError');
      expect(result.error.message).toBe('Config validation failed');
    }
  });
});

// ---------------------------------------------------------------------------
// getConfigPath
// ---------------------------------------------------------------------------

describe('getConfigPath', () => {
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('returns the value of --config when provided', () => {
    process.argv = ['node', 'script.js', '--config', '/custom/config.json'];
    expect(getConfigPath()).toBe('/custom/config.json');
  });

  it('falls back to ./firebase-mcp.json when --config is absent', () => {
    process.argv = ['node', 'script.js'];
    expect(getConfigPath()).toBe('./firebase-mcp.json');
  });
});
