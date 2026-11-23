import expect from 'expect';
import { Project } from 'ts-morph';

import { formatDiagnostic } from '../handlers/generate-files';
import { testGenerate } from './test-generate';

describe('emit compiled', () => {
  let warnings: string[];

  before(async () => {
    warnings = [];
    await testGenerate({
      // A private member of an exported class expression cannot be described in
      // a declaration file, so declaration emit reports TS4094 for this file
      createSouceFile: {
        name: 'broken',
        text: `export const Broken = class { private hidden = 1; };`,
        type: 'helper',
      },
      onConnect(emitter) {
        emitter.on('Warning', (message: string | string[]) => {
          warnings.push(...([] as string[]).concat(message));
        });
      },
      options: [`emitCompiled = true`, `outputFilePattern = "{name}.{type}.ts"`],
      schema: `
        model User {
          id Int @id
        }
      `,
    });
  });

  it('warns with the file path, line and message of emit diagnostics', () => {
    const warning = warnings.find(w => w.includes('broken.helper.ts'));
    expect(warning).toBeDefined();
    expect(warning).toMatch(/[/\\]broken\.helper\.ts:1: /);
    expect(warning).toContain(
      "Property 'hidden' of exported class expression may not be private or protected.",
    );
  });
});

describe('formatDiagnostic', () => {
  it('flattens nested message chains and includes the location', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/src/chain.ts',
      [
        `declare const source: { a: { b: string } };`,
        `export const target: { a: { b: number } } = source;`,
      ].join('\n'),
    );
    const diagnostic = project.getPreEmitDiagnostics().find(d => d.getCode() === 2322);
    expect(diagnostic).toBeDefined();
    // Precondition: the compiler reports this error as a message chain
    expect(typeof diagnostic!.getMessageText()).not.toEqual('string');

    const result = formatDiagnostic(diagnostic!);

    expect(result).toMatch(/^\/src\/chain\.ts:2: /);
    expect(result).toContain(
      `The types of 'a.b' are incompatible between these types.`,
    );
    expect(result).toContain(`Type 'string' is not assignable to type 'number'.`);
  });

  it('returns only the message for diagnostics without a source file', () => {
    const project = new Project({
      compilerOptions: { types: ['does-not-exist'] },
      useInMemoryFileSystem: true,
    });
    project.createSourceFile('/src/a.ts', `export const a = 1;`);
    const diagnostic = project
      .getPreEmitDiagnostics()
      .find(d => d.getSourceFile() === undefined);
    expect(diagnostic).toBeDefined();

    expect(formatDiagnostic(diagnostic!)).toContain('does-not-exist');
  });
});
