import { createModifier } from '@expo/ui/swift-ui/modifiers';

export const iosTextStyle = (
  style:
    | 'largeTitle'
    | 'title'
    | 'title2'
    | 'title3'
    | 'headline'
    | 'subheadline'
    | 'body'
    | 'callout'
    | 'footnote'
    | 'caption'
    | 'caption2'
) => createModifier('voelTextStyle', { style });
