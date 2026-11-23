import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'graceful-fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getBytesType, getPrismaClientMajor } from './get-bytes-type';
import { getPropertyType } from './get-property-type';

describe('getBytesType', () => {
  it('Buffer for Prisma 5', () => {
    expect(getBytesType(5)).toEqual('Buffer');
  });

  it('Uint8Array like Prisma.Bytes for Prisma 6', () => {
    expect(getBytesType(6)).toEqual("ReturnType<Uint8Array['slice']>");
  });

  it('latest type when version is unknown', () => {
    expect(getBytesType(undefined)).toEqual("ReturnType<Uint8Array['slice']>");
  });
});

describe('getPrismaClientMajor', () => {
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

  it('resolves client next to the schema', () => {
    const schemaPath = createProject(
      'prisma5',
      JSON.stringify({ name: '@prisma/client', version: '5.22.0' }),
    );
    expect(getPrismaClientMajor(schemaPath)).toEqual({ major: 5 });
  });

  it('resolves installed client of this repository', () => {
    expect(
      getPrismaClientMajor(join(process.cwd(), 'prisma', 'schema.prisma')),
    ).toEqual({ major: 6 });
  });

  it('resolves from working directory without schema path', () => {
    expect(getPrismaClientMajor(undefined)).toEqual({ major: 6 });
  });

  it('unknown with reason when client is not resolvable', () => {
    const result = getPrismaClientMajor('/nonexistent-root-dir/schema.prisma');
    expect(result.major).toBeUndefined();
    expect(result).toMatchObject({
      reason: '@prisma/client is not resolvable from /nonexistent-root-dir',
    });
  });

  it('unknown with reason when package.json is corrupt', () => {
    const schemaPath = createProject('corrupt', '{ not json');
    const result = getPrismaClientMajor(schemaPath);
    expect(result.major).toBeUndefined();
    expect('reason' in result ? result.reason : '').toContain('Cannot read');
  });

  it('unknown with reason when version is invalid', () => {
    const schemaPath = createProject(
      'garbage',
      JSON.stringify({ name: '@prisma/client', version: 'garbage' }),
    );
    const result = getPrismaClientMajor(schemaPath);
    expect(result.major).toBeUndefined();
    expect('reason' in result ? result.reason : '').toContain(
      'Invalid version "garbage"',
    );
  });
});

describe('getPropertyType Bytes', () => {
  it('uses detected bytes type', () => {
    expect(
      getPropertyType({
        bytesType: 'Buffer',
        customValueEnums: new Set(),
        location: 'scalar',
        type: 'Bytes',
      }),
    ).toEqual(['Buffer']);
  });
});
