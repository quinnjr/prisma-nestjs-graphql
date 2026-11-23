import { readFileSync } from 'graceful-fs';
import { dirname } from 'path';

export type PrismaClientVersion =
  | { major: number }
  | { major: undefined; /** Why the version is unknown */ reason: string };

/**
 * Major version of `@prisma/client` resolved from the schema directory
 * (the project being generated). Unknown with a reason when the package
 * is not installed there or its package.json cannot be read.
 */
export function getPrismaClientMajor(
  schemaPath: string | undefined,
): PrismaClientVersion {
  const directory = schemaPath ? dirname(schemaPath) : process.cwd();
  let packageJsonPath: string;
  try {
    packageJsonPath = require.resolve('@prisma/client/package.json', {
      paths: [directory],
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
      return {
        major: undefined,
        reason: `@prisma/client is not resolvable from ${directory}`,
      };
    }
    return {
      major: undefined,
      reason: `Cannot read @prisma/client package from ${directory}: ${errorMessage(error)}`,
    };
  }

  let version: unknown;
  try {
    ({ version } = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      version?: unknown;
    });
  } catch (error) {
    return {
      major: undefined,
      reason: `Cannot read ${packageJsonPath}: ${errorMessage(error)}`,
    };
  }

  const major = typeof version === 'string' ? Number.parseInt(version) : Number.NaN;
  if (Number.isNaN(major)) {
    return {
      major: undefined,
      reason: `Invalid version ${JSON.stringify(version)} in ${packageJsonPath}`,
    };
  }

  return { major };
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
