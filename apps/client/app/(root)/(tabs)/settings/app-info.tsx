import { applicationId, applicationName } from 'expo-application';
import { StringFormat, setStringAsync } from 'expo-clipboard';
import { Stack } from 'expo-router';
import { manifest, runtimeVersion } from 'expo-updates';
import { View } from 'react-native';
import { toast } from 'sonner-native';

import { FloatingPlayerDodgingScrollView } from '~/components/floating-player';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';
import { Muted } from '~/components/ui/typography';

export default function SettingsAppInfoScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'App Info' }} />
      <FloatingPlayerDodgingScrollView className="gap-y-4">
        <View className="overflow-hidden rounded-md">
          <Button
            variant="ghost"
            size="sm"
            className="native:h-fit h-fit items-start rounded-none border-b border-foreground/15 bg-secondary/40 py-1"
            onPress={async () => {
              await setStringAsync(applicationName ?? 'Unknown', {
                inputFormat: StringFormat.PLAIN_TEXT,
              });
              toast.success('Application name copied to clipboard');
            }}>
            <Muted>Application Name</Muted>
            <Text>{applicationName ?? 'Unknown'}</Text>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="native:h-fit h-fit items-start rounded-none border-b border-foreground/15 bg-secondary/40 py-1"
            onPress={async () => {
              await setStringAsync(applicationId ?? 'Unknown', {
                inputFormat: StringFormat.PLAIN_TEXT,
              });
              toast.success('Application ID copied to clipboard');
            }}>
            <Muted>Application ID</Muted>
            <Text>{applicationId ?? 'Unknown'}</Text>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="native:h-fit h-fit items-start rounded-none border-b border-foreground/15 bg-secondary/40 py-1"
            onPress={async () => {
              await setStringAsync(runtimeVersion ?? 'Unknown', {
                inputFormat: StringFormat.PLAIN_TEXT,
              });
              toast.success('Runtime version copied to clipboard');
            }}>
            <Muted>Runtime Version</Muted>
            <Text>{runtimeVersion ?? 'Unknown'}</Text>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="native:h-fit h-fit items-start rounded-none bg-secondary/40 py-1"
            onPress={async () => {
              await setStringAsync(manifest.id ?? 'Unknown', {
                inputFormat: StringFormat.PLAIN_TEXT,
              });
              toast.success('Manifest ID copied to clipboard');
            }}>
            <Muted>Manifest ID</Muted>
            <Text>{manifest.id ?? 'Unknown'}</Text>
          </Button>
        </View>
      </FloatingPlayerDodgingScrollView>
    </>
  );
}
