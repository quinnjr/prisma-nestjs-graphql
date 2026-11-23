import type AwaitEventEmitterType from 'await-event-emitter';

/**
 * Runtime class of `await-event-emitter`.
 * Bundled output (pkgroll) maps a default import of this CommonJS module
 * to the whole module object, so the class has to be read from `.default`.
 * Construct emitters through this export, never through a default import.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const { default: AwaitEventEmitter } = require('await-event-emitter') as {
  default: typeof AwaitEventEmitterType;
};

export type AwaitEventEmitter = AwaitEventEmitterType;
