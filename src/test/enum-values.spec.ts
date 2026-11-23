import expect from 'expect';
import { EnumMemberStructure, OptionalKind, Project } from 'ts-morph';

import { extractEnumValueDocumentation } from '../handlers/prisma-enum-documentation';
import { testGenerate } from './test-generate';

let project: Project;

const enumMembers = (file: string, name: string) =>
  project
    .getSourceFileOrThrow(s => s.getFilePath().endsWith(file))
    .getEnumOrThrow(name)
    .getStructure().members as OptionalKind<EnumMemberStructure>[];

const initializerOf = (file: string, enumName: string, member: string) =>
  enumMembers(file, enumName).find(m => m.name === member)?.initializer;

describe('enum values from comments', () => {
  let sourceText: string;

  before(async () => {
    ({ project } = await testGenerate({
      schema: `
        enum Role {
          /// @value("user")
          USER
          /// @value(2)
          ADMIN
          /// "guest"
          GUEST
          /// 3
          EDITOR
          /// -1.5
          NEGATIVE
          /// @value('single')
          SINGLE
          /// Can review things
          /// @value("reviewer")
          REVIEWER
          /// @deprecated Use USER instead
          /// @value(10)
          LEGACY
          /// Plain description
          DESCRIBED
          PLAIN
        }
        model User {
          id    Int   @id
          role  Role
        }`,
    }));
    sourceText = project
      .getSourceFileOrThrow(s => s.getFilePath().endsWith('role.enum.ts'))
      .getText();
  });

  it('string value from @value()', () => {
    expect(initializerOf('role.enum.ts', 'Role', 'USER')).toEqual('"user"');
  });

  it('number value from @value()', () => {
    expect(initializerOf('role.enum.ts', 'Role', 'ADMIN')).toEqual('2');
  });

  it('string value from bare string literal comment', () => {
    expect(initializerOf('role.enum.ts', 'Role', 'GUEST')).toEqual('"guest"');
  });

  it('number value from bare number literal comment', () => {
    expect(initializerOf('role.enum.ts', 'Role', 'EDITOR')).toEqual('3');
    expect(initializerOf('role.enum.ts', 'Role', 'NEGATIVE')).toEqual('-1.5');
  });

  it('single-quoted string value', () => {
    expect(initializerOf('role.enum.ts', 'Role', 'SINGLE')).toEqual('"single"');
  });

  it('value alongside description', () => {
    expect(initializerOf('role.enum.ts', 'Role', 'REVIEWER')).toEqual('"reviewer"');
    expect(sourceText).toContain('description: "Can review things"');
    expect(sourceText).not.toContain('@value');
  });

  it('value alongside deprecation', () => {
    expect(initializerOf('role.enum.ts', 'Role', 'LEGACY')).toEqual('10');
    expect(sourceText).toContain('deprecationReason: "Use USER instead"');
  });

  it('keeps default value for described or plain members', () => {
    expect(initializerOf('role.enum.ts', 'Role', 'DESCRIBED')).toEqual('"DESCRIBED"');
    expect(sourceText).toContain('description: "Plain description"');
    expect(initializerOf('role.enum.ts', 'Role', 'PLAIN')).toEqual('"PLAIN"');
  });

  it('value-only comments do not produce valuesMap entries', () => {
    expect(sourceText).not.toMatch(/\bUSER: \{/);
    expect(sourceText).not.toMatch(/\bGUEST: \{/);
    expect(sourceText).not.toMatch(/\bEDITOR: \{/);
  });

  it('prisma built-in enums keep defaults', () => {
    expect(initializerOf('sort-order.enum.ts', 'SortOrder', 'asc')).toEqual('"asc"');
  });
});

describe('extractEnumValueDocumentation', () => {
  it('throws on invalid @value()', () => {
    expect(() =>
      extractEnumValueDocumentation([{ documentation: '@value(foo)', name: 'X' }]),
    ).toThrow(/X/);
  });

  it('returns value and description', () => {
    expect(
      extractEnumValueDocumentation([{ documentation: 'Desc\n@value(7)', name: 'X' }]),
    ).toEqual({ X: { description: 'Desc', value: 7 } });
  });

  it('allows parenthesis inside quoted value', () => {
    expect(
      extractEnumValueDocumentation([
        { documentation: '@value("a)b") Note', name: 'X' },
      ]),
    ).toEqual({ X: { description: 'Note', value: 'a)b' } });
  });

  it('ignores members without documentation', () => {
    expect(extractEnumValueDocumentation([{ name: 'X' }])).toEqual({});
  });
});
