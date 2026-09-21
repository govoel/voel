import { Column } from '@expo/ui/jetpack-compose';
import { padding, verticalScroll } from '@expo/ui/jetpack-compose/modifiers';

import type { FormLayoutComponent } from '#src/components/form/layout';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const FormLayout = (({ title, children, footer }) => (
  <Column
    modifiers={[verticalScroll(), padding(Spacing.three, 0, Spacing.three, Spacing.three)]}
    verticalArrangement={{ spacedBy: Spacing.two }}>
    {title !== void 0 ? <Text variant="h3">{title}</Text> : null}
    {children}
    {footer}
  </Column>
)) satisfies FormLayoutComponent;
