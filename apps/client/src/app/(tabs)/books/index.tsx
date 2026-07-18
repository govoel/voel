import { TabScreenHeader } from '#src/components/tab-screen-header';
import { TabScreenPage } from '#src/components/tab-screen-page';

export default function BooksScreen() {
  return <TabScreenPage header={<TabScreenHeader title="Books" />} />;
}
