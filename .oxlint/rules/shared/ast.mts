import type { ESTree } from '@oxlint/plugins';
import { Array, Option } from 'effect';

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

export const unwrapExpression = (expression: ESTree.Expression) => {
  let current = expression;
  while (isWrappedExpression(current)) {
    current = current.expression;
  }
  return current;
};

export const staticMemberName = (expression: ESTree.Expression) => {
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

export const expressionArgument = (call: ESTree.CallExpression, index: number) =>
  Array.get(call.arguments, index).pipe(
    Option.filter((argument): argument is ESTree.Expression => argument.type !== 'SpreadElement')
  );

export const analyzeSuperclass = (superClass: ESTree.Expression) =>
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
