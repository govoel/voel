import { eslintCompatPlugin } from '@oxlint/plugins';

import { deterministicIdentifiersRule } from './rules/deterministic-identifiers.mts';
import { noSchemaStructAssignmentRule } from './rules/no-schema-struct-assignment.mts';
import { schemaClassBrandRule } from './rules/schema-class-brand.mts';

const plugin = eslintCompatPlugin({
  meta: { name: 'effect-conventions' },
  rules: {
    'deterministic-identifiers': deterministicIdentifiersRule,
    'no-schema-struct-assignment': noSchemaStructAssignmentRule,
    'schema-class-brand': schemaClassBrandRule,
  },
});

export default plugin;
