/// <reference types="bun-types" />

// oxlint-disable-next-line import/no-nodejs-modules, effecttsgo/node-builtin-import
import { existsSync, readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules, effecttsgo/node-builtin-import
import path from 'node:path';

import { definePlugin } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';
import { Array, Option, Schema } from 'effect';

const schemaClassConstructors = new Set([
  'Schema.Class',
  'Schema.Error',
  'Schema.TaggedClass',
  'Schema.TaggedError',
]);

const deterministicConstructors = new Set([
  'AtomRpc.Service',
  'Context.Service',
  'LayerMap.Service',
  'Model.Class',
  'RpcMiddleware.Service',
  ...schemaClassConstructors,
]);

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

const isWrappedExpression = (
  expression: ESTree.Expression
): expression is
  | ESTree.ChainExpression
  | ESTree.ParenthesizedExpression
  | ESTree.TSAsExpression
  | ESTree.TSInstantiationExpression
  | ESTree.TSNonNullExpression
  | ESTree.TSSatisfiesExpression
  | ESTree.TSTypeAssertion =>
  expression.type === 'ChainExpression' ||
  expression.type === 'ParenthesizedExpression' ||
  expression.type === 'TSAsExpression' ||
  expression.type === 'TSInstantiationExpression' ||
  expression.type === 'TSNonNullExpression' ||
  expression.type === 'TSSatisfiesExpression' ||
  expression.type === 'TSTypeAssertion';

const unwrapExpression = (expression: ESTree.Expression) => {
  let current = expression;
  while (isWrappedExpression(current)) {
    current = current.expression;
  }
  return current;
};

const staticMemberName = (expression: ESTree.Expression) => {
  const unwrapped = unwrapExpression(expression);
  if (unwrapped.type !== 'MemberExpression' || unwrapped.computed) {
    return Option.none<string>();
  }

  const object = unwrapExpression(unwrapped.object);
  if (object.type !== 'Identifier' || unwrapped.property.type !== 'Identifier') {
    return Option.none<string>();
  }

  return Option.some(`${object.name}.${unwrapped.property.name}`);
};

const callChain = (expression: ESTree.Expression) =>
  Array.unfold(unwrapExpression(expression), (current) =>
    current.type === 'CallExpression'
      ? Option.some([current, unwrapExpression(current.callee)] as const)
      : Option.none()
  );

const expressionArgument = (call: ESTree.CallExpression, index: number) =>
  Array.get(call.arguments, index).pipe(
    Option.filter((argument): argument is ESTree.Expression => argument.type !== 'SpreadElement')
  );

const analyzeSuperclass = (superClass: ESTree.Expression) =>
  Option.gen(function* () {
    const calls = callChain(superClass);
    const innermostCall = yield* Array.last(calls);
    const constructorName = yield* staticMemberName(innermostCall.callee);

    return {
      calls,
      constructorName,
      innermostCall,
      isExtend: constructorName.endsWith('.extend'),
    };
  });

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

const expectedIdentifier = (filename: string, className: string) =>
  Option.gen(function* () {
    const location = yield* getPackageLocation(filename);
    const segments = location.sourcePath.split('/');
    const fileName = yield* Array.last(segments);

    const sourceSegments = fileName === 'index' ? segments.slice(0, -1) : segments;
    const sourceIdentifier = [location.packageName, ...sourceSegments].join('/');
    const identifier =
      fileName !== 'index' && fileName.toLocaleLowerCase() === className.toLocaleLowerCase()
        ? sourceIdentifier
        : `${sourceIdentifier}/${className}`;

    return { identifier, sourceIdentifier };
  });

const evaluateString = (
  expression: ESTree.Expression,
  constants: ReadonlyMap<string, string>
): Option.Option<string> => {
  const unwrapped = unwrapExpression(expression);
  if (unwrapped.type === 'Literal') {
    return typeof unwrapped.value === 'string' ? Option.some(unwrapped.value) : Option.none();
  }
  if (unwrapped.type === 'Identifier') {
    return Option.fromUndefinedOr(constants.get(unwrapped.name));
  }
  if (unwrapped.type !== 'TemplateLiteral') {
    return Option.none();
  }

  return Option.gen(function* () {
    let value = unwrapped.quasis[0]?.value.cooked ?? '';
    for (const [index, interpolation] of unwrapped.expressions.entries()) {
      const evaluated = yield* evaluateString(interpolation, constants);
      value += evaluated + (unwrapped.quasis[index + 1]?.value.cooked ?? '');
    }
    return value;
  });
};

const uniqueSymbolProperties = (type: ESTree.TSType) =>
  type.type === 'TSTypeLiteral'
    ? type.members.filter(
        (member): member is ESTree.TSPropertySignature =>
          member.type === 'TSPropertySignature' &&
          member.readonly &&
          member.typeAnnotation?.typeAnnotation.type === 'TSTypeOperator' &&
          member.typeAnnotation.typeAnnotation.operator === 'unique' &&
          member.typeAnnotation.typeAnnotation.typeAnnotation.type === 'TSSymbolKeyword'
      )
    : [];

const plugin = definePlugin({
  meta: { name: 'effect-conventions' },
  rules: {
    'deterministic-identifiers': {
      create: (context) => {
        const constants = new Map<string, string>();

        return {
          VariableDeclarator(node) {
            if (node.id.type !== 'Identifier' || node.init === null) {
              return;
            }
            const value = evaluateString(node.init, constants);
            if (Option.isSome(value)) {
              constants.set(node.id.name, value.value);
            }
          },
          ClassDeclaration(node) {
            if (node.id === null || node.superClass === null) {
              return;
            }

            const analysis = analyzeSuperclass(node.superClass);
            if (Option.isNone(analysis)) {
              return;
            }

            const { calls, constructorName, innermostCall, isExtend } = analysis.value;
            if (!isExtend && !deterministicConstructors.has(constructorName)) {
              return;
            }

            const identifierCall =
              innermostCall.arguments.length > 0
                ? Option.some(innermostCall)
                : Array.get(calls, calls.length - 2);
            const identifierNode = identifierCall.pipe(
              Option.flatMap((call) => expressionArgument(call, 0))
            );
            if (Option.isNone(identifierNode)) {
              return;
            }

            const expected = expectedIdentifier(context.filename, node.id.name);
            if (Option.isNone(expected)) {
              return;
            }

            const actual = evaluateString(identifierNode.value, constants);
            if (!Option.contains(actual, expected.value.identifier)) {
              context.report({
                message: `Use the deterministic identifier '${expected.value.identifier}'.`,
                node: identifierNode.value,
              });
            }

            if (
              constructorName === 'Schema.TaggedClass' ||
              constructorName === 'Schema.TaggedError'
            ) {
              const tagNode = Array.get(calls, calls.length - 2).pipe(
                Option.flatMap((call) => expressionArgument(call, 0))
              );
              if (
                Option.isSome(tagNode) &&
                !Option.contains(evaluateString(tagNode.value, constants), node.id.name)
              ) {
                context.report({
                  message: `Use the PascalCase class name '${node.id.name}' as the tag.`,
                  node: tagNode.value,
                });
              }
            }
          },
          CallExpression(node) {
            if (!Option.contains(staticMemberName(node.callee), 'Schema.brand')) {
              return;
            }

            const brandNode = expressionArgument(node, 0);
            if (Option.isNone(brandNode)) {
              return;
            }

            const location = expectedIdentifier(context.filename, 'Brand');
            if (Option.isNone(location)) {
              return;
            }

            const brand = evaluateString(brandNode.value, constants);
            if (
              Option.exists(brand, (value) =>
                value.startsWith(`${location.value.sourceIdentifier}/`)
              )
            ) {
              return;
            }

            context.report({
              message: `Use a static brand identifier beneath '${location.value.sourceIdentifier}/'.`,
              node: brandNode.value,
            });
          },
        };
      },
    },
    'schema-class-brand': {
      create: (context) => ({
        ClassDeclaration: (node) => {
          if (node.superClass === null) {
            return;
          }

          const analysis = analyzeSuperclass(node.superClass);
          if (Option.isNone(analysis)) {
            return;
          }

          const { constructorName, innermostCall, isExtend } = analysis.value;
          const isSchemaClass = schemaClassConstructors.has(constructorName);
          if (!isExtend && !isSchemaClass) {
            return;
          }

          const typeArguments = innermostCall.typeArguments?.params ?? [];
          const brandProperties = Array.get(typeArguments, isExtend ? 2 : 1).pipe(
            Option.map(uniqueSymbolProperties),
            Option.getOrElse(() => [])
          );
          const hasBrand = isExtend
            ? brandProperties.length > 0
            : brandProperties.some(
                (property) =>
                  !property.computed &&
                  property.key.type === 'Identifier' &&
                  property.key.name === 'brand'
              );

          if (!hasBrand) {
            context.report({
              message: isExtend
                ? 'Add a readonly unique-symbol brand to this schema subclass.'
                : 'Add { readonly brand: unique symbol } to this schema class.',
              node: innermostCall,
            });
          }
        },
      }),
    },
  },
});

export const deterministicIdentifiersRule = plugin.rules['deterministic-identifiers'];
export const schemaClassBrandRule = plugin.rules['schema-class-brand'];

export default plugin;
