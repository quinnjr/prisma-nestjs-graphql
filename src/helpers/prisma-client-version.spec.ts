import { readFileSync } from 'graceful-fs';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'graceful-fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getPrismaClientVersion } from './prisma-client-version';

describe('getPrismaClientVersion', () => {
  let rootDirectory: string;

  /** Fake project with a schema and an installed @prisma/client package.json */
  const createProject = (name: string, packageJson: string | undefined) => {
    const projectDirectory = join(rootDirectory, name);
    mkdirSync(join(projectDirectory, 'prisma'), { recursive: true });
    if (packageJson !== undefined) {
      const clientDirectory = join(
        projectDirectory,
        'node_modules',
        '@prisma',
        'client',
      );
      mkdirSync(clientDirectory, { recursive: true });
      writeFileSync(join(clientDirectory, 'package.json'), packageJson);
    }
    return join(projectDirectory, 'prisma', 'schema.prisma');
  };

  beforeAll(() => {
    rootDirectory = mkdtempSync(join(tmpdir(), 'prisma-client-major-'));
  });

  afterAll(() => {
    rmSync(rootDirectory, { force: true, recursive: true });
  });

  /** Major of the @prisma/client installed in this repository */
  const installedMajor = Number.parseInt(
    (
      JSON.parse(
        readFileSync(require.resolve('@prisma/client/package.json'), 'utf8'),
      ) as { version: string }
    ).version,
  );
  const reasonOf = (result: ReturnType<typeof getPrismaClientVersion>) =>
    'reason' in result ? result.reason : '';

  it('resolves client next to the schema', () => {
    const schemaPath = createProject(
      'prisma5',
      JSON.stringify({ name: '@prisma/client', version: '5.22.0' }),
    );
    expect(getPrismaClientVersion(schemaPath)).toEqual({ major: 5 });
  });

  it('resolves installed client of this repository', () => {
    expect(
      getPrismaClientVersion(join(process.cwd(), 'prisma', 'schema.prisma')),
    ).toEqual({ major: installedMajor });
  });

  it('resolves from working directory without schema path', () => {
    expect(getPrismaClientVersion(undefined)).toEqual({ major: installedMajor });
  });

  it('unknown with reason when client is not installed', () => {
    const schemaPath = createProject('missing', undefined);
    const result = getPrismaClientVersion(schemaPath);
    expect(result.major).toBeUndefined();
    expect(reasonOf(result)).toBe(
      `@prisma/client is not resolvable from ${join(rootDirectory, 'missing', 'prisma')}`,
    );
  });

  it('unknown with reason when package.json is not exported', () => {
    const schemaPath = createProject(
      'not-exported',
      JSON.stringify({
        exports: { '.': './index.js' },
        name: '@prisma/client',
        version: '6.0.0',
      }),
    );
    const result = getPrismaClientVersion(schemaPath);
    expect(result.major).toBeUndefined();
    expect(reasonOf(result)).toContain(
      `Cannot read @prisma/client package from ${join(rootDirectory, 'not-exported', 'prisma')}:`,
    );
  });

  it('unknown with reason when package.json is corrupt', () => {
    const schemaPath = createProject('corrupt', '{ not json');
    const result = getPrismaClientVersion(schemaPath);
    expect(result.major).toBeUndefined();
    expect(reasonOf(result)).toContain(
      `Cannot read @prisma/client package from ${join(rootDirectory, 'corrupt', 'prisma')}:`,
    );
  });

  it('unknown with reason when version is invalid', () => {
    const schemaPath = createProject(
      'garbage',
      JSON.stringify({ name: '@prisma/client', version: 'garbage' }),
    );
    const result = getPrismaClientVersion(schemaPath);
    expect(result.major).toBeUndefined();
    expect(reasonOf(result)).toBe(
      `Invalid version "garbage" in ${join(rootDirectory, 'garbage', 'node_modules', '@prisma', 'client', 'package.json')}`,
    );
  });
});
