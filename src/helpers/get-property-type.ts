import { FieldLocation } from '../types';

/**
 * Returns typescript property type.
 */
export function getPropertyType(args: {
  type: string;
  location: FieldLocation;
}): string[] {
  const { location, type } = args;
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
      // Same as Prisma.Bytes: Uint8Array<ArrayBuffer> on TS >= 5.7, Uint8Array before
      return ["ReturnType<Uint8Array['slice']>"];
    }
    case 'BigInt': {
      return ['bigint', 'number'];
    }
  }
  if (['inputObjectTypes', 'outputObjectTypes'].includes(location)) {
    return [type];
  }
  if (location === 'enumTypes') {
    const enumType = '`${' + type + '}`';

    return [enumType];
  }
  if (location === 'scalar') {
    return [type];
  }

  return ['unknown'];
}
