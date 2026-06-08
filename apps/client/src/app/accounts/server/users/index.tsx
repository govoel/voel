import { SafeScrollView } from '#src/components/safe-scroll-view';
import { TabScreenColumn } from '#src/components/tab-screen-column';
import { Text } from '#src/components/text';

export default function ServerUsersScreen() {
  return (
    <SafeScrollView>
      <TabScreenColumn>
        <Text variant="h3">Users</Text>
      </TabScreenColumn>
    </SafeScrollView>
  );
}
