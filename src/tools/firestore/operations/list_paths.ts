import type { ProjectContext } from '../../../project';
import { Task } from '../../../task';
import type { OperationSchema } from '../../build-tool';
import type { FirestorePropKey } from '../properties';

export const LIST_PATHS = 'list_paths' as const;

export const listPathsOp: OperationSchema<FirestorePropKey> = {
  name: LIST_PATHS,
  description:
    'Returns all named path templates registered in config for this project. ' +
    'Each entry has a template (using {param} placeholders), the extracted parameter names, ' +
    'whether it resolves to a document (even segments) or collection (odd segments), ' +
    'and an optional description. Call this early to avoid exploring the schema from scratch.',
  properties: [],
};

export interface ListPathsArgs {}

const extractParams = (template: string): string[] =>
  [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

const segmentCount = (template: string): number =>
  template.split('/').filter(Boolean).length;

export const listPaths = (ctx: ProjectContext, _input: ListPathsArgs) =>
  Task.gen(function* () {
    const configPaths = ctx.config.firestore.paths;
    const entries = Object.entries(configPaths).map(([name, entry]) => {
      const params = extractParams(entry.template);
      const segments = segmentCount(entry.template);
      return {
        name,
        template: entry.template,
        parameters: params,
        type: segments % 2 === 0 ? 'document' : 'collection',
        ...(entry.description ? { description: entry.description } : {}),
      };
    });
    return {
      count: entries.length,
      paths: entries,
      usage:
        entries.length > 0
          ? 'Replace each {param} with a concrete value to build a real Firestore path.'
          : 'No paths registered. Users can add named path templates to the firestore.paths section of firebase-mcp.json.',
    };
  });
