import { Result, Schema } from 'effect';
import { useLocalSearchParams } from 'expo-router';

export class InvalidRouteParamsError extends Schema.TaggedError<
  InvalidRouteParamsError,
  { readonly brand: unique symbol }
>('voel/hooks/use-route-params/InvalidRouteParamsError')('InvalidRouteParamsError', {
  cause: Schema.instanceOf(Schema.SchemaError),
}) {
  public static readonly is = Schema.is(this);
  public override readonly message = 'This link is invalid.';
}

export const useRouteParams = <S extends Schema.ConstraintDecoder<unknown>>(schema: S) => {
  const params = useLocalSearchParams();
  return Result.getOrThrowWith(Schema.decodeResult(schema)(params), (cause) =>
    InvalidRouteParamsError.make({ cause })
  );
};
