import { defineRule } from '@oxlint/plugins';
import { Option } from 'effect';

import { staticMemberName } from './shared/ast.mts';

/** Require Context.Service shapes to be inferred from their make option. */
export const noContextServiceSecondTypeArgumentRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: "Disallow Context.Service's second type argument.",
    },
  },
  createOnce: (context) => ({
    CallExpression: (node) => {
      if (!Option.contains(staticMemberName(node.callee), 'Context.Service')) {
        return;
      }

      const secondTypeArgument = node.typeArguments?.params[1];
      if (secondTypeArgument) {
        context.report({
          message:
            "Omit Context.Service's second type argument and infer the service type from make.",
          node: secondTypeArgument,
        });
      }
    },
  }),
});
