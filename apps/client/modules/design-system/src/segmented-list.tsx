import type { PrimitiveBaseProps } from '@expo/ui/jetpack-compose';
import { createViewModifierEventListener } from '@expo/ui/jetpack-compose/modifiers';
import { requireNativeView } from 'expo';
import type { ComponentType, ReactNode } from 'react';
import type { ColorValue } from 'react-native';

export type SegmentedListProps = PrimitiveBaseProps & {
  children?: ReactNode;
};

export interface SegmentedListItemColors {
  containerColor?: ColorValue;
  contentColor?: ColorValue;
  leadingContentColor?: ColorValue;
  trailingContentColor?: ColorValue;
  supportingContentColor?: ColorValue;
  overlineContentColor?: ColorValue;
}

export type SegmentedListItemProps = PrimitiveBaseProps & {
  index: number;
  count: number;
  /** Whether the item is enabled for user interaction. */
  enabled?: boolean;
  selected?: boolean;
  tonalElevation?: number;
  shadowElevation?: number;
  colors?: SegmentedListItemColors;
  onClick?: () => void;
  children?: ReactNode;
};

type NativeSegmentedListItemProps = Omit<SegmentedListItemProps, 'onClick'> &
  Partial<Record<'onSegmentedListItemClick', () => void>>;

interface SlotProps {
  slotName: string;
  children: ReactNode;
}

const NativeSegmentedList = requireNativeView<SegmentedListProps>(
  'VoelDesignSystem',
  'SegmentedList'
);

const NativeSegmentedListItem = requireNativeView<NativeSegmentedListItemProps>(
  'VoelDesignSystem',
  'SegmentedListItem'
);

const SlotNativeView: ComponentType<SlotProps> = requireNativeView('ExpoUI', 'SlotView');

const getModifierProps = ({ modifiers }: { modifiers?: PrimitiveBaseProps['modifiers'] }) =>
  modifiers ? { modifiers, ...createViewModifierEventListener(modifiers) } : {};

const HeadlineContent = (props: { children: ReactNode }) => (
  <SlotNativeView slotName="headlineContent">{props.children}</SlotNativeView>
);

const OverlineContent = (props: { children: ReactNode }) => (
  <SlotNativeView slotName="overlineContent">{props.children}</SlotNativeView>
);

const SupportingContent = (props: { children: ReactNode }) => (
  <SlotNativeView slotName="supportingContent">{props.children}</SlotNativeView>
);

const LeadingContent = (props: { children: ReactNode }) => (
  <SlotNativeView slotName="leadingContent">{props.children}</SlotNativeView>
);

const TrailingContent = (props: { children: ReactNode }) => (
  <SlotNativeView slotName="trailingContent">{props.children}</SlotNativeView>
);

export const SegmentedList = ({ modifiers, ...restProps }: SegmentedListProps) => (
  <NativeSegmentedList {...getModifierProps({ modifiers })} {...restProps} />
);

const SegmentedListItemComponent = ({
  onClick,
  modifiers,
  enabled = true,
  selected = false,
  ...restProps
}: SegmentedListItemProps) => (
  <NativeSegmentedListItem
    {...getModifierProps({ modifiers })}
    {...restProps}
    enabled={enabled}
    selected={selected}
    {...(onClick
      ? {
          onSegmentedListItemClick: () => {
            onClick();
          },
        }
      : {})}
  />
);

SegmentedListItemComponent.HeadlineContent = HeadlineContent;
SegmentedListItemComponent.OverlineContent = OverlineContent;
SegmentedListItemComponent.SupportingContent = SupportingContent;
SegmentedListItemComponent.LeadingContent = LeadingContent;
SegmentedListItemComponent.TrailingContent = TrailingContent;

export const SegmentedListItem = SegmentedListItemComponent;
