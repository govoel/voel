import { SafeScrollView } from '#src/components/safe-scroll-view/index.tsx';
import { TabScreenColumn } from '#src/components/tab-screen-column/index.tsx';
import { TabScreenHeader } from '#src/components/tab-screen-header/index.tsx';

export default function MoviesScreen() {
  return (
    <SafeScrollView>
      <TabScreenColumn>
        <TabScreenHeader title="Movies" />
      </TabScreenColumn>
    </SafeScrollView>
  );
}
