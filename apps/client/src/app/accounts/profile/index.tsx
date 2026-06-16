import { Group, Host, List, Section } from '@expo/ui/swift-ui';
import { headerProminence } from '@expo/ui/swift-ui/modifiers';

export default function ProfileScreen() {
  return (
    <Host style={{ flex: 1 }}>
      <Group>
        <List modifiers={[headerProminence('increased')]}>
          <Section title="Profile"></Section>
        </List>
      </Group>
    </Host>
  );
}
