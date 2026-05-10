import { Schema } from 'effect';
import { Rpc } from 'effect/unstable/rpc';
import type {
  DefectSchema,
  Custom as RpcCustom,
  Rpc as RpcEndpoint,
} from 'effect/unstable/rpc/Rpc';

export type CursorPayload<Cursor extends Schema.Top> = Schema.Struct<{
  readonly cursor: Schema.Option<Cursor>;
  readonly limit: typeof Schema.Int;
}>;

export type CursorPage<Success extends Schema.Top, Cursor extends Schema.Top> = Schema.Struct<{
  readonly items: Schema.$Array<Success>;
  readonly nextCursor: Schema.Option<Cursor>;
}>;

interface CursorPaginatedRpc<Cursor extends Schema.Top> extends RpcCustom {
  readonly out: RpcCustom.Out<CursorPage<this['success'], Cursor>, this['error']>;
}

interface CursorPaginatedOptions<Success extends Schema.Top, Error extends Schema.Top> {
  readonly success?: Success;
  readonly error?: Error;
  readonly defect?: DefectSchema;
}

interface CursorPaginatedConfig {
  readonly minimum?: number;
  readonly maximum?: number;
}

export const makeCursorPaginated =
  <Cursor extends Schema.Top>(
    cursor: Cursor,
    { minimum = 1, maximum = 100 }: CursorPaginatedConfig = {}
  ) =>
  <
    const Tag extends string,
    Success extends Schema.Top = Schema.Void,
    Error extends Schema.Top = Schema.Never,
  >(
    tag: Tag,
    options?: CursorPaginatedOptions<Success, Error>
  ): RpcEndpoint<Tag, CursorPayload<Cursor>, CursorPage<Success, Cursor>, Error> =>
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
        limit: Schema.Int.check(Schema.isBetween({ minimum, maximum })),
      }),
    });
