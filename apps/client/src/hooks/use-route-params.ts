import { Schema } from 'effect';
import { useLocalSearchParams } from 'expo-router';

export const useRouteParams = <S extends Schema.ConstraintDecoder<unknown>>(schema: S) => {
  const params = useLocalSearchParams();
  return Schema.decodeResult(schema)(params);
};
