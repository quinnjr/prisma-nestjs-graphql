import { partition } from 'lodash';
import { PropertyDeclarationStructure } from 'ts-morph';

import type { AwaitEventEmitter } from '../helpers/await-event-emitter';
import { DMMF } from '../types';

export function emitSingle(emitter: AwaitEventEmitter) {
  emitter.on('ClassProperty', classProperty);
}

function classProperty(
  property: PropertyDeclarationStructure,
  eventArguments: {
    location: DMMF.FieldLocation;
    isList: boolean;
    propertyType: string[];
  },
) {
  const { isList, location, propertyType } = eventArguments;
  if (['inputObjectTypes', 'outputObjectTypes'].includes(location) && !isList) {
    const [safeTypes, instanceofTypes] = partition(
      propertyType,
      t => t === 'null' || t.startsWith('Prisma.'),
    );
    const mappedInstanceofTypes = instanceofTypes.map(t => `InstanceType<typeof ${t}>`);

    property.type = [...mappedInstanceofTypes, ...safeTypes].join(' | ');
  }
}
