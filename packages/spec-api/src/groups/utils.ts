import { Schema } from 'effect';
import { Rpc } from 'effect/unstable/rpc';
import type { Custom as RpcCustom } from 'effect/unstable/rpc/Rpc';

export type CursorPage<Success extends Schema.Top, Cursor extends Schema.Top> = Schema.Struct<{
  readonly items: Schema.$Array<Success>;
  readonly nextCursor: Schema.Option<Cursor>;
}>;

interface CursorPaginatedRpc<Cursor extends Schema.Top> extends RpcCustom {
  readonly out: RpcCustom.Out<CursorPage<this['success'], Cursor>, this['error']>;
}

type CursorPaginatedConstructor<Cursor extends Schema.Top> = ReturnType<
  typeof Rpc.custom<CursorPaginatedRpc<Cursor>>
>;

export const makeCursorPaginated = <Cursor extends Schema.Top>(
  cursor: Cursor
): CursorPaginatedConstructor<Cursor> =>
  Rpc.custom<CursorPaginatedRpc<Cursor>>((schemas) => ({
    ...schemas,
    success: Schema.Struct({
      items: Schema.Array(schemas.success),
      nextCursor: Schema.Option(cursor),
    }),
  }));
