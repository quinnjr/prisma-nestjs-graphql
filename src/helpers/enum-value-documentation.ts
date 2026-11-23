import JSON5 from 'json5';

import { stripTag } from './strip-tag';

export type EnumValueDocumentation = {
  description?: string;
  deprecationReason?: string;
  /** Custom TypeScript enum member value from `@value(...)` */
  value?: string | number;
};

/** A comment line that starts with `@value` (any case) is a value directive */
const directiveStartPattern = /^@value\b/i;
/** A valid directive: the whole line is `@value(<argument>)` */
const directivePattern = /^@value\((.*)\)$/;

/**
 * Extract graphql enum value metadata (description, deprecationReason)
 * and custom TypeScript member values from triple-slash comments
 * of prisma enum values.
 */
export function extractEnumValueDocumentation(
  enumName: string,
  values: readonly { name: string; [key: string]: unknown }[],
): Partial<Record<string, EnumValueDocumentation>> {
  const result: Partial<Record<string, EnumValueDocumentation>> = {};

  for (const { documentation, name } of values) {
    if (typeof documentation === 'string') {
      result[name] = parseEnumValueDocumentation(`${enumName}.${name}`, documentation);
    }
  }

  return result;
}

/**
 * A line starting with `@value` sets the member value and must be
 * `@value("text")` or `@value(number)`. Other lines are kept as is.
 */
function parseEnumValueDocumentation(
  memberName: string,
  documentation: string,
): EnumValueDocumentation {
  const result: EnumValueDocumentation = {};
  const textLines: string[] = [];
  let hasValue = false;

  for (const line of documentation.split('\n')) {
    const trimmedLine = line.trim();
    if (!directiveStartPattern.test(trimmedLine)) {
      textLines.push(line);
      continue;
    }
    if (hasValue) {
      throw new Error(`Multiple @value directives for enum value ${memberName}`);
    }
    result.value = parseDirective(memberName, trimmedLine);
    hasValue = true;
  }

  const text = (hasValue ? textLines.join('\n').trim() : documentation) || undefined;
  if (text === undefined) {
    return result;
  }

  const deprecationReason = stripTag(text, '@deprecated');
  if (deprecationReason === undefined) {
    result.description = text;
  } else {
    result.deprecationReason = deprecationReason;
  }

  return result;
}

function parseDirective(memberName: string, line: string): string | number {
  const argument = directivePattern.exec(line)?.[1];
  const value = argument === undefined ? undefined : parseLiteral(argument);

  if (value === undefined) {
    throw new Error(
      `Invalid @value directive for enum value ${memberName}: ${line}. ` +
        `Expected @value("text") or @value(number)`,
    );
  }

  return value;
}

/**
 * Parse a string or finite number literal (JSON5 syntax, single or double quotes).
 * Returns undefined for anything else, including unsafe integers.
 */
function parseLiteral(text: string): string | number | undefined {
  let value: unknown;
  try {
    value = JSON5.parse(text);
  } catch {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (!Number.isInteger(value) || Number.isSafeInteger(value))
  ) {
    return value;
  }

  return undefined;
}
