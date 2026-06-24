import { SafeScrollView } from '#src/components/safe-scroll-view/index.tsx';
import { TabScreenColumn } from '#src/components/tab-screen-column/index.tsx';
import { Text } from '#src/components/text/index.tsx';

export default function ServerSettingsScreen() {
  return (
    <SafeScrollView>
      <TabScreenColumn>
        <Text variant="h3">Server Settings</Text>
      </TabScreenColumn>
    </SafeScrollView>
  );
}
