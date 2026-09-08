import { defineRule } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';
import { Option } from 'effect';

import { staticMemberName, unwrapExpression } from './shared/ast.mts';

const isSchemaStructCall = (expression: ESTree.Expression): boolean => {
  const unwrapped = unwrapExpression(expression);
  if (unwrapped.type !== 'CallExpression') {
    return false;
  }
  if (Option.contains(staticMemberName(unwrapped.callee), 'Schema.Struct')) {
    return true;
  }

  const callee = unwrapExpression(unwrapped.callee);
  return callee.type === 'MemberExpression' && isSchemaStructCall(callee.object);
};

/** Give named structural schemas a class namespace for their static helpers. */
export const noSchemaStructAssignmentRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow assigning Schema.Struct to a named binding.',
    },
  },
  createOnce: (context) => {
    const report = (expression: ESTree.Expression) => {
      if (!isSchemaStructCall(expression)) {
        return;
      }
      context.report({
        message:
          'Define named structural schemas with a class extending Schema.Struct, Schema.TaggedStruct, or Schema.Opaque so schema helpers can be declared as static fields.',
        node: expression,
      });
    };

    return {
      VariableDeclarator: (node) => {
        if (node.init !== null) {
          report(node.init);
        }
      },
      AssignmentExpression: (node) => {
        report(node.right);
      },
    };
  },
});
