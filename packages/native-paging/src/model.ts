import { Schema } from 'effect';

const NativeInt = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2_147_483_647 }));

/** Offset pagination parameters, independent of the native request protocol. */
export class PageRequest extends Schema.Struct({
  offset: NativeInt,
  limit: NativeInt.check(Schema.isGreaterThan(0)),
}) {}

export interface PageResponse<Value> {
  readonly items: ReadonlyArray<{ readonly id: string; readonly value: Value }>;
  readonly total: number;
}

export class PagingOptions extends Schema.Struct({
  pageSize: NativeInt.check(Schema.isGreaterThan(0)),
  maxResidentItems: NativeInt.check(Schema.isGreaterThan(0)),
}).check(
  Schema.makeFilter(
    ({ pageSize, maxResidentItems }) =>
      maxResidentItems >= 3 * pageSize ||
      'maxResidentItems must cover a page and both default page-sized prefetch windows'
  )
) {}
