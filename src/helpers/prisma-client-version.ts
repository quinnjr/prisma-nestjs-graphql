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
export function getPrismaClientVersion(
  schemaPath: string | undefined,
): PrismaClientVersion {
  const directory = schemaPath ? dirname(schemaPath) : process.cwd();
  let packageJsonPath: string;
  let version: unknown;
  try {
    // The resolver itself reads and parses package.json (for `exports`),
    // so unreadable or invalid files fail here too
    packageJsonPath = require.resolve('@prisma/client/package.json', {
      paths: [directory],
    });
    ({ version } = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      version?: unknown;
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

  const major = typeof version === 'string' ? Number.parseInt(version) : Number.NaN;
  if (Number.isNaN(major)) {
    return {
      major: undefined,
      reason: `Invalid version ${JSON.stringify(version)} in ${packageJsonPath}`,
    };
  }

  return { major };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
