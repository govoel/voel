import Search from '@expo/material-symbols/search.xml';
import { Column, DockedSearchBar, Icon } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';

import { SafeScrollView } from '#src/components/safe-scroll-view/index.tsx';
import { Text } from '#src/components/text/index.tsx';

export default function SearchScreen() {
  return (
    <SafeScrollView>
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
    </SafeScrollView>
  );
}
