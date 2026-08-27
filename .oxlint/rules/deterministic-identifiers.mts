import { defineRule } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';
import { Array, Option } from 'effect';

import {
  analyzeSuperclass,
  expressionArgument,
  staticMemberName,
  unwrapExpression,
} from './shared/ast.mts';
import { expectedIdentifier } from './shared/package-location.mts';

const deterministicConstructors = new Set([
  'AtomRpc.Service',
  'Context.Service',
  'LayerMap.Service',
  'Model.Class',
  'RpcMiddleware.Service',
  'Schema.Class',
  'Schema.Error',
  'Schema.TaggedClass',
  'Schema.TaggedError',
]);

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

/** Enforce identifiers derived from a class or brand's package and source location. */
export const deterministicIdentifiersRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce deterministic Effect identifiers derived from source locations.',
    },
  },
  createOnce: (context) => {
    const constants = new Map<string, string>();

    return {
      before() {
        constants.clear();
      },
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

        if (constructorName === 'Schema.TaggedClass' || constructorName === 'Schema.TaggedError') {
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
          Option.exists(brand, (value) => value.startsWith(`${location.value.sourceIdentifier}/`))
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
});
