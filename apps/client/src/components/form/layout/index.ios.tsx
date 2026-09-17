import { List, Section, VStack } from '@expo/ui/swift-ui';
import { frame, headerProminence, padding } from '@expo/ui/swift-ui/modifiers';

import type { FormLayoutComponent } from '#src/components/form/layout';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

/** Keep the action area outside the list so errors and larger text never cover fields. */
export const FormLayout = (({ title, children, footer }) => (
  <VStack spacing={0} modifiers={[frame({ maxHeight: Infinity })]}>
    <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
      <Section
        header={
          <Text variant="h4" modifiers={[padding({ top: Spacing.three })]}>
            {title}
          </Text>
        }>
        {children}
      </Section>
    </List>
    <VStack
      spacing={Spacing.two}
      modifiers={[padding({ horizontal: Spacing.three, bottom: Spacing.three })]}>
      {footer}
    </VStack>
  </VStack>
)) satisfies FormLayoutComponent;
