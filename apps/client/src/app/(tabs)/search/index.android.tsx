import Search from '@expo/material-symbols/search.xml';
import { Column, DockedSearchBar, Icon } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';

import { TabScreenPage } from '#src/components/tab-screen-page';
import { Text } from '#src/components/text';

export default function SearchScreen() {
  return (
    <TabScreenPage>
      <Column>
        <DockedSearchBar modifiers={[fillMaxWidth()]}>
          <DockedSearchBar.Placeholder>
            <Text>Search...</Text>
          </DockedSearchBar.Placeholder>
          <DockedSearchBar.LeadingIcon>
            <Icon source={Search} contentDescription="Search" />
          </DockedSearchBar.LeadingIcon>
        </DockedSearchBar>
      </Column>
    </TabScreenPage>
  );
}
