import JSON5 from 'json5';
import { isObject, merge, trim } from 'lodash';
import outmatch from 'outmatch';

import { GeneratorConfiguration } from '../types';
import type { ObjectSetting } from './object-settings';
import { stripTag } from './strip-tag';

/**
 * Parse one line of a triple-slash comment into a setting element
 * (decorator, field options, custom types, etc.)
 */
export function createSettingElement({
  config,
  fieldElement,
  line,
  match,
}: {
  line: string;
  config: GeneratorConfiguration;
  fieldElement: ObjectSetting;
  match: RegExpExecArray | null;
}) {
  const result = {
    documentLine: '',
    element: undefined as ObjectSetting | undefined,
  };
  const deprecationReason = stripTag(line, '@deprecated');
  if (deprecationReason !== undefined) {
    fieldElement.arguments!['deprecationReason'] = deprecationReason;

    result.element = fieldElement;

    return result;
  }

  const complexityText = stripTag(line, '@complexity');
  if (complexityText !== undefined) {
    let complexity = Number.parseInt(complexityText);
    if (Number.isNaN(complexity) || complexity < 1) {
      complexity = 1;
    }
    fieldElement.arguments!['complexity'] = complexity;

    result.element = fieldElement;

    return result;
  }

  const name = match?.groups?.name;

  if (!(match && name)) {
    result.documentLine = line;
    return result;
  }

  const element: ObjectSetting = {
    arguments: [],
    from: '',
    input: false,
    kind: 'Decorator',
    model: false,
    name: '',
    output: false,
  };

  result.element = element;

  if (name === 'TypeGraphQL.omit' || name === 'HideField') {
    Object.assign(element, hideFieldDecorator(match));

    return result;
  }

  if (['FieldType', 'PropertyType'].includes(name) && match.groups?.args) {
    const options = customType(match.groups.args);
    merge(element, options.namespace && config.fields[options.namespace], options, {
      kind: name,
    });
    return result;
  }

  if (name === 'ObjectType' && match.groups?.args) {
    element.kind = 'ObjectType';
    const options = customType(match.groups.args) as Record<string, unknown>;
    if (typeof options[0] === 'string' && options[0]) {
      options.name = options[0];
    }
    if (isObject(options[1])) {
      merge(options, options[1]);
    }
    element.arguments = {
      isAbstract: options.isAbstract,
      name: options.name,
    };

    return result;
  }

  if (name === 'Directive' && match.groups?.args) {
    const options = customType(match.groups.args);
    merge(element, { from: '@nestjs/graphql', model: true }, options, {
      arguments: Array.isArray(options.arguments)
        ? options.arguments.map(s => JSON5.stringify(s))
        : options.arguments,
      kind: 'Decorator',
      name,
      namespace: false,
    });

    return result;
  }

  const namespace = getNamespace(name);
  element.namespaceImport = namespace;
  const options = {
    arguments: (match.groups?.args || '')
      .split(',')
      .map(s => trim(s))
      .filter(Boolean),
    name,
  };
  merge(element, namespace && config.fields[namespace], options);

  return result;
}

function customType(args: string) {
  const result: Partial<ObjectSetting> = {};
  let options = parseArgs(args);
  if (typeof options === 'string') {
    options = { name: options };
  }
  Object.assign(result, options);
  const namespace = getNamespace(options.name);
  result.namespace = namespace;
  if ((options as { name: string | undefined }).name?.includes('.')) {
    result.namespaceImport = namespace;
  }

  if (typeof options.match === 'string' || Array.isArray(options.match)) {
    result.match = outmatch(options.match, { separator: false });
  }

  return result;
}

function hideFieldDecorator(match: RegExpExecArray) {
  const result: Partial<ObjectSetting> = {
    arguments: [],
    defaultImport: undefined,
    from: '@nestjs/graphql',
    match: undefined,
    name: 'HideField',
    namespaceImport: undefined,
  };
  if (!match.groups?.args) {
    result.output = true;
    return result;
  }

  if (match.groups.args.includes('{') && match.groups.args.includes('}')) {
    const options = parseArgs(match.groups.args) as Record<string, unknown>;
    result.output = Boolean(options.output);
    result.input = Boolean(options.input);
    if (typeof options.match === 'string' || Array.isArray(options.match)) {
      result.match = outmatch(options.match, { separator: false });
    }
  } else {
    if (/output:\s*true/.test(match.groups.args)) {
      result.output = true;
    }
    if (/input:\s*true/.test(match.groups.args)) {
      result.input = true;
    }
  }

  return result;
}

function parseArgs(string: string): Record<string, unknown> | string {
  try {
    return JSON5.parse(string);
  } catch {
    try {
      return JSON5.parse(`[${string}]`);
    } catch {
      throw new Error(`Failed to parse: ${string}`);
    }
  }
}

function getNamespace(name: unknown): string | undefined {
  if (typeof name !== 'string') {
    return undefined;
  }
  let result = name;
  if (result.includes('.')) {
    [result] = result.split('.');
  }

  return result;
}
