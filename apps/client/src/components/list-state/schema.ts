import { Predicate, Schema } from 'effect';

export const ListStateProps = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('loading'),
  }),
  Schema.Struct({
    kind: Schema.Literal('empty'),
    message: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal('message'),
    message: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal('error'),
    message: Schema.String,
    onRetry: Schema.declare((value): value is () => void => Predicate.isFunction(value)),
    retrying: Schema.Boolean,
  }),
]).pipe(Schema.toTaggedUnion('kind'));
