import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const StatusBarBackground = () => {
  const colorScheme = useColorScheme();
  const { top } = useSafeAreaInsets();

  if (top === 0) {
    return null;
  }

  const gradientColor = colorScheme === 'dark' ? '0, 0, 0' : '255, 255, 255';

  return (
    <LinearGradient
      pointerEvents="none"
      colors={[`rgba(${gradientColor}, 0.72)`, `rgba(${gradientColor}, 0)`]}
      locations={[0, 1]}
      style={{ height: top, position: 'absolute', top: 0, right: 0, left: 0, zIndex: 1000 }}
    />
  );
};
