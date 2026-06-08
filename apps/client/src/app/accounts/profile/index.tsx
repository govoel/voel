import { SafeScrollView } from '#src/components/safe-scroll-view';
import { TabScreenColumn } from '#src/components/tab-screen-column';
import { Text } from '#src/components/text';

export default function ProfileScreen() {
  return (
    <SafeScrollView>
      <TabScreenColumn>
        <Text variant="h3">Profile</Text>
      </TabScreenColumn>
    </SafeScrollView>
  );
}
