import AccountCircle from '@expo/material-symbols/account_circle.xml';
import { Icon, IconButton, Row } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { router } from 'expo-router';

import type { TabScreenHeaderComponent } from '#src/components/tab-screen-header/index.tsx';
import { Text } from '#src/components/text/index.tsx';

export const TabScreenHeader = (({ title }) => (
  <Row verticalAlignment="center" horizontalArrangement="spaceBetween" modifiers={[fillMaxWidth()]}>
    <Text variant="h1">{title}</Text>

    <IconButton
      onClick={() => {
        router.push('/accounts');
      }}>
      <Icon source={AccountCircle} size={32} />
    </IconButton>
  </Row>
)) satisfies TabScreenHeaderComponent;
