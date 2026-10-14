import { TabScreenHeader } from '#src/components/tab-screen-header';
import { TabScreenPage } from '#src/components/tab-screen-page';

export default function HomeScreen() {
  return <TabScreenPage header={<TabScreenHeader title="Home" />} />;
}
