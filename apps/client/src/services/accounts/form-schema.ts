import { Redacted, Schema, SchemaGetter } from 'effect';

// Validate with the operation's password schema before redacting; never encode secrets.
const redactedPassword = Schema.Redacted(Schema.String, { disallowJsonEncode: true });
export const redactPassword = <S extends Schema.ConstraintDecoder<string>>(schema: S) =>
  Schema.decodeTo<typeof redactedPassword, S>(redactedPassword, {
    decode: SchemaGetter.transform((password) => Redacted.make(password)),
    encode: SchemaGetter.forbidden(() => 'Cannot encode password'),
  })(schema);

export const passwordsMatch = Schema.makeFilter(
  (value: { readonly newPassword: string; readonly confirmPassword: string }) =>
    value.newPassword === value.confirmPassword || 'Passwords must match'
);
