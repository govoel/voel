import { String } from 'effect';
import { LinearGradient } from 'expo-linear-gradient';

export const StatusBarGradient = ({
  backgroundColor,
  height,
  visible,
}: {
  readonly backgroundColor: `#${string}`;
  readonly height: number;
  readonly visible: boolean;
}) => {
  if (!visible) {
    return null;
  }

  const colorWithoutAlpha = String.slice(0, 7)(backgroundColor);

  return (
    <LinearGradient
      pointerEvents="none"
      colors={[`${colorWithoutAlpha}b8`, `${colorWithoutAlpha}00`]}
      locations={[0, 1]}
      style={{ height, position: 'absolute', top: 0, right: 0, left: 0, zIndex: 1000 }}
    />
  );
};
