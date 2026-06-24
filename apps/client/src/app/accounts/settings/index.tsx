import { SafeScrollView } from '#src/components/safe-scroll-view/index.tsx';
import { TabScreenColumn } from '#src/components/tab-screen-column/index.tsx';
import { Text } from '#src/components/text/index.tsx';

export default function AccountSettingsScreen() {
  return (
    <SafeScrollView>
      <TabScreenColumn>
        <Text variant="h3">Settings</Text>
      </TabScreenColumn>
    </SafeScrollView>
  );
}
