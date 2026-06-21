import { SafeScrollView } from '#src/components/safe-scroll-view';
import { TabScreenColumn } from '#src/components/tab-screen-column';
import { TabScreenHeader } from '#src/components/tab-screen-header';

export default function BooksScreen() {
  return (
    <SafeScrollView>
      <TabScreenColumn>
        <TabScreenHeader title="Books" />
      </TabScreenColumn>
    </SafeScrollView>
  );
}
