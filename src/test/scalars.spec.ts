import { Project } from 'ts-morph';
import { beforeAll, describe, expect, it } from 'vitest';

import { testSourceFile } from './helpers';
import { testGenerate } from './test-generate';

describe('scalars', () => {
  let project: Project;
  beforeAll(async () => {
    ({ project } = await testGenerate({
      options: [`outputFilePattern = "{name}.{type}.ts"`],
      schema: `
        model User {
          id String @id
          bytes Bytes
          maybeBytes Bytes?
        }
      `,
    }));
  });

  it('bytes should have type equal to prisma not null', () => {
    const s = testSourceFile({
      file: 'user.model.ts',
      project,
      property: 'bytes',
    });
    expect(s.property?.type).toEqual("ReturnType<Uint8Array['slice']>");
  });

  it('bytes should have type equal to prisma nullable', () => {
    const s = testSourceFile({
      file: 'user.model.ts',
      project,
      property: 'maybeBytes',
    });
    expect(s.property?.type).toEqual("ReturnType<Uint8Array['slice']> | null");
  });
});

describe('bytes when prisma client version is unknown', () => {
  it('warns and falls back to latest bytes type', async () => {
    const warnings: unknown[] = [];
    const { project } = await testGenerate({
      generatorOptions: { schemaPath: '/nonexistent-root-dir/schema.prisma' },
      onConnect: emitter => {
        emitter.on('Warning', (message: unknown) => {
          warnings.push(message);
        });
      },
      options: [`outputFilePattern = "{name}.{type}.ts"`],
      schema: `
        model User {
          id String @id
          bytes Bytes
        }
      `,
    });

    expect(warnings).toContainEqual(
      '@prisma/client is not resolvable from /nonexistent-root-dir, assuming Prisma Client >= 6 (Bytes as Uint8Array)',
    );
    const s = testSourceFile({ file: 'user.model.ts', project, property: 'bytes' });
    expect(s.property?.type).toEqual("ReturnType<Uint8Array['slice']>");
  });
});
