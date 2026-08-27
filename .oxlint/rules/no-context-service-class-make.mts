import { defineRule } from '@oxlint/plugins';
import { Option } from 'effect';

import { analyzeSuperclass } from './shared/ast.mts';

/** Keep Context.Service construction in its options object so its service type remains inferred. */
export const noContextServiceClassMakeRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: "Disallow a 'make' member on Context.Service classes.",
    },
  },
  createOnce: (context) => ({
    ClassDeclaration: (node) => {
      if (node.superClass === null) {
        return;
      }

      const analysis = analyzeSuperclass(node.superClass);
      if (Option.isNone(analysis) || analysis.value.constructorName !== 'Context.Service') {
        return;
      }

      for (const member of node.body.body) {
        if (
          (member.type === 'PropertyDefinition' || member.type === 'MethodDefinition') &&
          !member.computed &&
          member.key.type === 'Identifier' &&
          member.key.name === 'make'
        ) {
          context.report({
            message:
              "Define 'make' in the Context.Service options object so the service type can be inferred.",
            node: member,
          });
        }
      }
    },
  }),
});
