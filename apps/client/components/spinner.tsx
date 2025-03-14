import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

export function Spinner({ size = 10 }: { size?: number }) {
  const offset = useSharedValue(size / 1.5);
  const offset2 = useSharedValue(size / 1.5);
  const offset3 = useSharedValue(size / 1.5);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  const animatedStyle2 = useAnimatedStyle(() => ({ transform: [{ translateY: offset2.value }] }));
  const animatedStyle3 = useAnimatedStyle(() => ({ transform: [{ translateY: offset3.value }] }));

  useEffect(() => {
    // eslint-disable-next-line
    offset.value = withRepeat(
      withTiming(-offset.value, { duration: 500 }),
      -1,
      true,
      () => {},
      ReduceMotion.Never
    );
    offset2.value = withDelay(
      130,
      withRepeat(
        withTiming(-offset2.value, { duration: 500 }),
        -1,
        true,
        () => {},
        ReduceMotion.Never
      )
    );
    offset3.value = withDelay(
      260,
      withRepeat(
        withTiming(-offset3.value, { duration: 500 }),
        -1,
        true,
        () => {},
        ReduceMotion.Never
      )
    );
  });

  return (
    <View className="flex-row gap-2">
      <Animated.View
        className="bg-foreground"
        style={[
          {
            height: size,
            width: size,
            borderRadius: size / 2,
          },
          animatedStyle,
        ]}
      />
      <Animated.View
        className="bg-foreground"
        style={[
          {
            height: size,
            width: size,
            borderRadius: size / 2,
          },
          animatedStyle2,
        ]}
      />
      <Animated.View
        className="bg-foreground"
        style={[
          {
            height: size,
            width: size,
            borderRadius: size / 2,
          },
          animatedStyle3,
        ]}
      />
    </View>
  );
}
