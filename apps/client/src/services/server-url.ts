import { Effect, Option, Schema, SchemaIssue, SchemaTransformation } from 'effect';

const formatUrl = (url: URL): string => {
  const pathname = url.pathname.replace(/\/+$/u, '');
  return `${url.protocol}//${url.host}${pathname === '/' ? '' : pathname}`;
};

const parseServerUrl = (value: string) => {
  try {
    const url = new URL(value.trim());

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return Effect.fail(
        new SchemaIssue.InvalidValue(Option.some(value), {
          message: 'Expected an http or https URL',
        })
      );
    }

    return Effect.succeed(new URL(formatUrl(url)));
  } catch {
    return Effect.fail(
      new SchemaIssue.InvalidValue(Option.some(value), {
        message: 'Expected a valid server URL',
      })
    );
  }
};

export const ServerUrl = Schema.String.pipe(
  Schema.decodeTo(
    Schema.URL,
    SchemaTransformation.transformOrFail({
      decode: parseServerUrl,
      encode: (url) => Effect.succeed(formatUrl(url)),
    })
  ),
  Schema.brand('ServerUrl')
);
export type ServerUrl = typeof ServerUrl.Type;

export const encodeServerUrl = Schema.encodeSync(ServerUrl);

export const serverUrlKey = (serverUrl: ServerUrl): string =>
  encodeURIComponent(encodeServerUrl(serverUrl)).replaceAll('%', '_').toLowerCase();
