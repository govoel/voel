import { Schema } from 'effect';
import { Rpc } from 'effect/unstable/rpc';

type CursorPage<Success extends Schema.Top, Cursor extends Schema.Top> = Schema.Struct<{
  readonly items: Schema.$Array<Success>;
  readonly nextCursor: Schema.Option<Cursor>;
}>;

interface CursorPaginatedRpc<Cursor extends Schema.Top> extends Rpc.Custom {
  readonly out: Rpc.Custom.Out<CursorPage<this['success'], Cursor>, this['error']>;
}

export const makeCursorPaginated = <
  const Tag extends string,
  Cursor extends Schema.Top,
  Success extends Schema.Top = Schema.Void,
  Error extends Schema.Top = Schema.Never,
>(
  tag: Tag,
  {
    cursor,
    limit: { min = 1, max = 100 } = {},
    ...options
  }: {
    readonly cursor: Cursor;
    readonly limit?: { readonly min?: number; readonly max?: number };
    readonly success?: Success;
    readonly error?: Error;
    readonly defect?: Rpc.DefectSchema;
  }
) =>
  Rpc.custom<CursorPaginatedRpc<Cursor>>((schemas) => ({
    ...schemas,
    success: Schema.Struct({
      items: Schema.Array(schemas.success),
      nextCursor: Schema.Option(cursor),
    }),
  }))(tag, {
    ...options,
    payload: Schema.Struct({
      cursor: Schema.Option(cursor),
      limit: Schema.Int.check(Schema.isBetween({ minimum: min, maximum: max })),
    }),
  });
