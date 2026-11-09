import { defineRule } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';
import { Option } from 'effect';

import { expressionArgument, unwrapExpression } from './shared/ast.mts';

const modelVariants = new Set([
  'select',
  'insert',
  'create',
  'update',
  'upsert',
  'json',
  'jsonCreate',
  'jsonUpdate',
  'jsonUpsert',
]);

const boundaries = new Map([
  [
    'HttpApiEndpoint',
    {
      optionsIndex: 2,
      properties: new Set(['params', 'query', 'headers', 'payload', 'success', 'error']),
    },
  ],
  ['SqlSchema', { optionsIndex: 0, properties: new Set(['Request', 'Result']) }],
]);

const propertyName = (
  node: ESTree.MemberExpression | Extract<ESTree.Node, { type: 'Property' }>
) => {
  const key = node.type === 'MemberExpression' ? node.property : node.key;
  if (!node.computed && key.type === 'Identifier') {
    return Option.some(key.name);
  }
  return key.type === 'Literal' && typeof key.value === 'string'
    ? Option.some(key.value)
    : Option.none<string>();
};

const parentOutsideWrappers = (node: ESTree.Expression) => {
  let { parent } = node;
  while (
    parent.type === 'ChainExpression' ||
    parent.type === 'ParenthesizedExpression' ||
    parent.type === 'TSAsExpression' ||
    parent.type === 'TSInstantiationExpression' ||
    parent.type === 'TSNonNullExpression' ||
    parent.type === 'TSSatisfiesExpression' ||
    parent.type === 'TSTypeAssertion'
  ) {
    ({ parent } = parent);
  }
  return parent;
};

const isModelVariant = (node: ESTree.Expression) => {
  const expression = unwrapExpression(node);
  if (expression.type !== 'MemberExpression') {
    return false;
  }
  const object = unwrapExpression(expression.object);
  return (
    !(object.type === 'MemberExpression' && Option.contains(propertyName(object), 'fields')) &&
    Option.exists(propertyName(expression), (name) => modelVariants.has(name))
  );
};

const isBoundaryProperty = (node: ESTree.Node) => {
  if (node.type !== 'Property' || node.parent.type !== 'ObjectExpression') {
    return false;
  }
  const options = node.parent;
  const call = parentOutsideWrappers(options);
  if (call.type !== 'CallExpression') {
    return false;
  }
  const callee = unwrapExpression(call.callee);
  if (callee.type !== 'MemberExpression') {
    return false;
  }
  const receiver = unwrapExpression(callee.object);
  if (receiver.type !== 'Identifier') {
    return false;
  }
  const boundary = boundaries.get(receiver.name);
  const name = propertyName(node);
  return (
    boundary !== void 0 &&
    Option.exists(name, (key) => boundary.properties.has(key)) &&
    Option.exists(
      expressionArgument(call, boundary.optionsIndex),
      (argument) => unwrapExpression(argument) === options
    )
  );
};

const isBoundarySchema = (node: ESTree.MemberExpression) => {
  for (
    let ancestor: ESTree.Node = node.parent;
    ancestor.type !== 'Program';
    ancestor = ancestor.parent
  ) {
    if (isBoundaryProperty(ancestor)) {
      return true;
    }
  }
  return false;
};

export const requireExplicitModelFieldsRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Require explicit model field selection in HTTP and SQL boundary schemas.',
    },
  },
  createOnce: (context) => ({
    MemberExpression: (node) => {
      const parent = parentOutsideWrappers(node);
      if (parent.type === 'CallExpression' && unwrapExpression(parent.callee) === node) {
        return;
      }
      const isMemberObject =
        parent.type === 'MemberExpression' && unwrapExpression(parent.object) === node;
      const isVariantFields =
        Option.contains(propertyName(node), 'fields') && isModelVariant(node.object);
      if (isVariantFields) {
        if (isMemberObject) {
          return;
        }
      } else if (isModelVariant(node)) {
        if (isMemberObject && Option.contains(propertyName(parent), 'fields')) {
          return;
        }
      } else {
        return;
      }
      if (isBoundarySchema(node)) {
        context.report({
          message:
            'List the intended fields explicitly in Schema.Struct using individual model field schemas; do not use an entire model variant or its fields.',
          node,
        });
      }
    },
  }),
});
