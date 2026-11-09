declare module 'bncode' {
  import { Duplex } from 'node:stream';

  export function encode(data: unknown): string;
  export function decode(data: Buffer | string): unknown;
  export class Stream extends Duplex {}
}

declare module 'buffers' {
  interface BuffersInstance {
    push(...buffers: Buffer[]): number;
    toBuffer(): Buffer;
  }
  function Buffers(bufs?: Buffer[]): BuffersInstance;
  export = Buffers;
}

declare module 'memorystream' {
  import { Duplex } from 'node:stream';

  class MemoryStream extends Duplex {
    readable: boolean;
  }
  export = MemoryStream;
}

declare module 'ordered-emitter' {
  import { EventEmitter } from 'node:events';

  class OrderedEmitter extends EventEmitter {}
  export = OrderedEmitter;
}

declare module 'async' {
  export function parallel(
    tasks: Array<(callback: (err?: Error | null) => void) => void>,
    callback: (err?: Error | null) => void,
  ): void;
}

declare module 'chai' {
  interface Assertion {
    to: Assertion;
    be: Assertion;
    not: Assertion;
    have: Assertion;
    deep: Assertion;
    true: Assertion;
    false: Assertion;
    null: Assertion;
    undefined: Assertion;
    equal(value: unknown): Assertion;
    a(type: string): Assertion;
    an(type: string): Assertion;
    greaterThan(value: number): Assertion;
    property(name: string): Assertion;
    contain(value: string): Assertion;
  }
  export function expect(value: unknown): Assertion;
}
