import { TabScreenHeader } from '#src/components/tab-screen-header';
import { TabScreenPage } from '#src/components/tab-screen-page';

export default function ShowsScreen() {
  return <TabScreenPage header={<TabScreenHeader title="Shows" />} />;
}
