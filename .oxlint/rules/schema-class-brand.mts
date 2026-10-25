import { defineRule } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';
import { Array, Option } from 'effect';

import { analyzeSuperclass, staticMemberName, unwrapExpression } from './shared/ast.mts';

const schemaClassConstructors = new Set([
  'Schema.Class',
  'Schema.Error',
  'Schema.TaggedClass',
  'Schema.TaggedError',
]);

const uniqueSymbolProperties = (type: ESTree.TSType) =>
  type.type === 'TSTypeLiteral'
    ? Array.filter(
        type.members,
        (member): member is ESTree.TSPropertySignature =>
          member.type === 'TSPropertySignature' &&
          member.readonly &&
          member.typeAnnotation?.typeAnnotation.type === 'TSTypeOperator' &&
          member.typeAnnotation.typeAnnotation.operator === 'unique' &&
          member.typeAnnotation.typeAnnotation.typeAnnotation.type === 'TSSymbolKeyword'
      )
    : [];

/** Make Schema.Class constructors explicitly nominal and point structural schemas elsewhere. */
export const schemaClassBrandRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Require unique-symbol brands on Effect schema classes.',
    },
  },
  createOnce: (context) => {
    const definitionOf = (identifier: Extract<ESTree.Expression, { type: 'Identifier' }>) => {
      let scope = context.sourceCode.getScope(identifier);
      for (;;) {
        const variable = scope.set.get(identifier.name);
        if (variable !== void 0) {
          return Array.head(variable.defs);
        }
        if (scope.upper === null) {
          return Option.none();
        }
        scope = scope.upper;
      }
    };

    const isVariantClass = (
      superClass: ESTree.Expression,
      seen = new Set<ESTree.Node>()
    ): boolean => {
      if (seen.has(superClass)) {
        return false;
      }
      seen.add(superClass);
      const analysis = analyzeSuperclass(superClass);
      if (Option.isNone(analysis)) {
        return false;
      }
      const { innermostCall, isExtend } = analysis.value;
      const callee = unwrapExpression(innermostCall.callee);
      if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') {
        return false;
      }
      const base = unwrapExpression(callee.object);
      if (base.type !== 'Identifier') {
        return false;
      }
      const definition = definitionOf(base);
      if (Option.isNone(definition)) {
        return false;
      }
      const { node: declaration, parent } = definition.value;
      if (isExtend) {
        return (
          declaration.type === 'ClassDeclaration' &&
          declaration.superClass !== null &&
          isVariantClass(declaration.superClass, seen)
        );
      }
      if (callee.property.name !== 'Class') {
        return false;
      }
      if (declaration.type === 'ImportSpecifier') {
        const { imported } = declaration;
        return (
          parent?.type === 'ImportDeclaration' &&
          parent.source.value === 'effect/schema' &&
          parent.importKind !== 'type' &&
          declaration.importKind !== 'type' &&
          (imported.type === 'Identifier' ? imported.name : imported.value) === 'Model'
        );
      }
      if (declaration.type !== 'VariableDeclarator' || declaration.init === null) {
        return false;
      }
      const initializer = unwrapExpression(declaration.init);
      return (
        initializer.type === 'CallExpression' &&
        Option.contains(staticMemberName(initializer.callee), 'VariantSchema.make')
      );
    };

    return {
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
        if ((!isExtend && !isSchemaClass) || (isExtend && isVariantClass(node.superClass))) {
          return;
        }

        const typeArguments = innermostCall.typeArguments?.params ?? [];
        const brandProperties = Array.get(typeArguments, isExtend ? 2 : 1).pipe(
          Option.map(uniqueSymbolProperties),
          Option.getOrElse(() => [])
        );
        const hasBrand = isExtend
          ? brandProperties.length > 0
          : Array.some(
              brandProperties,
              (property) =>
                !property.computed &&
                property.key.type === 'Identifier' &&
                property.key.name === 'brand'
            );

        if (!hasBrand) {
          context.report({
            message: isExtend
              ? 'Add a readonly unique-symbol brand to this schema subclass. If nominal typing is not desired, extend Schema.Struct, Schema.TaggedStruct, or Schema.Opaque instead.'
              : 'Add { readonly brand: unique symbol } to this schema class. If nominal typing is not desired, extend Schema.Struct, Schema.TaggedStruct, or Schema.Opaque instead.',
            node: innermostCall,
          });
        }
      },
    };
  },
});
