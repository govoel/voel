import { BottomSheet, Button, Host, List, Section, VStack, ZStack } from '@expo/ui/swift-ui';
import { disabled, frame, headerProminence, padding } from '@expo/ui/swift-ui/modifiers';
import { useState } from 'react';

import type {
  ActionComponent,
  EditorSheetComponent,
  FormLayoutComponent,
  PageComponent,
  PanelComponent,
} from '#src/components/account-management/ui';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const Panel = (({ title, children }) => (
  <Section title={title}>{children}</Section>
)) satisfies PanelComponent;
export const Action = (({ title, onPress, busy = false }) => (
  <Button onPress={onPress} modifiers={[disabled(busy)]}>
    <Text>{title}</Text>
  </Button>
)) satisfies ActionComponent;
export const Page = (({ children }) => (
  <Host style={{ flex: 1 }}>
    <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
      {children}
    </List>
  </Host>
)) satisfies PageComponent;

/** Keep the trigger in place and discard sensitive form state on dismissal. */
export const EditorSheet = (({ title, children }) => {
  const [presented, setPresented] = useState(false);
  return (
    <BottomSheet
      isPresented={presented}
      onIsPresentedChange={setPresented}
      anchor={
        <Action
          title={title}
          onPress={() => {
            setPresented(true);
          }}
        />
      }>
      {presented
        ? children({
            onSuccess: () => {
              setPresented(false);
            },
          })
        : null}
    </BottomSheet>
  );
}) satisfies EditorSheetComponent;

export const FormLayout = (({ title, children, footer }) => (
  <ZStack alignment="bottom">
    <List
      modifiers={[
        headerProminence('increased'),
        frame({ maxHeight: Infinity }),
        padding({ bottom: 80 }),
      ]}>
      <Section
        header={
          <Text variant="h4" modifiers={[padding({ top: Spacing.three })]}>
            {title}
          </Text>
        }>
        {children}
      </Section>
    </List>
    <VStack modifiers={[padding({ horizontal: Spacing.three, bottom: Spacing.three })]}>
      {footer}
    </VStack>
  </ZStack>
)) satisfies FormLayoutComponent;
