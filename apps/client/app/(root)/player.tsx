import { useRouter } from 'expo-router';

import { BottomSheet } from '~/components/ui/bottom-sheet';
import { Text } from '~/components/ui/text';

export default function PlayerScreen() {
  const router = useRouter();

  return (
    <BottomSheet
      enableDynamicSizing={false}
      snapPoints={['75%']}
      onChange={(i) => {
        if (i === -1) {
          router.back();
        }
      }}>
      <Text>Hello</Text>
    </BottomSheet>
  );
}
