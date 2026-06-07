import { useAtomSet } from '@effect/atom-react';
import AccountCircle from '@expo/material-symbols/account_circle.xml';
import { Icon, Row, TextButton, useMaterialColors } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';

import { accountsSheetIsPresentedAtom } from '#src/components/accounts/shared.ts';
import type { TabScreenHeaderComponent } from '#src/components/tab-screen-header';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const TabScreenHeader = (({ title }) => {
  const setIsPresented = useAtomSet(accountsSheetIsPresentedAtom);
  const colors = useMaterialColors({ seedColor: '#00AAFF' });

  return (
    <Row
      verticalAlignment="center"
      horizontalArrangement="spaceBetween"
      modifiers={[fillMaxWidth()]}>
      <Text variant="h1">{title}</Text>

      <TextButton
        onClick={() => {
          setIsPresented(true);
        }}
        contentPadding={{
          start: Spacing.two,
          top: Spacing.one,
          end: Spacing.two,
          bottom: Spacing.one,
        }}>
        <Icon source={AccountCircle} size={32} tint={colors.onSurfaceVariant} />
      </TextButton>
    </Row>
  );
}) satisfies TabScreenHeaderComponent;
