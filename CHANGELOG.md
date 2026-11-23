# Changelog

Release notes are published with each GitHub release of
[quinnjr/prisma-nestjs-graphql](https://github.com/quinnjr/prisma-nestjs-graphql/releases).
Earlier history is available in the git log.

## Unreleased

First release of the fork as `@quinnjr/prisma-nestjs-graphql`.

### Breaking changes

- The package is renamed to `@quinnjr/prisma-nestjs-graphql`. Update the generator
  provider, e.g. `provider = "node node_modules/@quinnjr/prisma-nestjs-graphql"`.
- Requires Node.js >= 22.12.
- Enum value documentation lines that start like `@value(` but are malformed now fail generation.
- Fields of enums with custom member values are typed `keyof typeof Enum`.
- `Bytes` fields follow the Prisma major version: `Buffer` for Prisma 5, `Uint8Array` for Prisma 6.
- `Decimal` fields use `Prisma.Decimal` imported from the Prisma client import
  instead of `@prisma/client/runtime/library`.

### Features and fixes

- Custom enum member values with `@value(...)` in enum value documentation comments.
- `requireSingleFieldsInWhereUniqueInput` works again on Prisma 5 and later: it makes the
  single unique field of a `*WhereUniqueInput` required and non-null.
- The package can be imported from native ESM (`exports` has a `default` condition).
