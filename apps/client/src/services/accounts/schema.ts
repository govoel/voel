import { Schema } from 'effect';

/** A root HTTP(S) server address. Validation preserves existing account/storage keys. */
export const ServerUrl = Schema.String.check(
  Schema.makeFilter((value) => {
    if (!/^https?:\/\/[^/?#@\\\s]+\/?$/iu.test(value) || !URL.canParse(value)) {
      return 'Server URL must be an HTTP(S) origin without a path, query, or fragment';
    }
    const url = new URL(value);
    return (
      (url.username === '' && url.password === '' && url.pathname === '/') ||
      'Server URL must not contain credentials, whitespace, or a path'
    );
  })
).pipe(Schema.brand('voel/services/accounts/schema/ServerUrl'));
