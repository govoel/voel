import { defineRule } from '@oxlint/plugins';
import { Option } from 'effect';

import { staticMemberName, unwrapExpression } from './shared/ast.mts';

export const preferFnUntracedRule = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer Effect.fnUntraced over arrow functions returning Effect.gen.',
    },
  },
  createOnce: (context) => ({
    ArrowFunctionExpression: (node) => {
      if (node.async) {
        return;
      }

      let { body } = node;
      if (body.type === 'BlockStatement') {
        const [statement] = body.body;
        if (
          body.body.length !== 1 ||
          statement.type !== 'ReturnStatement' ||
          statement.argument === null
        ) {
          return;
        }
        body = statement.argument;
      }

      let expression = unwrapExpression(body);
      while (expression.type === 'CallExpression') {
        if (Option.contains(staticMemberName(expression.callee), 'Effect.gen')) {
          context.report({
            message: 'Use Effect.fnUntraced instead of an arrow function returning Effect.gen.',
            node,
          });
          return;
        }

        const callee = unwrapExpression(expression.callee);
        if (
          callee.type !== 'MemberExpression' ||
          callee.computed ||
          callee.property.type !== 'Identifier' ||
          callee.property.name !== 'pipe'
        ) {
          return;
        }
        expression = unwrapExpression(callee.object);
      }
    },
  }),
});
