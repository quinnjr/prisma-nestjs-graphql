import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import {
  Field,
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';
import JSON5 from 'json5';
import { createRequire } from 'module';
import { EnumMemberStructure, OptionalKind, Project, ts } from 'ts-morph';
import { beforeAll, describe, expect, it } from 'vitest';

import { extractEnumValueDocumentation } from '../helpers/enum-value-documentation';
import { testSourceFile } from './helpers';
import { testGenerate } from './test-generate';

// NestJS loads the CommonJS build of graphql, use the same module instance
const cjsRequire = createRequire(__filename);
const { graphql, printSchema } = cjsRequire('graphql') as typeof import('graphql');

const schemaModel = `
  model User {
    id    Int    @id
    role  Role
    roles Role[]
  }`;

const enumSourceFile = (project: Project, file: string) =>
  project.getSourceFileOrThrow(s => s.getFilePath().endsWith(`/${file}`));

const enumMembers = (project: Project, file: string, enumName: string) =>
  enumSourceFile(project, file).getEnumOrThrow(enumName).getStructure()
    .members as OptionalKind<EnumMemberStructure>[];

const initializerOf = (
  project: Project,
  file: string,
  enumName: string,
  member: string,
) => enumMembers(project, file, enumName).find(m => m.name === member)?.initializer;

/** Parsed `valuesMap` argument of the generated registerEnumType() call */
const registeredValuesMap = (project: Project, file: string) => {
  const call = enumSourceFile(project, file)
    .getDescendantsOfKind(ts.SyntaxKind.CallExpression)
    .find(c => c.getExpression().getText() === 'registerEnumType');
  const valuesMap = call
    ?.getArguments()[1]
    ?.asKindOrThrow(ts.SyntaxKind.ObjectLiteralExpression)
    .getProperty('valuesMap')
    ?.asKindOrThrow(ts.SyntaxKind.PropertyAssignment)
    .getInitializerOrThrow()
    .getText();

  return valuesMap === undefined
    ? undefined
    : JSON5.parse<Record<string, Record<string, unknown>>>(valuesMap);
};

describe('enum values from comments', () => {
  let project: Project;
  const roleInitializer = (member: string) =>
    initializerOf(project, 'role.enum.ts', 'Role', member);

  beforeAll(async () => {
    ({ project } = await testGenerate({
      schema: `
        enum Role {
          /// @value("user")
          USER
          /// @value(2)
          ADMIN
          /// @value(-1.5)
          NEGATIVE
          /// @value('single')
          SINGLE
          /// @value("C:\\\\dir")
          PATH
          /// Can review things
          /// @value("reviewer")
          REVIEWER
          /// @deprecated Use USER instead
          /// @value(10)
          LEGACY
          /// Plain description
          DESCRIBED
          /// "guest"
          QUOTED
          /// 3
          NUMBERED
          /// Use @value(x) to configure
          MENTION
          /// First paragraph
          ///
          /// Second paragraph
          SPACED
          /// Use "admin": full access \`\${process.exit(1)}\`
          INJECTION
          PLAIN
        }
        ${schemaModel}`,
    }));
  });

  it('string value from @value()', () => {
    expect(roleInitializer('USER')).toEqual('"user"');
  });

  it('number value from @value()', () => {
    expect(roleInitializer('ADMIN')).toEqual('2');
  });

  it('negative decimal value', () => {
    expect(roleInitializer('NEGATIVE')).toEqual('-1.5');
  });

  it('single-quoted string value', () => {
    expect(roleInitializer('SINGLE')).toEqual('"single"');
  });

  it('escaped backslash in value', () => {
    expect(roleInitializer('PATH')).toEqual(String.raw`"C:\\dir"`);
  });

  it('value alongside description', () => {
    expect(roleInitializer('REVIEWER')).toEqual('"reviewer"');
    expect(registeredValuesMap(project, 'role.enum.ts')?.REVIEWER).toEqual({
      description: 'Can review things',
    });
  });

  it('value alongside deprecation', () => {
    expect(roleInitializer('LEGACY')).toEqual('10');
    expect(registeredValuesMap(project, 'role.enum.ts')?.LEGACY).toEqual({
      deprecationReason: 'Use USER instead',
    });
  });

  it('described member keeps default value', () => {
    expect(roleInitializer('DESCRIBED')).toEqual('"DESCRIBED"');
    expect(registeredValuesMap(project, 'role.enum.ts')?.DESCRIBED).toEqual({
      description: 'Plain description',
    });
  });

  it('plain member keeps default value', () => {
    expect(roleInitializer('PLAIN')).toEqual('"PLAIN"');
  });

  it('bare string literal comment stays a description', () => {
    expect(roleInitializer('QUOTED')).toEqual('"QUOTED"');
    expect(registeredValuesMap(project, 'role.enum.ts')?.QUOTED).toEqual({
      description: '"guest"',
    });
  });

  it('bare number literal comment stays a description', () => {
    expect(roleInitializer('NUMBERED')).toEqual('"NUMBERED"');
    expect(registeredValuesMap(project, 'role.enum.ts')?.NUMBERED).toEqual({
      description: '3',
    });
  });

  it('@value mentioned inside a sentence is a description', () => {
    expect(roleInitializer('MENTION')).toEqual('"MENTION"');
    expect(registeredValuesMap(project, 'role.enum.ts')?.MENTION).toEqual({
      description: 'Use @value(x) to configure',
    });
  });

  it('description without @value is kept unchanged', () => {
    expect(registeredValuesMap(project, 'role.enum.ts')?.SPACED).toEqual({
      description: 'First paragraph\n\nSecond paragraph',
    });
  });

  it('description with quotes and template syntax stays a string literal', () => {
    expect(registeredValuesMap(project, 'role.enum.ts')?.INJECTION).toEqual({
      description: 'Use "admin": full access `${process.exit(1)}`',
    });
  });

  it('valuesMap contains only graphql metadata', () => {
    const valuesMap = registeredValuesMap(project, 'role.enum.ts') ?? {};

    expect(Object.keys(valuesMap).sort()).toEqual(
      [
        'DESCRIBED',
        'INJECTION',
        'LEGACY',
        'MENTION',
        'NUMBERED',
        'QUOTED',
        'REVIEWER',
        'SPACED',
      ].sort(),
    );
    expect(Object.values(valuesMap).some(v => 'value' in v)).toBe(false);
  });

  it('model field of custom-valued enum is typed by member names', () => {
    const s = testSourceFile({ file: 'user.model.ts', project, property: 'role' });
    expect(s.property?.type).toEqual('keyof typeof Role');
  });

  it('list field of custom-valued enum is typed by member names', () => {
    const s = testSourceFile({ file: 'user.model.ts', project, property: 'roles' });
    expect(s.property?.type).toEqual('Array<keyof typeof Role>');
  });

  it('input field of custom-valued enum is typed by member names', () => {
    const s = testSourceFile({
      file: 'user-create.input.ts',
      project,
      property: 'role',
    });
    expect(s.property?.type).toEqual('keyof typeof Role');
  });

  it('prisma built-in enums keep defaults', () => {
    expect(initializerOf(project, 'sort-order.enum.ts', 'SortOrder', 'asc')).toEqual(
      '"asc"',
    );
  });
});

describe('enum without custom values', () => {
  it('fields keep template literal type', async () => {
    const { project } = await testGenerate({
      schema: `
        enum Role {
          /// Description
          USER
        }
        ${schemaModel}`,
    });
    const s = testSourceFile({ file: 'user.model.ts', project, property: 'role' });

    expect(s.property?.type).toEqual('`${Role}`');
  });
});

describe('enum values with emitSingle', () => {
  it('custom value in single file', async () => {
    const { project } = await testGenerate({
      // Default pattern leaves the test harness project empty with emitSingle,
      // same setup as other emitSingle specs
      options: ['emitSingle = true', 'outputFilePattern = "{name}.{type}.ts"'],
      schema: `
        enum Role {
          /// @value("user")
          USER
        }
        ${schemaModel}`,
    });

    expect(initializerOf(project, 'index.ts', 'Role', 'USER')).toEqual('"user"');
  });
});

describe('enum values with existing enum source file', () => {
  it('custom value overrides existing member', async () => {
    const { project } = await testGenerate({
      createSouceFile: {
        name: 'Role',
        text: `export enum Role { USER = "USER" }`,
        type: 'enum',
      },
      schema: `
        enum Role {
          /// @value("user")
          USER
        }
        ${schemaModel}`,
    });

    expect(initializerOf(project, 'role.enum.ts', 'Role', 'USER')).toEqual('"user"');
  });
});

describe('invalid enum value directive', () => {
  it('fails generation', async () => {
    await expect(
      testGenerate({
        schema: `
          enum Role {
            /// @value(foo)
            USER
          }
          ${schemaModel}`,
      }),
    ).rejects.toThrow('Invalid @value directive for enum value Role.USER');
  });
});

describe('extractEnumValueDocumentation', () => {
  const extract = (documentation: string) =>
    extractEnumValueDocumentation('Role', [{ documentation, name: 'X' }]).X;

  for (const [documentation, value] of [
    ['@value(1)', 1],
    ['@value(-1.5)', -1.5],
    ['@value(.5)', 0.5],
    ['@value(1e3)', 1000],
    ['@value(0x10)', 16],
    [String.raw`@value("a\"b")`, 'a"b'],
    [String.raw`@value('it\'s')`, "it's"],
    [`@value('say "hi"')`, 'say "hi"'],
    [String.raw`@value('a\\"')`, String.raw`a\"`],
    [String.raw`@value("a\nb")`, 'a\nb'],
    ['@value("a)b")', 'a)b'],
    ['@value("")', ''],
    ['  @value("indented")', 'indented'],
  ] as const) {
    it(`parses ${documentation}`, () => {
      expect(extract(documentation)).toEqual({ value });
    });
  }

  for (const documentation of [
    '@value(foo)',
    '@value()',
    '@value(1e400)',
    '@value(12345678901234567890)',
    '@value(NaN)',
    '@value(true)',
    '@value(null)',
    '@value({})',
    String.raw`@value("\x")`,
    '@value ("x")',
    '@value("x"',
    '@Value("x")',
    '@value("x") trailing',
  ]) {
    it(`rejects ${documentation}`, () => {
      expect(() => extract(documentation)).toThrow(
        'Invalid @value directive for enum value Role.X',
      );
    });
  }

  it('rejects multiple directives', () => {
    expect(() => extract('@value("a")\n@value("b")')).toThrow(
      'Multiple @value directives for enum value Role.X',
    );
  });

  it('returns value and description', () => {
    expect(extract('Desc\n@value(7)')).toEqual({ description: 'Desc', value: 7 });
  });

  it('keeps multiline description around directive', () => {
    expect(extract('Line one\n@value(7)\nLine two')).toEqual({
      description: 'Line one\nLine two',
      value: 7,
    });
  });

  it('ignores members without documentation', () => {
    expect(extractEnumValueDocumentation('Role', [{ name: 'X' }])).toEqual({});
  });
});

describe('custom enum values in graphql schema', () => {
  let schemaText: string;
  let execute: (query: string) => Promise<unknown>;

  beforeAll(async () => {
    const { project } = await testGenerate({
      schema: `
        enum Role {
          /// @value("user")
          USER
          /// @value(2)
          ADMIN
          GUEST
        }
        ${schemaModel}`,
    });
    // Run generated enum module to register it in NestJS metadata
    const { outputText } = ts.transpileModule(
      enumSourceFile(project, 'role.enum.ts').getFullText(),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    );
    const moduleExports: { Role?: Record<string, string | number> } = {};
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- evaluates generator output in test
    const runModule = new Function('require', 'exports', outputText) as (
      moduleRequire: NodeJS.Require,
      moduleExports: object,
    ) => void;
    runModule(cjsRequire, moduleExports);
    const Role = moduleExports.Role!;

    @ObjectType()
    class RoleHolder {
      @Field(() => Role)
      role!: string | number;
    }

    @Resolver()
    class RoleResolver {
      @Query(() => [RoleHolder])
      roles(): RoleHolder[] {
        return [];
      }
    }

    const app = await NestFactory.create(GraphQLSchemaBuilderModule, { logger: false });
    await app.init();
    const schema = await app.get(GraphQLSchemaFactory).create([RoleResolver]);
    await app.close();
    schemaText = printSchema(schema);
    // Schema factory builds types only, resolve through root value
    const rootValue = {
      roles: () => [{ role: Role.USER }, { role: Role.ADMIN }, { role: Role.GUEST }],
    };
    execute = async (source: string) =>
      (await graphql({ rootValue, schema, source })).data;
  });

  it('schema enum uses member names only', () => {
    expect(schemaText).toMatch(/enum Role \{\s+USER\s+ADMIN\s+GUEST\s+\}/);
  });

  it('enum values serialize to member names', async () => {
    expect(await execute('{ roles { role } }')).toEqual({
      roles: [{ role: 'USER' }, { role: 'ADMIN' }, { role: 'GUEST' }],
    });
  });
});
