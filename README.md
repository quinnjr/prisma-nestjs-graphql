# @quinnjr/prisma-nestjs-graphql

Generate object types, inputs, args, etc. from prisma schema file for usage with @nestjs/graphql module.

## Features

- Generates only necessary imports
- Combines zoo of nested/nullable filters
- Does not generate resolvers, since it's application specific

## Install

```sh
pnpm add -D @quinnjr/prisma-nestjs-graphql
```

## Usage

1. Add new generator section to `schema.prisma` file

```prisma
generator nestgraphql {
    provider = "node node_modules/@quinnjr/prisma-nestjs-graphql"
    // or the package binary, e.g. in monorepos
    // provider = "prisma-nestjs-graphql"
    output = "../src/@generated"
}
```

2. Run prisma generate

```sh
pnpm exec prisma generate
```

3. If your models have `Decimal` and `Json` types, you need install:

```sh
pnpm add graphql-type-json prisma-graphql-type-decimal
```

- [graphql-type-json](https://github.com/taion/graphql-type-json)
- [prisma-graphql-type-decimal](https://github.com/unlight/prisma-graphql-type-decimal)

Or write you own graphql scalar types, [read more on docs.nestjs.com](https://docs.nestjs.com/graphql/scalars).

## Generator options

#### `output`

Output folder relative to this schema file  
Type: `string`

#### `outputFilePattern`

File path and name pattern  
Type: `string`  
Default: `{model}/{name}.{type}.ts`  
Possible tokens:

- `{model}` Model name in dashed case or 'prisma' if unknown
- `{name}` Dashed-case name of model/input/arg without suffix
- `{type}` Short type name (model, input, args, output)
- `{plural.type}` Plural short type name (models, inputs, enums)

#### `tsConfigFilePath`

Path to `tsconfig.json` (absolute path or relative to current working directory)  
Type: `string | undefined`  
Default: `tsconfig.json` if exists, `undefined` otherwise

#### `prismaClientImport`

The path to use to import the Prisma Client package
Type: `string | undefined`
Default: `@prisma/client`

#### `combineScalarFilters`

Combine nested/nullable scalar filters to single  
Type: `boolean`  
Default: `false`

#### `noAtomicOperations`

Remove input types for atomic operations  
Type: `boolean`  
Default: `false`

#### `reExport`

Create `index.ts` file with re-export  
Type: `enum`  
Values:  
`None` Default, create nothing  
`Directories` Create index file in all root directories  
`Single` Create single index file in output directory  
`All` Create index file in all root directories and in output directory

Example configuration:

```prisma
generator nestgraphql {
    provider = "node node_modules/@quinnjr/prisma-nestjs-graphql"
    output = "../src/@generated"
    reExport = Directories
}
```

#### `emitSingle`

Generate single file with merged classes and enums.  
Type: `boolean`  
Default: `false`

#### `emitCompiled`

Emit compiled JavaScript and definitions instead of TypeScript sources,
files will be compiled with `emitDecoratorMetadata:false`, because there is a problem
with temporal dead zone when generating merged file.  
Type: `boolean`  
Default: `false`

#### `emitBlocks`

Emit only selected blocks. Be aware, that some blocks do depend on others, e.g. one can't emit `models` without emitting `enums`.  
Type: `("args" | "inputs" | "outputs" | "models" | "enums")[]`  
Default: `["args", "inputs", "outputs", "models", "enums"]`

#### `omitModelsCount`

Omit `_count` field from models.  
Type: `boolean`  
Default: `false`

#### `purgeOutput`

Delete all files in `output` folder.  
Type: `boolean`  
Default: `false`

#### `noTypeId`

Disable usage of graphql `ID` type and use `Int/Float` for fields marked as `@id` in schema.  
Type: `boolean`  
Default: `false`

#### `requireSingleFieldsInWhereUniqueInput`

When a model has exactly one unique field (an `@id`, an `@unique` field, or a single `@@id` / `@@unique` compound),
mark that field as **required** (TypeScript) and **not nullable** (GraphQL) in its `*WhereUniqueInput` class.
`AND`, `OR`, `NOT` and the other filter fields stay optional.  
Type: `boolean`  
Default: `false`  
**Note**: It changes the generated GraphQL schema: the unique field becomes non-null in the `*WhereUniqueInput` input type.

#### `unsafeCompatibleWhereUniqueInput`

Set TypeScript property type as non optional for all fields in `*WhereUniqueInput` classes.
Type: `boolean`  
Default: `false`

#### `useInputType`

Since GraphQL does not support input union type, this setting map
allow to choose which input type is preferable.

```sh
generator nestgraphql {
    useInputType_{typeName}_{property} = "{pattern}"
}
```

Where:

- `typeName` Full name or partial name of the class where need to choose input type.  
  Example: `UserCreateInput` full name, `WhereInput` partial name, matches `UserWhereInput`, `PostWhereInput`, etc.
- `property` Property of the class for which need to choose type. Special case name `ALL` means any / all properties.
- `pattern` Part of name (or full) of type which should be chosen, you can use
  wild card or negate symbols, in this case pattern should starts with `match:`,
  e.g. `match:*UncheckedCreateInput` see [outmatch](https://github.com/axtgr/outmatch#usage) for details.

Example:

```ts
export type PostWhereInput = {
  author?: XOR<UserRelationFilter, UserWhereInput>;
};
export type UserRelationFilter = {
  is?: UserWhereInput;
  isNot?: UserWhereInput;
};

export type UserWhereInput = {
  AND?: Enumerable<UserWhereInput>;
  OR?: Enumerable<UserWhereInput>;
  NOT?: Enumerable<UserWhereInput>;
  id?: StringFilter | string;
  name?: StringFilter | string;
};
```

We have generated types above, by default property `author` will be decorated as `UserRelationFilter`,
to set `UserWhereInput` need to configure generator the following way:

```prisma
generator nestgraphql {
  provider = "node node_modules/@quinnjr/prisma-nestjs-graphql"
  output = "../src/@generated"
  useInputType_WhereInput_ALL = "WhereInput"
}
```

```ts
@InputType()
export class PostWhereInput {
  @Field(() => UserWhereInput, { nullable: true })
  author?: UserWhereInput;
}
```

#### `decorate`

Allow to attach multiple decorators to any field of any type.

```sh
generator nestgraphql {
    decorate_{key}_type = "outmatch pattern"
    decorate_{key}_field = "outmatch pattern"
    decorate_{key}_from = "module specifier"
    decorate_{key}_name = "import name"
    decorate_{key}_arguments = "[argument1, argument2]"
    decorate_{key}_defaultImport = "default import name" | true
    decorate_{key}_namespaceImport = "namespace import name"
    decorate_{key}_namedImport = "import name" | true
}
```

Where `{key}` any identifier to group values (written in [flatten](https://github.com/hughsk/flat) style)

- `decorate_{key}_type` - outmatch pattern to match class name
- `decorate_{key}_field` - outmatch pattern to match field name
- `decorate_{key}_from` - module specifier to import from (e.g `class-validator`)
- `decorate_{key}_name` - import name or name with namespace
- `decorate_{key}_defaultImport` - import as default
- `decorate_{key}_namespaceImport` - use this name as import namespace
- `decorate_{key}_namedImport` - named import (without namespace)
- `decorate_{key}_arguments` - arguments for decorator (if decorator need to be called as function)  
  Special tokens can be used:
  - `{propertyType.0}` - field's type (TypeScript type annotation)

Example of generated class:

```ts
@ArgsType()
export class CreateOneUserArgs {
  @Field(() => UserCreateInput, { nullable: false })
  data!: UserCreateInput;
}
```

To make it validateable (assuming `UserCreateInput` already contains validation decorators from `class-validator`),
it is necessary to add `@ValidateNested()` and `@Type()` from `class-transformer`.

```sh
decorate_1_type = "CreateOneUserArgs"
decorate_1_field = data
decorate_1_name = ValidateNested
decorate_1_from = "class-validator"
decorate_1_arguments = "[]"
decorate_2_type = "CreateOneUserArgs"
decorate_2_field = data
decorate_2_from = "class-transformer"
decorate_2_arguments = "['() => {propertyType.0}']"
decorate_2_name = Type
```

Result:

```ts
import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

@ArgsType()
export class CreateOneUserArgs {
  @Field(() => UserCreateInput, { nullable: false })
  @ValidateNested()
  @Type(() => UserCreateInput)
  data!: UserCreateInput;
}
```

Another example:

```sh
decorate_2_namespaceImport = "Transform"
decorate_2_name = "Transform.Type"
```

```ts
import * as Transform from 'class-transformer';

@Transform.Type(() => UserCreateInput)
data!: UserCreateInput;

```

Add `@HideField()` decorator to nested types:

```
decorate_3_type = "*CreateNestedOneWithoutUserInput"
decorate_3_field = "!(create)"
decorate_3_name = "HideField"
decorate_3_from = "@nestjs/graphql"
decorate_3_arguments = "[]"
```

May generate following class:

```ts
@Field(() => ProfileCreateWithoutUserInput, { nullable: true })
create?: ProfileCreateWithoutUserInput;

@HideField()
connectOrCreate?: ProfileCreateOrConnectWithoutUserInput;

@HideField()
connect?: ProfileWhereUniqueInput;
```

#### `graphqlScalars`

Allow to set custom graphql type for Prisma scalar type.
Format:

```
graphqlScalars_{type}_name = "string"
graphqlScalars_{type}_specifier = "string"
```

where `{type}` is a prisma scalar type name (e.g. BigInt)

Example:

```
graphqlScalars_BigInt_name = "GraphQLBigInt"
graphqlScalars_BigInt_specifier = "graphql-scalars"
```

May generate:

```ts
import { GraphQLBigInt } from 'graphql-scalars';

export class BigIntFilter {
  @Field(() => GraphQLBigInt, { nullable: true })
  equals?: bigint | number;
}
```

It will affect all inputs and outputs types (including models).

#### `customImport`

Allow to declare custom import statements. (Only works with emitSingle = true)

```sh
generator nestgraphql {
    customImport_{key}_from = "module specifier"
    customImport_{key}_name = "import name"
    customImport_{key}_defaultImport = "default import name" | true
    customImport_{key}_namespaceImport = "namespace import name"
    customImport_{key}_namedImport = "import name" | true
}
```

Where `{key}` any identifier to group values (written in [flatten](https://github.com/hughsk/flat) style)

- `customImport_{key}_from` - module specifier to import from (e.g `nestjs-i18n`)
- `customImport_{key}_name` - import name or name with namespace
- `customImport_{key}_defaultImport` - import as default
- `customImport_{key}_namespaceImport` - use this name as import namespace
- `customImport_{key}_namedImport` - named import (without namespace)

## Documentation and field options

Comments with triple slash will projected to typescript code comments
and some `@Field()` decorator options

For example:

```prisma
model Product {
  /// Old description
  /// @deprecated Use new name instead
  /// @complexity 1
  oldName String
}
```

May produce:

```ts
@ObjectType()
export class Product {
  /**
   * Old description
   * @deprecated Use new name instead
   */
  @Field(() => String, {
    description: 'Old description',
    deprecationReason: 'Use new name instead',
    complexity: 1,
  })
  oldName: string;
}
```

## Field Settings

Special directives in triple slash comments for more precise code generation.

#### @HideField()

Removes field from GraphQL schema.  
Alias: `@TypeGraphQL.omit(output: true)`

By default (without arguments) field will be decorated for hide only in output types (type in schema).  
To hide field in input types add `input: true`.  
To hide field in specific type you can use glob pattern `match: string | string[]`
see [outmatch](https://github.com/axtgr/outmatch#usage) for details.

Examples:

- `@HideField()` same as `@HideField({ output: true })`
- `@HideField({ input: true, output: true })`
- `@HideField({ match: 'UserCreate*Input' })`

```prisma
model User {
    id String @id @default(cuid())
    /// @HideField()
    password String
    /// @HideField({ output: true, input: true })
    secret String
    /// @HideField({ match: '@(User|Comment)Create*Input' })
    createdAt DateTime @default(now())
}
```

May generate classes:

```ts
@ObjectType()
export class User {
  @HideField()
  password: string;
  @HideField()
  secret: string;
  @Field(() => Date, { nullable: false })
  createdAt: Date;
}
```

```ts
@InputType()
export class UserCreateInput {
  @Field()
  password: string;
  @HideField()
  secret: string;
  @HideField()
  createdAt: Date;
}
```

#### Custom Decorators

Applying custom decorators requires configuration of generator.

```sh
generator nestgraphql {
    fields_{namespace}_from = "module specifier"
    fields_{namespace}_input = true | false
    fields_{namespace}_output = true | false
    fields_{namespace}_model = true | false
    fields_{namespace}_defaultImport = "default import name" | true
    fields_{namespace}_namespaceImport = "namespace import name"
    fields_{namespace}_namedImport = true | false
}
```

Create configuration map in [flatten](https://github.com/hughsk/flat) style for `{namespace}`.  
Where `{namespace}` is a namespace used in field triple slash comment.

##### `fields_{namespace}_from`

Required. Name of the module, which will be used in import (`class-validator`, `graphql-scalars`, etc.)  
Type: `string`

##### `fields_{namespace}_input`

Means that it will be applied on input types (classes decorated by `InputType`)  
Type: `boolean`  
Default: `false`

##### `fields_{namespace}_output`

Means that it will be applied on output types (classes decorated by `ObjectType`),
including models  
Type: `boolean`  
Default: `false`

##### `fields_{namespace}_model`

Means that it will be applied only on model types (classes decorated by `ObjectType`)  
Type: `boolean`  
Default: `false`

##### `fields_{namespace}_defaultImport`

Default import name, if module have no namespace.  
Type: `undefined | string | true`  
Default: `undefined`  
If defined as `true` then import name will be same as `{namespace}`

##### `fields_{namespace}_namespaceImport`

Import all as this namespace from module  
Type: `undefined | string`  
Default: Equals to `{namespace}`

##### `fields_{namespace}_namedImport`

If imported module has internal namespace, this allow to generate named import,  
imported name will be equal to `{namespace}`, see [example of usage](#propertytype)  
Type: `boolean`  
Default: `false`

Custom decorators example:

```prisma
generator nestgraphql {
    fields_Validator_from = "class-validator"
    fields_Validator_input = true
}

model User {
    id Int @id
    /// @Validator.MinLength(3)
    name String
}
```

May generate following class:

```ts
import { InputType, Field } from '@nestjs/graphql';
import * as Validator from 'class-validator';

@InputType()
export class UserCreateInput {
  @Field(() => String, { nullable: false })
  @Validator.MinLength(3)
  name!: string;
}
```

Custom decorators can be applied on classes (models):

```
/// @NG.Directive('@extends')
/// @NG.Directive('@key(fields: "id")')
model User {
    /// @NG.Directive('@external')
    id String @id
}

generator nestgraphql {
    fields_NG_from = "@nestjs/graphql"
    fields_NG_output = false
    fields_NG_model = true
}
```

May generate:

```ts
import * as NG from '@nestjs/graphql';

@NG.Directive('@extends')
@NG.Directive('@key(fields: "id")')
export class User {
    @Field(() => ID, { nullable: false })
    @NG.Directive('@external')
    id!: string;
```

#### @FieldType()

Allow set custom GraphQL scalar type for field

To override scalar type in specific classes, you can use glob pattern `match: string | string[]`
see [outmatch](https://github.com/axtgr/outmatch#usage) for details.

```prisma
model User {
    id Int @id
    /// @FieldType({ name: 'Scalars.GraphQLEmailAddress', from: 'graphql-scalars', input: true })
    email String
}
```

May generate following class:

```ts
import { InputType, Field } from '@nestjs/graphql';
import * as Scalars from 'graphql-scalars';

@InputType()
export class UserCreateInput {
  @Field(() => Scalars.GraphQLEmailAddress, { nullable: false })
  email!: string;
}
```

And following GraphQL schema:

```grapqhl
scalar EmailAddress

input UserCreateInput {
    email: EmailAddress!
}
```

Same field type may be used in different models and it is not convenient to specify every time all options.
There is a shortcut:

```grapqhl
generator nestgraphql {
    fields_Scalars_from = "graphql-scalars"
    fields_Scalars_input = true
    fields_Scalars_output = true
}

model User {
    id Int @id
    /// @FieldType('Scalars.GraphQLEmailAddress')
    email String
}
```

The result will be the same. `Scalars` is the namespace here.
Missing field options will merged from generator configuration.

#### @PropertyType()

Similar to `@FieldType()` but refer to TypeScript property (actually field too).

To override TypeScript type in specific classes, you can use glob pattern `match: string | string[]`
see [outmatch](https://github.com/axtgr/outmatch#usage) for details.

Example:

```
generator nestgraphql {
    fields_TF_from = "type-fest"
}

model User {
    id String @id
    /// @PropertyType('TF.JsonObject')
    data Json
}
```

May generate:

```ts
import * as TF from 'type-fest';

@ObjectType()
export class User {
  @Field(() => GraphQLJSON)
  data!: TF.JsonObject;
}
```

### @Directive()

Allow attach `@Directive` decorator from `@nestjs/graphql`

GraphQL federation example:

```
/// @Directive({ arguments: ['@extends'] })
/// @Directive({ arguments: ['@key(fields: "id")'] })
model User {
    /// @Directive({ arguments: ['@external'] })
    id String @id
}
```

May generate:

```ts
@ObjectType()
@Directive('@extends')
@Directive('@key(fields: "id")')
export class User {
  @Field(() => ID, { nullable: false })
  @Directive('@external')
  id!: string;
}
```

#### @ObjectType()

Allow rename type in schema and mark as abstract.

Example 1:

```
// schema.prisma
/// @ObjectType({ isAbstract: true })
model User {
    id Int @id
}
```

```ts
@ObjectType({ isAbstract: true })
export class User {}
```

Example 2:

```
// schema.prisma
/// @ObjectType('Human', { isAbstract: true })
model User {
    id Int @id
}
```

```ts
@ObjectType('Human', { isAbstract: true })
export class User {}
```

#### Enum values

By default each member of a generated TypeScript enum gets its own name as value (`USER = "USER"`).
A comment line `@value("text")` or `@value(number)` on an enum value sets a custom value instead.
It can be combined with a description or `@deprecated` on other comment lines.

```prisma
enum Role {
  /// @value("user")
  USER
  /// @value(2)
  ADMIN
  /// Can review articles
  /// @value('reviewer')
  REVIEWER
  /// @deprecated Use USER instead
  /// @value(10)
  LEGACY
  GUEST
}
```

```ts
export enum Role {
  USER = 'user',
  ADMIN = 2,
  REVIEWER = 'reviewer',
  LEGACY = 10,
  GUEST = 'GUEST',
}

registerEnumType(Role, {
  name: 'Role',
  description: undefined,
  valuesMap: {
    REVIEWER: { description: 'Can review articles' },
    LEGACY: { deprecationReason: 'Use USER instead' },
  },
});
```

Rules:

- A comment line starting with `@value` must be exactly `@value(<literal>)`,
  where the literal is a JSON5 string (single or double quotes) or a finite number.
  Anything else (`@value(foo)`, `@value ("x")`, two `@value` lines) fails generation.
- `@value` in the middle of a sentence, or a comment that is only a literal (`/// 2`),
  stays a plain description.
- GraphQL enum names are not affected, the schema still uses member names (`USER`, `ADMIN`).

Prisma Client reads and writes enums by member name (`'USER'`), not by custom value.
So fields of an enum with custom values are typed by member names (`keyof typeof Role`)
and stay compatible with Prisma types, while enums without custom values keep `` `${Role}` ``.
NestJS uses the enum values as GraphQL internal values: a resolver must return
`Role.USER` (`'user'`) for the field to serialize as `USER`, and receives `'user'` for input `USER`.
Map between member names and values when passing data between Prisma and GraphQL, for example
`Role[prismaUser.role]` to get the value and
`(Object.keys(Role) as (keyof typeof Role)[]).find(key => Role[key] === value)` to get the name.

### Using library in other generators

```ts
import { generate } from '@quinnjr/prisma-nestjs-graphql/generate';
```

## Development

```sh
pnpm install
pnpm run check          # lint, format check, typecheck and tests
pnpm run regen          # regenerate @generated from prisma/schema.prisma
pnpm run compatibility  # regenerate with each generator option and typecheck the result
pnpm run test:watch     # run tests in watch mode
```

## Releasing

Releases are published to npm by the [publish workflow](.github/workflows/publish.yml)
with npm trusted publishing (no npm token is stored).

1. Create a GitHub release with a tag `vX.Y.Z` on a commit that is on `master`.
   Write the release notes in the GitHub release.
2. The package version comes from the tag; `version` in `package.json` stays `0.0.0-dev`.
3. Prerelease tags such as `vX.Y.Z-rc.N` must be marked as **pre-release** on GitHub
   and are published under the `next` dist-tag; other releases are published under `latest`.
   The workflow fails if the tag and the pre-release flag disagree.

The workflow runs the full CI suite, builds the package in a job without access to the
OIDC token, then publishes the built artifact from a separate job in the `npm` environment.

### One-time npm setup

Trusted publishing is configured on the settings page of an existing package,
so the first version must be published manually:

```sh
pnpm run build
jq '.version = "1.0.0"' dist/package.json > dist/package.tmp.json
mv dist/package.tmp.json dist/package.json
npm login
npm publish ./dist --access public
```

Then on npmjs.com open the package, **Settings** → **Trusted publishing** → **GitHub Actions** and enter:

| Field             | Value                   |
| ----------------- | ----------------------- |
| Owner             | `quinnjr`               |
| Repository        | `prisma-nestjs-graphql` |
| Workflow filename | `publish.yml`           |
| Environment       | `npm`                   |

In the same settings set **Publishing access** to require two-factor authentication and disallow tokens.

On GitHub, configure the `npm` environment (repository **Settings** → **Environments** → `npm`)
with deployment tag rules that allow only `v*` tags.

## Similar Projects

- <https://github.com/jasonraimondi/prisma-generator-nestjs-graphql>
- <https://github.com/omar-dulaimi/prisma-class-validator-generator>
- <https://github.com/kimjbstar/prisma-class-generator>
- <https://github.com/odroe/nest-gql-mix>
- <https://github.com/rfermann/nestjs-prisma-graphql-generator>
- <https://github.com/madscience/graphql-codegen-nestjs>
- <https://github.com/wSedlacek/prisma-generators/tree/master/libs/nestjs>
- <https://github.com/EndyKaufman/typegraphql-prisma-nestjs>
- <https://github.com/MichalLytek/typegraphql-prisma>
- <https://github.com/mk668a/nestjs-prisma-graphql-crud-gen>

## Resources

- <https://github.com/prisma/prisma/blob/main/packages/client/src/generation/TSClient/TSClient.ts>
- <https://ts-ast-viewer.com/>
- <https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-schema/data-model>
- JSON type for the code first approach - <https://github.com/nestjs/graphql/issues/111#issuecomment-631452899>
- <https://github.com/paljs/prisma-tools/tree/master/packages/plugins>
- <https://github.com/wasp-lang/wasp>

## License

[MIT License](LICENSE)
