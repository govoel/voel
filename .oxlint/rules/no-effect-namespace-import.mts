import { defineRule } from '@oxlint/plugins';
import { String, pipe } from 'effect';

const isEffectModule = (moduleName: string) =>
  moduleName === 'effect' || pipe(moduleName, String.startsWith('effect/'));

export const noEffectNamespaceImportRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow namespace imports from Effect modules.',
    },
  },
  createOnce: (context) => ({
    ImportDeclaration: (node) => {
      if (typeof node.source.value !== 'string' || !isEffectModule(node.source.value)) {
        return;
      }

      for (const specifier of node.specifiers) {
        if (specifier.type === 'ImportNamespaceSpecifier') {
          context.report({
            message: 'Use a named import from an Effect barrel instead of a namespace import.',
            node: specifier,
          });
        }
      }
    },
  }),
});
