import { Schema } from 'effect';

export const ServerUrl = Schema.URLFromString.check(
  Schema.makeFilter((u) =>
    u.protocol === 'http' || u.protocol === 'https' ? true : 'Expected an http or https URL'
  ),
  Schema.makeFilter((u) =>
    u.username.length === 0 && u.password.length === 0
      ? true
      : 'Expected URL without username and password'
  ),
  Schema.makeFilter((u) =>
    u.search.length === 0 ? true : 'Expected URL without query parameters'
  ),
  Schema.makeFilter((u) => (u.hash.length === 0 ? true : 'Expected URL without hash'))
).pipe(Schema.brand('ServerUrl'));
export type ServerUrl = typeof ServerUrl.Type;

export const encode = Schema.encodeSync(ServerUrl);

export const key = (serverUrl: ServerUrl): string =>
  encodeURIComponent(encode(serverUrl)).replaceAll('%', '_').toLowerCase();
