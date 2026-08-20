import type * as ESTree from '@oxc-project/types';

interface RuleContext {
  readonly filename: string;
  readonly report: (diagnostic: { readonly message: string; readonly node: ESTree.Node }) => void;
}

interface Visitor {
  readonly CallExpression?: (node: ESTree.CallExpression) => void;
  readonly ClassDeclaration?: (node: ESTree.Class) => void;
  readonly VariableDeclarator?: (node: ESTree.VariableDeclarator) => void;
}

interface Plugin {
  readonly meta: { readonly name: string };
  readonly rules: Readonly<Record<string, { readonly create: (context: RuleContext) => Visitor }>>;
}

const deterministicConstructors = new Set([
  'AtomRpc.Service',
  'Context.Service',
  'LayerMap.Service',
  'Model.Class',
  'RpcMiddleware.Service',
  'Schema.Class',
  'Schema.Error',
  'Schema.TaggedClass',
  'Schema.TaggedError',
]);

const isWrappedExpression = (
  expression: ESTree.Expression
): expression is
  | ESTree.ChainExpression
  | ESTree.ParenthesizedExpression
  | ESTree.TSAsExpression
  | ESTree.TSInstantiationExpression
  | ESTree.TSNonNullExpression
  | ESTree.TSSatisfiesExpression
  | ESTree.TSTypeAssertion =>
  expression.type === 'ChainExpression' ||
  expression.type === 'ParenthesizedExpression' ||
  expression.type === 'TSAsExpression' ||
  expression.type === 'TSInstantiationExpression' ||
  expression.type === 'TSNonNullExpression' ||
  expression.type === 'TSSatisfiesExpression' ||
  expression.type === 'TSTypeAssertion';

const unwrapExpression = (expression: ESTree.Expression) => {
  let current = expression;
  while (isWrappedExpression(current)) {
    current = current.expression;
  }
  return current;
};

const staticMemberName = (expression: ESTree.Expression) => {
  const unwrapped = unwrapExpression(expression);
  if (unwrapped.type !== 'MemberExpression' || unwrapped.computed) {
    return void 0;
  }

  const object = unwrapExpression(unwrapped.object);
  if (object.type !== 'Identifier' || unwrapped.property.type !== 'Identifier') {
    return void 0;
  }

  return `${object.name}.${unwrapped.property.name}`;
};

const callChain = (expression: ESTree.Expression) => {
  const calls: Array<ESTree.CallExpression> = [];
  let current = unwrapExpression(expression);

  while (current.type === 'CallExpression') {
    calls.push(current);
    current = unwrapExpression(current.callee);
  }

  return calls;
};

const getPackageLocation = (filename: string) => {
  const normalized = filename.replaceAll('\\', '/');
  const match =
    /(?:^|\/)\b(?<workspaceType>apps|packages)\/(?<workspaceName>[^/]+)\/(?<sourcePath>.+)$/u.exec(
      normalized
    );
  if (match === null) {
    return void 0;
  }

  if (match.groups === void 0) {
    return void 0;
  }
  const { sourcePath: rawSourcePath, workspaceName, workspaceType } = match.groups;

  let packageName = `@repo/${workspaceName}`;
  if (workspaceType === 'apps' && workspaceName === 'client') {
    packageName = 'voel';
  }

  return {
    packageName,
    sourcePath: rawSourcePath.replace(/^src\//u, '').replace(/\.(?:mts|tsx?|cts)$/u, ''),
  };
};

const expectedIdentifier = (filename: string, className: string) => {
  const location = getPackageLocation(filename);
  if (location === void 0) {
    return void 0;
  }

  const segments = location.sourcePath.split('/');
  const fileName = segments.at(-1);
  if (fileName === void 0) {
    return void 0;
  }

  const sourceSegments = fileName === 'index' ? segments.slice(0, -1) : segments;
  const sourceIdentifier = [location.packageName, ...sourceSegments].join('/');
  const identifier =
    fileName !== 'index' && fileName.toLocaleLowerCase() === className.toLocaleLowerCase()
      ? sourceIdentifier
      : `${sourceIdentifier}/${className}`;

  return { identifier, sourceIdentifier };
};

const evaluateString = (
  expression: ESTree.Expression,
  constants: ReadonlyMap<string, string>
): string | undefined => {
  const unwrapped = unwrapExpression(expression);
  if (unwrapped.type === 'Literal') {
    return typeof unwrapped.value === 'string' ? unwrapped.value : void 0;
  }
  if (unwrapped.type === 'Identifier') {
    return constants.get(unwrapped.name);
  }
  if (unwrapped.type !== 'TemplateLiteral') {
    return void 0;
  }

  let value = unwrapped.quasis[0]?.value.cooked ?? '';
  for (const [index, interpolation] of unwrapped.expressions.entries()) {
    const evaluated = evaluateString(interpolation, constants);
    if (evaluated === void 0) {
      return void 0;
    }
    value += evaluated + (unwrapped.quasis[index + 1]?.value.cooked ?? '');
  }
  return value;
};

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

const plugin = {
  meta: { name: 'effect-conventions' },
  rules: {
    'deterministic-identifiers': {
      create: (context) => {
        const constants = new Map<string, string>();

        return {
          VariableDeclarator(node) {
            if (node.id.type !== 'Identifier' || node.init === null) {
              return;
            }
            const value = evaluateString(node.init, constants);
            if (value !== void 0) {
              constants.set(node.id.name, value);
            }
          },
          ClassDeclaration(node) {
            if (node.id === null || node.superClass === null) {
              return;
            }

            const calls = callChain(node.superClass);
            const innermostCall = calls.at(-1);
            if (innermostCall === void 0) {
              return;
            }

            const constructorName = staticMemberName(innermostCall.callee);
            const isExtend = constructorName?.endsWith('.extend') ?? false;
            if (
              !isExtend &&
              (constructorName === void 0 || !deterministicConstructors.has(constructorName))
            ) {
              return;
            }

            const identifierCall =
              innermostCall.arguments.length > 0 ? innermostCall : calls.at(-2);
            const identifierNode = identifierCall?.arguments[0];
            if (identifierNode === void 0 || identifierNode.type === 'SpreadElement') {
              return;
            }

            const expected = expectedIdentifier(context.filename, node.id.name);
            if (expected === void 0) {
              return;
            }

            const actual = evaluateString(identifierNode, constants);
            if (actual !== expected.identifier) {
              context.report({
                message: `Use the deterministic identifier '${expected.identifier}'.`,
                node: identifierNode,
              });
            }

            if (
              constructorName === 'Schema.TaggedClass' ||
              constructorName === 'Schema.TaggedError'
            ) {
              const tagCall = calls.at(-2);
              const tagNode = tagCall?.arguments[0];
              if (
                tagNode !== void 0 &&
                tagNode.type !== 'SpreadElement' &&
                evaluateString(tagNode, constants) !== node.id.name
              ) {
                context.report({
                  message: `Use the PascalCase class name '${node.id.name}' as the tag.`,
                  node: tagNode,
                });
              }
            }
          },
          CallExpression(node) {
            if (staticMemberName(node.callee) !== 'Schema.brand') {
              return;
            }

            if (node.arguments.length === 0) {
              return;
            }
            const [brandNode] = node.arguments;
            if (brandNode.type === 'SpreadElement') {
              return;
            }

            const location = expectedIdentifier(context.filename, 'Brand');
            const brand = evaluateString(brandNode, constants);
            if (
              location === void 0 ||
              brand?.startsWith(`${location.sourceIdentifier}/`) === true
            ) {
              return;
            }

            context.report({
              message: `Use a static brand identifier beneath '${location.sourceIdentifier}/'.`,
              node: brandNode,
            });
          },
        };
      },
    },
    'schema-class-brand': {
      create: (context) => ({
        ClassDeclaration: (node) => {
          if (node.superClass === null) {
            return;
          }

          const calls = callChain(node.superClass);
          const innermostCall = calls.at(-1);
          if (innermostCall === void 0) {
            return;
          }

          const constructorName = staticMemberName(innermostCall.callee);
          const isExtend = constructorName?.endsWith('.extend') ?? false;
          const isSchemaClass =
            constructorName === 'Schema.Class' ||
            constructorName === 'Schema.Error' ||
            constructorName === 'Schema.TaggedClass' ||
            constructorName === 'Schema.TaggedError';
          if (!isExtend && !isSchemaClass) {
            return;
          }

          const typeArguments = innermostCall.typeArguments?.params ?? [];
          const brandType = typeArguments.at(isExtend ? 2 : 1);
          const brandProperties = brandType === void 0 ? [] : uniqueSymbolProperties(brandType);
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
    },
  },
} satisfies Plugin;

export const deterministicIdentifiersRule = plugin.rules['deterministic-identifiers'];
export const schemaClassBrandRule = plugin.rules['schema-class-brand'];

export default plugin;
