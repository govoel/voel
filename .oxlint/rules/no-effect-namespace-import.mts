import { defineRule } from '@oxlint/plugins';

const isEffectModule = (moduleName: string) =>
  moduleName === 'effect' || moduleName.startsWith('effect/');

/** Keep Effect imports on its public named-export barrels. */
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
