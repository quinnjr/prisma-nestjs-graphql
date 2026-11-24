import { GeneratorOptions } from '@prisma/generator-helper';
import { ok } from 'assert';
import { mapKeys } from 'lodash';
import { Project, QuoteKind } from 'ts-morph';

import { argsType } from './handlers/args-type';
import { combineScalarFilters } from './handlers/combine-scalar-filters';
import { createAggregateInput } from './handlers/create-aggregate-input';
import { emitSingle } from './handlers/emit-single';
import { generateFiles } from './handlers/generate-files';
import { inputType } from './handlers/input-type';
import { modelData } from './handlers/model-data';
import { modelOutputType } from './handlers/model-output-type';
import { noAtomicOperations } from './handlers/no-atomic-operations';
import { outputType } from './handlers/output-type';
import { purgeOutput } from './handlers/purge-output';
import { ReExport, reExport } from './handlers/re-export';
import { registerEnum } from './handlers/register-enum';
import { requireSingleFieldsInWhereUniqueInput } from './handlers/require-single-fields-in-whereunique-input';
import { warning } from './handlers/warning';
import { AwaitEventEmitter } from './helpers/await-event-emitter';
import { createConfig } from './helpers/create-config';
import { extractEnumValueDocumentation } from './helpers/enum-value-documentation';
import { factoryGetSourceFile } from './helpers/factory-get-source-file';
import { getBytesType } from './helpers/get-bytes-type';
import { createGetModelName } from './helpers/get-model-name';
import { getPrismaClientVersion } from './helpers/prisma-client-version';
import {
  Document,
  EventArguments,
  Field,
  Model,
  ObjectSettings,
  OutputType,
} from './types';

export async function generate(
  args: GeneratorOptions & {
    skipAddOutputSourceFiles?: boolean;
    connectCallback?: (
      emitter: AwaitEventEmitter,
      eventArguments: EventArguments,
    ) => void | Promise<void>;
  },
) {
  const { connectCallback, dmmf, generator, skipAddOutputSourceFiles } = args;

  const generatorOutputValue = generator.output?.value;
  ok(generatorOutputValue, 'Missing generator configuration: output');

  const config = createConfig(generator.config);

  const eventEmitter = new AwaitEventEmitter();
  eventEmitter.on('Warning', warning);
  if (config.emitBlocks.models) {
    eventEmitter.on('Model', modelData);
  }
  if (config.emitBlocks.prismaEnums || config.emitBlocks.schemaEnums) {
    eventEmitter.on('EnumType', registerEnum);
  }
  if (
    config.emitBlocks.outputs ||
    (config.emitBlocks.models && !config.omitModelsCount)
  ) {
    eventEmitter.on('OutputType', outputType);
  }
  if (config.emitBlocks.models) {
    eventEmitter.on('ModelOutputType', modelOutputType);
  }
  if (config.emitBlocks.outputs) {
    eventEmitter.on('AggregateOutput', createAggregateInput);
  }
  if (config.emitBlocks.inputs) {
    eventEmitter.on('InputType', inputType);
  }
  if (config.emitBlocks.args) {
    eventEmitter.on('ArgsType', argsType);
  }
  eventEmitter.on('GenerateFiles', generateFiles);

  // Emitted after connectCallback, so library users can listen to them,
  // or before rethrowing when generation fails earlier
  const warnings = [...config.$warnings];
  let warningsEmitted = false;
  const emitWarnings = () => {
    if (warningsEmitted) {
      return;
    }
    warningsEmitted = true;
    for (const message of warnings) {
      eventEmitter.emitSync('Warning', message);
    }
  };

  const project = new Project({
    manipulationSettings: {
      quoteKind: QuoteKind.Single,
    },
    skipAddingFilesFromTsConfig: true,
    skipLoadingLibFiles: !config.emitCompiled,
    tsConfigFilePath: config.tsConfigFilePath,
  });

  if (!skipAddOutputSourceFiles) {
    project.addSourceFilesAtPaths([
      `${generatorOutputValue}/**/*.ts`,
      `!${generatorOutputValue}/**/*.d.ts`,
    ]);
  }

  if (config.combineScalarFilters) {
    combineScalarFilters(eventEmitter);
  }
  if (config.noAtomicOperations) {
    noAtomicOperations(eventEmitter);
  }
  if (config.reExport !== ReExport.None) {
    reExport(eventEmitter);
  }
  if (config.emitSingle) {
    emitSingle(eventEmitter);
  }
  if (config.purgeOutput) {
    purgeOutput(eventEmitter);
  }
  if (config.requireSingleFieldsInWhereUniqueInput) {
    requireSingleFieldsInWhereUniqueInput(eventEmitter);
  }

  const models = new Map<string, Model>();
  const modelNames: string[] = [];
  const modelFields = new Map<string, Map<string, Field>>();
  const fieldSettings = new Map<string, Map<string, ObjectSettings>>();
  const getModelName = createGetModelName(modelNames);
  const getSourceFile = factoryGetSourceFile({
    eventEmitter,
    getModelName,
    output: generatorOutputValue,
    outputFilePattern: config.outputFilePattern,
    project,
  });
  const { datamodel, schema } = JSON.parse(JSON.stringify(dmmf)) as Document;
  const removeTypes = new Set<string>();
  const prismaClientVersion = getPrismaClientVersion(args.schemaPath);
  if (prismaClientVersion.major === undefined) {
    warnings.push(
      `${prismaClientVersion.reason}, assuming Prisma Client >= 6 (Bytes as Uint8Array)`,
    );
  }
  let enumValueDocumentation: EventArguments['enumValueDocumentation'];
  let customValueEnums: Set<string>;
  try {
    // Parsed once: registerEnum writes members from it, field types depend on it
    enumValueDocumentation = Object.fromEntries(
      datamodel.enums.map(
        enumType =>
          [
            enumType.name,
            extractEnumValueDocumentation(enumType.name, enumType.values),
          ] as const,
      ),
    );
    // Fields of enums with custom `@value(...)` member values are typed by member names
    customValueEnums = new Set(
      Object.entries(enumValueDocumentation)
        .filter(([, documentation]) =>
          Object.values(documentation ?? {}).some(
            member => member?.value !== undefined,
          ),
        )
        .map(([name]) => name),
    );
  } catch (error) {
    emitWarnings();
    throw error;
  }
  const eventArguments: EventArguments = {
    bytesType: getBytesType(prismaClientVersion.major),
    classTransformerTypeModels: new Set(),
    config,
    customValueEnums,
    enums: mapKeys(datamodel.enums, x => x.name),
    enumValueDocumentation,
    eventEmitter,
    fieldSettings,
    getModelName,
    getSourceFile,
    modelFields,
    modelNames,
    models,
    output: generatorOutputValue,
    project,
    removeTypes,
    schema,
    typeNames: new Set<string>(),
  };

  try {
    if (connectCallback) {
      await connectCallback(eventEmitter, eventArguments);
    }
  } finally {
    emitWarnings();
  }

  await eventEmitter.emit('Begin', eventArguments);

  for (const model of datamodel.models) {
    await eventEmitter.emit('Model', model, eventArguments);
  }

  // Types behaves like model
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  for (const model of datamodel.types || []) {
    await eventEmitter.emit('Model', model, eventArguments);
  }

  const { enumTypes, inputObjectTypes, outputObjectTypes } = schema;

  await eventEmitter.emit('PostBegin', eventArguments);

  for (const enumType of enumTypes.prisma.concat(enumTypes.model || [])) {
    await eventEmitter.emit('EnumType', enumType, eventArguments);
  }

  for (const outputType of outputObjectTypes.model) {
    await eventEmitter.emit('ModelOutputType', outputType, eventArguments);
  }

  const queryOutputTypes: OutputType[] = [];

  for (const outputType of outputObjectTypes.prisma) {
    if (['Query', 'Mutation'].includes(outputType.name)) {
      queryOutputTypes.push(outputType);
      continue;
    }
    await eventEmitter.emit('OutputType', outputType, eventArguments);
  }

  const inputTypes = [
    ...(inputObjectTypes.prisma ?? []),
    ...(inputObjectTypes.model ?? []),
  ];

  for (const inputType of inputTypes) {
    const event = {
      ...eventArguments,
      classDecoratorName: 'InputType',
      fileType: 'input',
      inputType,
    };
    if (inputType.fields.length === 0) {
      removeTypes.add(inputType.name);
      continue;
    }
    await eventEmitter.emit('BeforeInputType', event);
    await eventEmitter.emit('InputType', event);
  }

  for (const outputType of queryOutputTypes) {
    for (const field of outputType.fields) {
      await eventEmitter.emit('ArgsType', field, eventArguments);
    }
  }

  await eventEmitter.emit('BeforeGenerateFiles', eventArguments);
  await eventEmitter.emit('GenerateFiles', eventArguments);
  await eventEmitter.emit('End', eventArguments);

  for (const name of Object.keys(eventEmitter._events)) {
    eventEmitter.off(name);
  }
}
