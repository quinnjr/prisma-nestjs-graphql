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
