import { FieldLocation } from '../types';

/**
 * Returns typescript property type.
 */
export function getPropertyType(args: {
  type: string;
  location: FieldLocation;
  /** TypeScript type of Prisma Bytes fields, see getBytesType() */
  bytesType: string;
  /** Enums with custom `@value(...)` member values */
  customValueEnums: ReadonlySet<string>;
}): string[] {
  const { bytesType, customValueEnums, location, type } = args;
  switch (type) {
    case 'Float':
    case 'Int': {
      return ['number'];
    }
    case 'String': {
      return ['string'];
    }
    case 'Boolean': {
      return ['boolean'];
    }
    case 'DateTime': {
      return ['Date', 'string'];
    }
    case 'Decimal': {
      return ['Decimal'];
    }
    case 'Json': {
      return ['any'];
    }
    case 'Null': {
      return ['null'];
    }
    case 'Bytes': {
      return [bytesType];
    }
    case 'BigInt': {
      return ['bigint', 'number'];
    }
  }
  if (['inputObjectTypes', 'outputObjectTypes'].includes(location)) {
    return [type];
  }
  if (location === 'enumTypes') {
    // Prisma reads and writes enums by member name. Values of a plain enum
    // are its names, a custom-valued enum needs the names explicitly.
    const enumType = customValueEnums.has(type)
      ? `keyof typeof ${type}`
      : '`${' + type + '}`';

    return [enumType];
  }
  if (location === 'scalar') {
    return [type];
  }

  return ['unknown'];
}
