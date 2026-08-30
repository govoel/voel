import { eslintCompatPlugin } from '@oxlint/plugins';

import { deterministicIdentifiersRule } from './rules/deterministic-identifiers.mts';
import { noContextServiceClassMakeRule } from './rules/no-context-service-class-make.mts';
import { noContextServiceSecondTypeArgumentRule } from './rules/no-context-service-second-type-argument.mts';
import { noEffectNamespaceImportRule } from './rules/no-effect-namespace-import.mts';
import { noSchemaStructAssignmentRule } from './rules/no-schema-struct-assignment.mts';
import { schemaClassBrandRule } from './rules/schema-class-brand.mts';

const plugin = eslintCompatPlugin({
  meta: { name: 'effect-conventions' },
  rules: {
    'deterministic-identifiers': deterministicIdentifiersRule,
    'no-context-service-class-make': noContextServiceClassMakeRule,
    'no-context-service-second-type-argument': noContextServiceSecondTypeArgumentRule,
    'no-effect-namespace-import': noEffectNamespaceImportRule,
    'no-schema-struct-assignment': noSchemaStructAssignmentRule,
    'schema-class-brand': schemaClassBrandRule,
  },
});

export default plugin;
