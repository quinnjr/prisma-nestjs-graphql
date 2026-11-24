import JSON5 from 'json5';
import { omit } from 'lodash';
import { EnumDeclarationStructure, StructureKind } from 'ts-morph';

import { ImportDeclarationMap } from '../helpers/import-declaration-map';
import { EventArguments, SchemaEnum } from '../types';

export function registerEnum(enumType: SchemaEnum, args: EventArguments) {
  const { config, enums, getSourceFile } = args;

  if (!config.emitBlocks.prismaEnums && !enums[enumType.name]) {
    return;
  }

  const dataModelEnum = enums[enumType.name];
  const sourceFile = getSourceFile({
    name: enumType.name,
    type: 'enum',
  });

  const importDeclarations = new ImportDeclarationMap();

  importDeclarations.set('registerEnumType', {
    moduleSpecifier: '@nestjs/graphql',
    namedImports: [{ name: 'registerEnumType' }],
  });

  const valueDocumentation = args.enumValueDocumentation[enumType.name] ?? {};

  // GraphQL metadata only (description, deprecationReason), without TypeScript `value`
  const graphqlValuesMap = Object.fromEntries(
    Object.entries(valueDocumentation)
      .map(([key, info]) => [key, omit(info, 'value')] as const)
      .filter(([, v]) => Object.keys(v).length > 0),
  );

  // JSON5 writes identifier keys unquoted and escapes string values,
  // so comment text cannot break out of the string literal
  const valuesMapEntry =
    Object.keys(graphqlValuesMap).length > 0
      ? `, valuesMap: ${JSON5.stringify(graphqlValuesMap, { quote: '"', space: 2 })}`
      : '';

  const enumStructure: EnumDeclarationStructure = {
    isExported: true,
    kind: StructureKind.Enum,
    // `@value(...)` from comment overrides default `KEY = "KEY"`
    members: enumType.values.map(v => ({
      initializer: JSON.stringify(valueDocumentation[v]?.value ?? v),
      name: v,
    })),
    name: enumType.name,
  };

  sourceFile.set({
    statements: [
      ...importDeclarations.toStatements(),
      enumStructure,
      '\n',
      `registerEnumType(${enumType.name}, { name: '${enumType.name}', description: ${JSON.stringify(
        dataModelEnum?.documentation,
      )}${valuesMapEntry} })`,
    ],
  });
}
