export type EnumValueLiteral = string | number;

export type EnumValueDocumentation = {
  description?: string;
  deprecationReason?: string;
  /** Custom TypeScript enum member value taken from the comment. */
  value?: EnumValueLiteral;
};

const numberPattern = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const doubleQuotedPattern = /^"(?:[^"\\]|\\.)*"$/;
const singleQuotedPattern = /^'(?:[^'\\]|\\.)*'$/;
// Argument is a sequence of quoted strings or characters other than quotes and `)`,
// so `)` is allowed inside a quoted value
const valueDirectivePattern =
  /@value\(((?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^"')])*)\)/;

/**
 * Parse a string or number literal written in a comment.
 * Returns undefined when the text is not a literal.
 */
export function parseEnumValueLiteral(text: string): EnumValueLiteral | undefined {
  const source = text.trim();

  if (numberPattern.test(source)) {
    return Number(source);
  }
  if (doubleQuotedPattern.test(source)) {
    return JSON.parse(source) as string;
  }
  if (singleQuotedPattern.test(source)) {
    const inner = source
      .slice(1, -1)
      .replaceAll(String.raw`\'`, "'")
      .replaceAll(/(?<!\\)"/g, String.raw`\"`);
    return JSON.parse(`"${inner}"`) as string;
  }

  return undefined;
}

/**
 * Extract graphql enum value metadata and custom TypeScript values
 * from triple-slash comments of prisma enum values.
 *
 * A custom value is set either with `@value("text")` / `@value(1)` anywhere
 * in the comment, or by a comment that consists only of a string or number literal.
 */
export function extractEnumValueDocumentation(
  values: readonly { name: string; [key: string]: unknown }[],
): Record<string, EnumValueDocumentation> {
  return Object.fromEntries(
    values
      .map((value): [string, EnumValueDocumentation] | null => {
        const { name } = value;
        const documentation: unknown = value.documentation;

        if (typeof documentation !== 'string') {
          return null;
        }

        const result: EnumValueDocumentation = {};
        let text = documentation;

        const directive = valueDirectivePattern.exec(text);
        if (directive) {
          const literal = parseEnumValueLiteral(directive[1]);
          if (literal === undefined) {
            throw new Error(
              `Invalid @value(${directive[1]}) for enum value ${name}, expected a string or number literal`,
            );
          }
          result.value = literal;
          text = text.replace(directive[0], '');
        } else {
          const literal = parseEnumValueLiteral(text);
          if (literal !== undefined) {
            result.value = literal;
            text = '';
          }
        }

        text = text
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
          .join('\n');

        if (text.startsWith('@deprecated')) {
          result.deprecationReason = text.slice(11).trim();
        } else if (text) {
          result.description = text;
        }

        return [name, result];
      })
      .filter((entry): entry is [string, EnumValueDocumentation] => entry !== null),
  );
}
