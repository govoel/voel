/// <reference types="bun-types" />

// oxlint-disable-next-line import/no-nodejs-modules, effecttsgo/node-builtin-import
import { existsSync, readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules, effecttsgo/node-builtin-import
import path from 'node:path';

import { Array, Option, Schema } from 'effect';

const decodePackageManifest = Schema.decodeUnknownOption(
  Schema.Struct({ name: Schema.NonEmptyString })
);
const parseJson = Option.liftThrowable((source: string): unknown => JSON.parse(source));
const readTextFile = Option.liftThrowable((filePath: string) => readFileSync(filePath, 'utf8'));

const packageCache = new Map<string, { name: string; root: string }>();

const readPackageName = (filePath: string) =>
  readTextFile(filePath).pipe(
    Option.flatMap(parseJson),
    Option.flatMap(decodePackageManifest),
    Option.map((manifest) => manifest.name)
  );

const findPackageFromDirectory = (
  directory: string
): Option.Option<NonNullable<ReturnType<typeof packageCache.get>>> => {
  const cached = Option.fromUndefinedOr(packageCache.get(directory));
  if (Option.isSome(cached)) {
    return cached;
  }

  const manifestPath = path.join(directory, 'package.json');
  if (existsSync(manifestPath)) {
    const packageLocation = readPackageName(manifestPath).pipe(
      Option.map((name) => ({ name, root: directory }))
    );
    if (Option.isSome(packageLocation)) {
      packageCache.set(directory, packageLocation.value);
    }
    return packageLocation;
  }

  const parentDirectory = path.dirname(directory);
  if (parentDirectory === directory) {
    return Option.none();
  }

  const packageLocation = findPackageFromDirectory(parentDirectory);
  if (Option.isSome(packageLocation)) {
    packageCache.set(directory, packageLocation.value);
  }
  return packageLocation;
};

const getPackageLocation = (filename: string) =>
  findPackageFromDirectory(path.dirname(filename)).pipe(
    Option.map((packageLocation) => ({
      packageName: packageLocation.name,
      sourcePath: path
        .relative(packageLocation.root, filename)
        .replaceAll('\\', '/')
        .replace(/^src\//u, '')
        .replace(/\.(?:mts|tsx?|cts)$/u, ''),
    }))
  );

export const expectedIdentifier = (filename: string, className: string) =>
  Option.gen(function* () {
    const location = yield* getPackageLocation(filename);
    const segments = location.sourcePath.split('/');
    const fileName = yield* Array.last(segments);

    const sourceSegments = fileName === 'index' ? segments.slice(0, -1) : segments;
    const sourceIdentifier = [location.packageName, ...sourceSegments].join('/');
    const identifier =
      fileName !== 'index' && fileName.toLowerCase() === className.toLowerCase()
        ? sourceIdentifier
        : `${sourceIdentifier}/${className}`;

    return { identifier, sourceIdentifier };
  });
