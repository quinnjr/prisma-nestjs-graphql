import JSON5 from 'json5';
import { isObject, merge, omit } from 'lodash';
import { PlainObject } from 'simplytyped';

import { GeneratorConfiguration } from '../types';
import { createSettingElement } from './create-setting-element';

export type ObjectSetting = {
  /**
   * Act as named import or namespaceImport or defaultImport
   */
  name: string;
  kind: 'Decorator' | 'Field' | 'FieldType' | 'PropertyType' | 'ObjectType';
  arguments?: string[] | Record<string, unknown>;
  input: boolean;
  output: boolean;
  model: boolean;
  match?: (test: string) => boolean;
  from: string;
  namespace?: string;
  defaultImport?: string | true;
  namespaceImport?: string;
  namedImport?: boolean;
};

interface ObjectSettingsFilterArgs {
  name: string;
  input?: boolean;
  output?: boolean;
}

export class ObjectSettings extends Array<ObjectSetting> {
  shouldHideField({
    input = false,
    name,
    output = false,
  }: ObjectSettingsFilterArgs): boolean {
    const hideField = this.find(s => s.name === 'HideField');

    return Boolean(
      (hideField?.input && input) ||
      (hideField?.output && output) ||
      hideField?.match?.(name),
    );
  }

  getFieldType({
    input,
    name,
    output,
  }: ObjectSettingsFilterArgs): ObjectSetting | undefined {
    const fieldType = this.find(s => s.kind === 'FieldType');

    if (!fieldType) {
      return undefined;
    }

    if (fieldType.match) {
      return fieldType.match(name) ? fieldType : undefined;
    }

    if (input && !fieldType.input) {
      return undefined;
    }

    if (output && !fieldType.output) {
      return undefined;
    }

    return fieldType;
  }

  getPropertyType({
    input,
    name,
    output,
  }: ObjectSettingsFilterArgs): ObjectSetting | undefined {
    const propertyType = this.find(s => s.kind === 'PropertyType');

    if (!propertyType) {
      return undefined;
    }

    if (propertyType.match) {
      return propertyType.match(name) ? propertyType : undefined;
    }

    if (input && !propertyType.input) {
      return undefined;
    }

    if (output && !propertyType.output) {
      return undefined;
    }

    return propertyType;
  }

  getObjectTypeArguments(options: Record<string, unknown>): string[] {
    const objectTypeOptions = merge({}, options);
    const resultArguments: unknown[] = [objectTypeOptions];
    const objectType = this.find(s => s.kind === 'ObjectType');
    if (objectType && isObject(objectType.arguments)) {
      const name: unknown = (objectType.arguments as PlainObject).name;
      merge(objectTypeOptions, omit(objectType.arguments, 'name'));
      if (name) {
        resultArguments.unshift(name);
      }
    }
    return resultArguments.map(x => JSON5.stringify(x));
  }

  fieldArguments(): Record<string, unknown> | undefined {
    const item = this.find(item => item.kind === 'Field');
    if (item) {
      return item.arguments as Record<string, unknown>;
    }
  }
}

export function createObjectSettings(args: {
  text: string;
  config: GeneratorConfiguration;
}) {
  const { config, text } = args;
  const result = new ObjectSettings();
  const textLines = text.split('\n');
  const documentationLines: string[] = [];

  let fieldElement = result.find(item => item.kind === 'Field');
  if (!fieldElement) {
    fieldElement = {
      arguments: {},
      kind: 'Field',
      name: '',
    } as ObjectSetting;
  }

  for (const line of textLines) {
    const match = /^@(?<name>\w+(\.(\w+))?)\((?<args>.*)\)/.exec(line);
    const { documentLine, element } = createSettingElement({
      config,
      fieldElement,
      line,
      match,
    });

    if (element) {
      result.push(element);
    }

    if (documentLine) {
      documentationLines.push(line);
    }
  }

  return {
    documentation: documentationLines.filter(Boolean).join('\n') || undefined,
    settings: result,
  };
}
