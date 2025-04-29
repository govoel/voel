import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Extrapolation,
  ReduceMotion,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

export function Spinner({ size = 10 }: { size?: number }) {
  const offset = useSharedValue(0);
  const offset2 = useSharedValue(0);
  const offset3 = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          offset.value,
          [0, 1],
          [-(size / 1.5), size / 1.5],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));
  const animatedStyle2 = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          offset2.value,
          [0, 1],
          [-size / 1.5, size / 1.5],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));
  const animatedStyle3 = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          offset3.value,
          [0, 1],
          [-size / 1.5, size / 1.5],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  useEffect(() => {
    // eslint-disable-next-line
    offset.value = 0;
    offset2.value = 0;
    offset3.value = 0;

    offset.value = withRepeat(
      withTiming(1, { duration: 500 }),
      -1,
      true,
      () => {},
      ReduceMotion.Never
    );
    offset2.value = withDelay(
      130,
      withRepeat(withTiming(1, { duration: 500 }), -1, true, () => {}, ReduceMotion.Never)
    );
    offset3.value = withDelay(
      260,
      withRepeat(withTiming(1, { duration: 500 }), -1, true, () => {}, ReduceMotion.Never)
    );
  }, [size]);

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
