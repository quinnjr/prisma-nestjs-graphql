import expect from 'expect';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'graceful-fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { getBytesType, getPrismaClientMajor } from './get-bytes-type';

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
  let projectDirectory: string;

  before(() => {
    projectDirectory = mkdtempSync(join(tmpdir(), 'prisma-client-major-'));
    const clientDirectory = join(projectDirectory, 'node_modules', '@prisma', 'client');
    mkdirSync(clientDirectory, { recursive: true });
    writeFileSync(
      join(clientDirectory, 'package.json'),
      JSON.stringify({ name: '@prisma/client', version: '5.22.0' }),
    );
    mkdirSync(join(projectDirectory, 'prisma'));
  });

  after(() => {
    rmSync(projectDirectory, { force: true, recursive: true });
  });

  it('resolves client next to the schema', () => {
    expect(
      getPrismaClientMajor(join(projectDirectory, 'prisma', 'schema.prisma')),
    ).toBe(5);
  });

  it('resolves installed client of this repository', () => {
    expect(getPrismaClientMajor(join(process.cwd(), 'prisma', 'schema.prisma'))).toBe(
      6,
    );
  });

  it('undefined when client is not resolvable', () => {
    expect(getPrismaClientMajor('/nonexistent-root-dir/schema.prisma')).toBeUndefined();
  });
});
