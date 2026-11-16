import { Column } from '@expo/ui/jetpack-compose';
import { padding, verticalScroll } from '@expo/ui/jetpack-compose/modifiers';
import { Array } from 'effect';
import { Fragment } from 'react';

import type { FormLayoutComponent } from '#src/components/form/layout';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const FormLayout = (({ title, children, footer, sections = [] }) => (
  <Column
    modifiers={[verticalScroll(), padding(Spacing.three, 0, Spacing.three, Spacing.three)]}
    verticalArrangement={{ spacedBy: Spacing.two }}>
    {title !== void 0 ? <Text variant="h3">{title}</Text> : null}
    {children}
    {Array.map(sections, ({ key, title: sectionTitle, content }) => (
      <Fragment key={key}>
        <Text variant="h4" modifiers={[padding(0, Spacing.two, 0, 0)]}>
          {sectionTitle}
        </Text>
        {content}
      </Fragment>
    ))}
    {footer}
  </Column>
)) satisfies FormLayoutComponent;
