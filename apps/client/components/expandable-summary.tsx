import * as CollapsiblePrimitive from '@rn-primitives/collapsible';
import { useState } from 'react';
import { useMarkdown } from 'react-native-marked';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { renderer } from '~/components/markdown-renderer';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';

/**
 * Collapsible summary component with markdown rendering support.
 *
 * Renders markdown content with expand/collapse functionality. Shows only the
 * first element initially, with a button to reveal the rest. Automatically
 * returns simple content if there's only one element to show.
 *
 * @param summary - Markdown content to display and expand
 * @param expandText - Text for the expand button
 * @param collapseText - Text for the collapse button
 *
 * @example
 * ```tsx
 * <ExpandableSummary
 *   summary="# Title\n\nThis is a long summary with multiple paragraphs..."
 *   expandText="Show More"
 *   collapseText="Show Less"
 * />
 * ```
 */
export function ExpandableSummary({
  summary,
  expandText,
  collapseText,
}: {
  summary: string;
  expandText: string;
  collapseText: string;
}) {
  const summaryElements = useMarkdown(summary, { renderer });
  const [open, setOpen] = useState(false);

  if (summaryElements.length <= 1) {
    return summaryElements;
  }

  return (
    <CollapsiblePrimitive.Root asChild open={open} onOpenChange={setOpen}>
      <Animated.View>
        {summaryElements[0]}
        <CollapsiblePrimitive.Content>
          {summaryElements.map((child, i) =>
            i === 0 ? null : (
              <Animated.View key={`summary-${i}`} entering={FadeInUp.duration(300)}>
                {child}
              </Animated.View>
            )
          )}
        </CollapsiblePrimitive.Content>
        <CollapsiblePrimitive.Trigger asChild>
          <Button size="sm" variant="outline">
            <Text>{open ? collapseText : expandText}</Text>
          </Button>
        </CollapsiblePrimitive.Trigger>
      </Animated.View>
    </CollapsiblePrimitive.Root>
  );
}
