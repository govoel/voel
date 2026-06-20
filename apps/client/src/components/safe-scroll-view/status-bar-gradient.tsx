import { LinearGradient } from 'expo-linear-gradient';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const StatusBarGradient = ({ backgroundColor }: { backgroundColor: `#${string}` }) => {
  const { top } = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const colorWithoutAlpha = backgroundColor.slice(0, 7);

  if (headerHeight !== 0) {
    return null;
  }

  return (
    <LinearGradient
      pointerEvents="none"
      colors={[`${colorWithoutAlpha}b8`, `${colorWithoutAlpha}00`]}
      locations={[0, 1]}
      style={{ height: top, position: 'absolute', top: 0, right: 0, left: 0, zIndex: 1000 }}
    />
  );
};
