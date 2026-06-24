import { definePlugin, defineRule } from '@oxlint/plugins';
import type { Context, ESTree } from '@oxlint/plugins';

const isServerImport = (source: string) =>
  source === '@repo/server' || source.startsWith('@repo/server/');

const reportServerImport = (context: Context, node: ESTree.Node) => {
  context.report({
    message: '`@repo/server` may only be imported by test files in `apps/client`.',
    node,
  });
};

const getImportSource = (
  node: ESTree.ExportAllDeclaration | ESTree.ExportNamedDeclaration | ESTree.ImportDeclaration
) => {
  const value = node.source?.value;
  return typeof value === 'string' ? value : null;
};

const getLiteralSource = (node: ESTree.Node) => {
  if (node.type !== 'Literal') {
    return null;
  }

  const { value } = node;
  return typeof value === 'string' ? value : null;
};

const rule = defineRule({
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'require') {
          return;
        }

        const [argument] = node.arguments;
        const source = getLiteralSource(argument);
        if (source !== null && isServerImport(source)) {
          reportServerImport(context, argument);
        }
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        const source = getImportSource(node);
        if (source !== null && isServerImport(source)) {
          reportServerImport(context, node.source);
        }
      },
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        const source = getImportSource(node);
        if (node.source && source !== null && isServerImport(source)) {
          reportServerImport(context, node.source);
        }
      },
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const source = getImportSource(node);
        if (source !== null && isServerImport(source)) {
          reportServerImport(context, node.source);
        }
      },
      ImportExpression(node: ESTree.ImportExpression) {
        const source = getLiteralSource(node.source);
        if (source !== null && isServerImport(source)) {
          reportServerImport(context, node.source);
        }
      },
    };
  },
});

const plugin = definePlugin({
  meta: {
    name: 'voel',
  },
  rules: {
    'no-server-imports-in-client': rule,
  },
});

export default plugin;
