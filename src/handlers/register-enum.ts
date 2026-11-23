import { omit } from 'lodash';
import { EnumDeclarationStructure, StructureKind } from 'ts-morph';

import { ImportDeclarationMap } from '../helpers/import-declaration-map';
import { EventArguments, SchemaEnum } from '../types';
import { extractEnumValueDocumentation } from './prisma-enum-documentation';

export function registerEnum(enumType: SchemaEnum, args: EventArguments) {
  const { config, enums, getSourceFile } = args;

  if (!config.emitBlocks.prismaEnums && !enums[enumType.name]) {
    return;
  }

  const dataModelEnum = enums[enumType.name];
  const enumTypesData = dataModelEnum?.values || [];
  const sourceFile = getSourceFile({
    name: enumType.name,
    type: 'enum',
  });

  const importDeclarations = new ImportDeclarationMap();

  importDeclarations.set('registerEnumType', {
    moduleSpecifier: '@nestjs/graphql',
    namedImports: [{ name: 'registerEnumType' }],
  });

  // Extract valuesMap from enum documentation
  const valuesMap = extractEnumValueDocumentation(enumTypesData);

  // Keep only graphql metadata (description, deprecationReason) for valuesMap
  const filteredValuesMap = Object.fromEntries(
    Object.entries(valuesMap)
      .map(([key, info]) => [key, omit(info, 'value')] as const)
      .filter(([, v]) => Object.keys(v).length > 0),
  );

  // Format only if needed
  const hasValuesMap = Object.keys(filteredValuesMap).length > 0;
  const formattedValuesMap = hasValuesMap
    ? JSON.stringify(filteredValuesMap, null, 2).replace(/"([^"]+)":/g, '$1:')
    : '';
  const valuesMapEntry = hasValuesMap ? `, valuesMap: ${formattedValuesMap}` : '';

  // Custom TypeScript values from comments (`@value(...)` or bare literal)
  const customValues = new Map(
    Object.entries(valuesMap).map(([key, info]) => [key, info.value] as const),
  );

  const enumStructure: EnumDeclarationStructure = {
    isExported: true,
    kind: StructureKind.Enum,
    // Value from comment overrides default `KEY = "KEY"`
    members: enumType.values.map(v => ({
      initializer: JSON.stringify(customValues.get(v) ?? v),
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
