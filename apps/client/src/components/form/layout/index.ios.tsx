import { List, Section, VStack } from '@expo/ui/swift-ui';
import { frame, headerProminence, padding } from '@expo/ui/swift-ui/modifiers';
import { requireNativeView } from 'expo';
import type { PropsWithChildren } from 'react';

import type { FormLayoutComponent } from '#src/components/form/layout';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

const NativeFormLayoutInset = requireNativeView<PropsWithChildren>(
  'FormLayoutInset',
  'FormLayoutInsetView'
);

const FormLayoutSlot = requireNativeView<
  PropsWithChildren<{ readonly name: 'content' | 'footer' }>
>('FormLayoutInset', 'FormLayoutSlotView');

/** Let SwiftUI manage the footer's safe area and native scroll-edge appearance. */
export const FormLayout = (({ title, children, footer }) => (
  <NativeFormLayoutInset>
    <FormLayoutSlot name="content">
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
    </FormLayoutSlot>
    <FormLayoutSlot name="footer">
      <VStack
        spacing={Spacing.two}
        modifiers={[
          padding({ horizontal: Spacing.three, top: Spacing.two, bottom: Spacing.three }),
          frame({ maxWidth: Infinity }),
        ]}>
        {footer}
      </VStack>
    </FormLayoutSlot>
  </NativeFormLayoutInset>
)) satisfies FormLayoutComponent;
