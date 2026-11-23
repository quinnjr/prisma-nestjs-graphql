import { GeneratorOptions } from '@prisma/generator-helper';
import { ok } from 'assert';
import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'graceful-fs';
import { castArray, uniq } from 'lodash';
import path from 'path';
import { ImportSpecifierStructure, Project } from 'ts-morph';

import { generate } from '../generate';
import type { AwaitEventEmitter } from '../helpers/await-event-emitter';
import { generateFileName } from '../helpers/generate-file-name';
import { DMMF, EventArguments } from '../types';

const generatorVersion = (
  JSON.parse(fs.readFileSync(`${__dirname}/../../package.json`, 'utf8')) as {
    dependencies: Record<string, string>;
  }
).dependencies['@prisma/generator-helper'];

export async function testGenerate(args: {
  schema: string;
  options?: string[] | string;
  provider?: 'postgresql' | 'mongodb';
  createSouceFile?: {
    text: string;
    name: string;
    type: string;
  };
  onConnect?: (emitter: AwaitEventEmitter) => void;
  /** Override generator options passed to generate(), e.g. schemaPath */
  generatorOptions?: Partial<GeneratorOptions>;
}) {
  const { createSouceFile, generatorOptions, onConnect, options, provider, schema } =
    args;
  let project: Project | undefined;
  const connectCallback = (emitter: AwaitEventEmitter) => {
    if (onConnect) {
      onConnect(emitter);
    }
    if (createSouceFile) {
      emitter.on(
        'PostBegin',
        ({ config, getModelName, output, project }: EventArguments) => {
          const filePath = generateFileName({
            getModelName,
            name: createSouceFile.name,
            template: config.outputFilePattern,
            type: createSouceFile.type,
          });
          project.createSourceFile(`${output}/${filePath}`, createSouceFile.text, {
            overwrite: true,
          });
        },
      );
    }
    emitter.on('End', (args: { project: Project }) => {
      ({ project } = args);
    });
  };
  await generate({
    ...(await createGeneratorOptions(schema, options, provider)),
    ...generatorOptions,
    connectCallback,
    skipAddOutputSourceFiles: true,
  });

  ok(project, 'Project is not defined');
  const sourceFiles = project.getSourceFiles();
  const emptyFieldsFiles: string[] = [];

  for (const sourceFile of sourceFiles) {
    const filePath = sourceFile.getFilePath();
    const text = sourceFile.getText();
    if (!text) {
      let message = `Project should not contain empty files: ${filePath}`;
      const fileLower = sourceFile
        .getBaseNameWithoutExtension()
        .replaceAll('-', '')
        .split('.')[0];
      const sources = sourceFiles.filter(s =>
        s
          .getClass(() => true)
          ?.getProperties()
          .find(p => String(p.getStructure().type).toLowerCase().includes(fileLower)),
      );
      if (sources.length > 0) {
        message += `, reference: ${sources.map(s => s.getBaseName()).join(', ')}`;
      }
      throw new Error(message);
    }
    const imports = sourceFile
      .getImportDeclarations()
      .map(d => d.getStructure())
      .flatMap(s => {
        return [
          ...((s.namedImports || []) as ImportSpecifierStructure[]).map(x => x.name),
          s.namespaceImport,
        ].filter(Boolean);
      });
    if (uniq(imports).length !== imports.length) {
      throw new Error(`Duplicated import in ${filePath}: ${imports.toString()}`);
    }
    // Find classes without @Field() (must define one or more fields)
    const properties = sourceFile.getClass(() => true)?.getProperties();
    if (properties && !properties.some(p => p.getDecorator('Field'))) {
      emptyFieldsFiles.push(sourceFile.getBaseName());
    }
  }
  if (emptyFieldsFiles.length > 0) {
    throw new Error(`No defined fields in ${emptyFieldsFiles.join(', ')}`);
  }

  return { project, sourceFiles };
}

/**
 * Directory for test schema files, the prisma clients generated next to them
 * and the cached generator options (which are executed). It is inside the
 * project, so it is private to the checkout: prisma resolves `@prisma/client`
 * from the schema directory, and no shared temp directory is involved.
 */
function prepareTestPath(): string {
  const result = process.env.CI
    ? path.join(process.cwd(), '~prisma-test')
    : path.join(process.cwd(), 'node_modules', '.prisma-nestjs-graphql-test');
  fs.mkdirSync(result, { recursive: true });
  return result;
}

/** Installed version of a package, part of the cache key */
function installedVersion(name: string): string {
  const packageJsonPath = require.resolve(`${name}/package.json`, {
    paths: [process.cwd()],
  });
  return (JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { version: string })
    .version;
}

/**
 * Get generator options after run prisma generate.
 */
async function createGeneratorOptions(
  schema: string,
  options?: string[] | string,
  provider: 'postgresql' | 'mongodb' = 'postgresql',
  previewFeatures: string[] = [],
): Promise<GeneratorOptions & { prismaClientDmmf: DMMF.Document }> {
  const schemaHeader = `
        datasource db {
            provider = "${provider}"
            url = env("DATABASE_URL")
        }
        generator client {
            provider        = "prisma-client-js"
            // Keep test clients out of node_modules, so the project client
            // generated from prisma/schema.prisma is not overwritten
            output          = "./client"
            previewFeatures = ${JSON.stringify(previewFeatures)}
        }
    `;

  const hash = createHash(
    generatorVersion,
    installedVersion('prisma'),
    installedVersion('@prisma/client'),
    schemaHeader,
    schema,
    options,
    provider,
    previewFeatures,
  );
  const prismaTestPath = prepareTestPath();
  const cacheFile = `${prismaTestPath}/options-${hash}.js`;
  if (!fs.existsSync(cacheFile)) {
    const schemaFile = `${prismaTestPath}/schema-${hash}.prisma`;
    const schemaContent = `
            ${schemaHeader}
            generator proxy {
                provider = "node -r ts-node/register/transpile-only src/test/proxy-generator.ts"
                output = ${JSON.stringify(prismaTestPath)}
                hash = "${hash}"
                ${castArray(options).join('\n')}
            }
            ${schema}
        `;
    fs.writeFileSync(schemaFile, schemaContent);

    await new Promise((resolve, reject) => {
      const proc = execFile('node', [
        'node_modules/prisma/build/index.js',
        'generate',
        `--schema=${schemaFile}`,
      ]);
      if (!proc.stderr) {
        throw new Error('Generate error');
      }
      proc.stdout?.pipe(process.stdout);
      proc.stderr.pipe(process.stdout);
      proc.on('error', reject);
      proc.on('exit', (code, signal) => {
        if (code === 0) {
          resolve(0);
        } else {
          reject(
            new Error(
              `prisma generate for ${schemaFile} exited with code ${String(code)} signal ${String(signal)}`,
            ),
          );
        }
      });
    });
  }

  // Not `await import(pathToFileURL(cacheFile).href)`: under ts-node commonjs,
  // import() compiles to require(), which cannot resolve file:// URLs
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- cache file is a generated CommonJS module
  return require(cacheFile) as GeneratorOptions & {
    prismaClientDmmf: DMMF.Document;
  };
}

function createHash(...data: unknown[]) {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
}
