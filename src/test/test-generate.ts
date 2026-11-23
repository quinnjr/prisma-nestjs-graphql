import { GeneratorOptions } from '@prisma/generator-helper';
import { ok } from 'assert';
import AwaitEventEmitter from 'await-event-emitter/types';
import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'graceful-fs';
import { castArray, uniq } from 'lodash';
import os from 'os';
import path from 'path';
import { ImportSpecifierStructure, Project } from 'ts-morph';

import { generate } from '../generate';
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
}) {
  const { createSouceFile, onConnect, options, provider, schema } = args;
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
 * Directory for test schema files and the prisma clients generated next to
 * them. It must be inside the project: prisma resolves `@prisma/client` from
 * the schema directory and tries to install it when it cannot be found.
 */
function prepareSchemaPath(): string {
  const result = process.env.CI
    ? `${process.cwd()}/~prisma-test`
    : path.join(process.cwd(), 'node_modules', '.prisma-nestjs-graphql-test');
  if (!fs.existsSync(result)) {
    fs.mkdirSync(result, { recursive: true });
  }
  return result;
}

/**
 * Directory for the cached generator options files (which are executed) and
 * the generated output.
 */
function prepareCachePath(): string {
  if (process.env.CI) {
    const result = `${process.cwd()}/~prisma-test`;
    if (!fs.existsSync(result)) {
      fs.mkdirSync(result, { recursive: true });
    }
    return result;
  }
  // Cached options files are executed, so keep them in a private per-user
  // directory rather than a shared, world-writable temp location
  const { uid } = os.userInfo();
  const result = path.join(os.tmpdir(), `prisma-nestjs-graphql-test-${String(uid)}`);
  fs.mkdirSync(result, { mode: 0o700, recursive: true });
  const stat = fs.statSync(result);
  if (stat.uid !== uid || (stat.mode & 0o077) !== 0) {
    throw new Error(
      `Test cache directory ${result} must be owned by uid ${String(uid)} and not accessible by others`,
    );
  }
  return result;
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
  // eslint-disable-next-line prefer-rest-params
  const hash = createHash(generatorVersion, schemaHeader, arguments);
  const prismaTestPath = prepareCachePath();
  const cacheFile = `${prismaTestPath}/options-${hash}.js`;
  if (!fs.existsSync(cacheFile)) {
    const schemaFile = `${prepareSchemaPath()}/schema-${hash}.prisma`;
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
