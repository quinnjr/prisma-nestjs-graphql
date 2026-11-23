import { readFileSync } from 'graceful-fs';
import { dirname } from 'path';

/**
 * Major version of `@prisma/client` resolved from the schema directory
 * (the project being generated), undefined when it cannot be resolved.
 */
export function getPrismaClientMajor(
  schemaPath: string | undefined,
): number | undefined {
  try {
    const packageJsonPath = require.resolve('@prisma/client/package.json', {
      paths: [schemaPath ? dirname(schemaPath) : process.cwd()],
    });
    const { version } = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      version?: unknown;
    };
    const major = typeof version === 'string' ? Number.parseInt(version) : Number.NaN;

    return Number.isNaN(major) ? undefined : major;
  } catch {
    return undefined;
  }
}

/**
 * TypeScript type matching `Prisma.Bytes` of the given Prisma Client major version:
 * `Buffer` before 6, `Uint8Array` since 6 (written like Prisma does, so it is
 * `Uint8Array<ArrayBuffer>` on TypeScript >= 5.7). Unknown version means latest.
 */
export function getBytesType(prismaClientMajor: number | undefined): string {
  if (prismaClientMajor !== undefined && prismaClientMajor < 6) {
    return 'Buffer';
  }

  return "ReturnType<Uint8Array['slice']>";
}
