import { describe, expect, it } from 'vitest';

import { getBytesType } from './get-bytes-type';
import { getPropertyType } from './get-property-type';

describe('getBytesType', () => {
  it('Buffer for Prisma 5', () => {
    expect(getBytesType(5)).toEqual('Buffer');
  });

  it('Uint8Array like Prisma.Bytes for Prisma 6', () => {
    expect(getBytesType(6)).toEqual("ReturnType<Uint8Array['slice']>");
  });

  it('latest type when version is unknown', () => {
    expect(getBytesType(undefined)).toEqual("ReturnType<Uint8Array['slice']>");
  });
});

describe('getPropertyType Bytes', () => {
  it('uses detected bytes type', () => {
    expect(
      getPropertyType({
        bytesType: 'Buffer',
        customValueEnums: new Set(),
        location: 'scalar',
        type: 'Bytes',
      }),
    ).toEqual(['Buffer']);
  });
});
