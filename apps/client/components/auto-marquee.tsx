import { memo, useState } from 'react';
import { StyleSheet, TextStyle, View, type ViewStyle } from 'react-native';
import Animated, {
  type SharedValue,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';

import { Text } from '~/components/ui/text';

import { cn } from '~/lib/utils';

const AnimatedChild = ({
  index,
  children,
  anim,
  textWidth,
  spacing,
}: React.PropsWithChildren<{
  index: number;
  anim: SharedValue<number>;
  textWidth: SharedValue<number>;
  spacing: number;
}>) => {
  const stylez = useAnimatedStyle(() => {
    return {
      position: 'absolute',
      width: textWidth.value + spacing,
      alignSelf: 'flex-start',
      left: index * (textWidth.value + spacing),
      transform: [
        {
          translateX: -(anim.value % (textWidth.value + spacing)),
        },
      ],
    };
  }, [index, spacing, textWidth]);
  return <Animated.View style={stylez}>{children}</Animated.View>;
};

export type MarqueeProps = React.PropsWithChildren<{
  speed?: number;
  spacing?: number;
  style?: ViewStyle;
}>;

/**
 * Used to animate the given children in a horizontal manner.
 */
export const Marquee = memo(({ speed = 1, children, spacing = 0, style }: MarqueeProps) => {
  const parentWidth = useSharedValue(0);
  const textWidth = useSharedValue(0);
  const [cloneTimes, setCloneTimes] = useState(0);
  const anim = useSharedValue(0);

  useFrameCallback(() => {
    anim.value += speed;
  }, true);

  useAnimatedReaction(
    () => {
      if (textWidth.value === 0 || parentWidth.value === 0) {
        return 0;
      }
      return Math.round(parentWidth.value / textWidth.value) + 1;
    },
    (v) => {
      if (v === 0) {
        return;
      }
      // This is going to cover the case when the text/element size
      // is greater than the actual parent size
      // Double this to cover the entire screen twice, in this way we can
      // reset the position of the first element when its going to move out
      // of the screen without any noticible glitch
      runOnJS(setCloneTimes)(v * 2);
    },
    []
  );
  return (
    <Animated.View
      style={style}
      onLayout={(ev) => {
        parentWidth.value = ev.nativeEvent.layout.width;
      }}
      pointerEvents="box-none">
      <Animated.View style={styles.row} pointerEvents="box-none">
        {
          // We are adding the text inside a ScrollView because in this way we
          // ensure that its not going to "wrap".
        }
        <Animated.ScrollView horizontal style={styles.hidden} pointerEvents="box-none">
          <View
            onLayout={(ev) => {
              textWidth.value = ev.nativeEvent.layout.width;
            }}>
            {children}
          </View>
        </Animated.ScrollView>
        {cloneTimes > 0 &&
          [...Array(cloneTimes).keys()].map((index) => {
            return (
              <AnimatedChild
                key={`clone-${index}`}
                index={index}
                anim={anim}
                textWidth={textWidth}
                spacing={spacing}>
                {children}
              </AnimatedChild>
            );
          })}
      </Animated.View>
    </Animated.View>
  );
});
Marquee.displayName = 'Marquee';

const styles = StyleSheet.create({
  hidden: { opacity: 0, zIndex: -9999 },
  row: { flexDirection: 'row', overflow: 'hidden' },
});

export const AutoMarquee = memo(
  (
    props: Omit<MarqueeProps, 'style'> & {
      className?: string;
      style?: TextStyle;
    }
  ) => {
    const [textWidth, setTextWidth] = useState(0);
    const [textLines, setTextLines] = useState(1);
    const [viewWidth, setViewWidth] = useState(0);

    return (
      <View
        className={cn('w-full', props.className)}
        onLayout={(e) => setViewWidth(e.nativeEvent.layout.width)}>
        <View
          style={{ height: 0, alignSelf: 'flex-start' }}
          onLayout={(e) => {
            setTextWidth(e.nativeEvent.layout.width);
          }}>
          <Text
            onTextLayout={(e) => {
              setTextLines(e.nativeEvent.lines.length);
            }}>
            {props.children}
          </Text>
        </View>
        {textWidth < viewWidth && textLines <= 1 ? (
          props.children
        ) : (
          <Marquee {...{ ...props, style: undefined, children: undefined, textWidth }}>
            <Text>{props.children}</Text>
          </Marquee>
        )}
      </View>
    );
  }
);
AutoMarquee.displayName = 'AutoMarquee';
