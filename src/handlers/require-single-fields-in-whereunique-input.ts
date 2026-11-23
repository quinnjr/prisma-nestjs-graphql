import AwaitEventEmitter from 'await-event-emitter';

import { isWhereUniqueInputType } from '../helpers/is-where-unique-input-type';
import { EventArguments, InputType } from '../types';

export function requireSingleFieldsInWhereUniqueInput(eventEmitter: AwaitEventEmitter) {
  eventEmitter.on('BeforeInputType', beforeInputType);
}

/**
 * Since Prisma 5 a `*WhereUniqueInput` also contains AND/OR/NOT and all
 * filter fields, the unique fields are listed in `constraints.fields`.
 * When there is exactly one unique field, make it required.
 */
function beforeInputType(args: EventArguments & { inputType: InputType }) {
  const { inputType } = args;

  if (!isWhereUniqueInputType(inputType.name)) {
    return;
  }

  const uniqueFields = inputType.constraints.fields ?? [];
  if (uniqueFields.length !== 1) {
    return;
  }

  for (const field of inputType.fields) {
    if (uniqueFields.includes(field.name)) {
      field.isRequired = true;
      field.isNullable = false;
    }
  }
}
