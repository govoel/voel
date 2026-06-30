import { SafeScrollView } from '#src/components/safe-scroll-view';
import { TabScreenColumn } from '#src/components/tab-screen-column';
import { Text } from '#src/components/text';

export default function AccountSettingsScreen() {
  return (
    <SafeScrollView>
      <TabScreenColumn>
        <Text variant="h3">Settings</Text>
      </TabScreenColumn>
    </SafeScrollView>
  );
}
