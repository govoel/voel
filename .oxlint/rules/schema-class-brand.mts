import { defineRule } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';
import { Array, Option } from 'effect';

import { analyzeSuperclass } from './shared/ast.mts';

const schemaClassConstructors = new Set([
  'Schema.Class',
  'Schema.Error',
  'Schema.TaggedClass',
  'Schema.TaggedError',
]);

const uniqueSymbolProperties = (type: ESTree.TSType) =>
  type.type === 'TSTypeLiteral'
    ? type.members.filter(
        (member): member is ESTree.TSPropertySignature =>
          member.type === 'TSPropertySignature' &&
          member.readonly &&
          member.typeAnnotation?.typeAnnotation.type === 'TSTypeOperator' &&
          member.typeAnnotation.typeAnnotation.operator === 'unique' &&
          member.typeAnnotation.typeAnnotation.typeAnnotation.type === 'TSSymbolKeyword'
      )
    : [];

/** Require nominal unique-symbol brands on schema classes and subclasses. */
export const schemaClassBrandRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Require unique-symbol brands on Effect schema classes.',
    },
  },
  createOnce: (context) => ({
    ClassDeclaration: (node) => {
      if (node.superClass === null) {
        return;
      }

      const analysis = analyzeSuperclass(node.superClass);
      if (Option.isNone(analysis)) {
        return;
      }

      const { constructorName, innermostCall, isExtend } = analysis.value;
      const isSchemaClass = schemaClassConstructors.has(constructorName);
      if (!isExtend && !isSchemaClass) {
        return;
      }

      const typeArguments = innermostCall.typeArguments?.params ?? [];
      const brandProperties = Array.get(typeArguments, isExtend ? 2 : 1).pipe(
        Option.map(uniqueSymbolProperties),
        Option.getOrElse(() => [])
      );
      const hasBrand = isExtend
        ? brandProperties.length > 0
        : brandProperties.some(
            (property) =>
              !property.computed &&
              property.key.type === 'Identifier' &&
              property.key.name === 'brand'
          );

      if (!hasBrand) {
        context.report({
          message: isExtend
            ? 'Add a readonly unique-symbol brand to this schema subclass.'
            : 'Add { readonly brand: unique symbol } to this schema class.',
          node: innermostCall,
        });
      }
    },
  }),
});
