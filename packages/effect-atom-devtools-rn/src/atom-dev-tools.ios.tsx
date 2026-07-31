import {
  BottomSheet,
  Button,
  ContentUnavailableView,
  Divider,
  Group,
  HStack,
  Host,
  Image,
  List,
  ProgressView,
  Section,
  Spacer,
  Text,
  VStack,
} from '@expo/ui/swift-ui';
import {
  accessibilityHint,
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  contentShape,
  controlSize,
  font,
  foregroundStyle,
  frame,
  labelStyle,
  lineLimit,
  listStyle,
  multilineTextAlignment,
  padding,
  presentationDetents,
  presentationDragIndicator,
  shadow,
  shapes,
} from '@expo/ui/swift-ui/modifiers';

import type { AtomId, AtomSnapshot, AtomSummary } from '@repo/atom-devtools-core';

import type { AtomDevToolsController, AtomDevToolsProps } from './use-atom-dev-tools.ts';
import { useAtomDevTools } from './use-atom-dev-tools.ts';

export type { AtomDevToolsProps } from './use-atom-dev-tools.ts';

const secondary = foregroundStyle({ type: 'hierarchical', style: 'secondary' });
const fullWidth = frame({ maxWidth: Infinity, alignment: 'leading' });
const tappableRow = [buttonStyle('plain'), fullWidth];
type StateId = AtomSnapshot['states'][number]['id'];

const atomIcon = (atom: AtomSummary) => {
  if (atom.writable) {
    return atom.overridden ? 'pencil.circle.fill' : 'pencil';
  }
  return atom.overridden ? 'eye.fill' : 'eye';
};

const SheetHeader = ({ devTools }: { readonly devTools: AtomDevToolsController }) => (
  <>
    <HStack
      alignment="center"
      spacing={10}
      modifiers={[padding({ horizontal: 16, vertical: 10 }), frame({ maxWidth: Infinity })]}>
      {devTools.selectedId === void 0 ? null : (
        <Button
          label="Back"
          systemImage="chevron.left"
          onPress={() => {
            devTools.selectAtom(void 0);
          }}
          modifiers={[
            labelStyle('iconOnly'),
            buttonStyle('borderless'),
            accessibilityLabel('Back'),
          ]}
        />
      )}
      <Text modifiers={[font({ textStyle: 'headline', weight: 'semibold' }), lineLimit(1)]}>
        {devTools.snapshot?.name ??
          (devTools.selectedId === void 0 ? 'Atom states' : 'Atom details')}
      </Text>
      <Spacer />
    </HStack>
    <Divider />
  </>
);

const CatalogRow = ({
  atom,
  onPress,
}: {
  readonly atom: AtomSummary;
  readonly onPress: (atomId: AtomId) => void;
}) => (
  <Button
    onPress={() => {
      onPress(atom.id);
    }}
    modifiers={[
      ...tappableRow,
      accessibilityLabel(
        `${atom.name}, ${atom.writable ? 'writable' : 'read-only'}${atom.overridden ? ', overridden' : ''}`
      ),
      accessibilityHint('Shows predefined states for this atom'),
    ]}>
    <HStack spacing={12} modifiers={[fullWidth, contentShape(shapes.rectangle())]}>
      <Image systemName={atomIcon(atom)} size={17} modifiers={[secondary]} />
      <Text modifiers={[lineLimit(1)]}>{atom.name}</Text>
      <Spacer />
      <Image systemName="chevron.right" size={13} modifiers={[secondary]} />
    </HStack>
  </Button>
);

const Catalog = ({ devTools }: { readonly devTools: AtomDevToolsController }) => (
  <List modifiers={[listStyle('insetGrouped'), frame({ maxHeight: Infinity })]}>
    <Section footer={<Text>Removes every state override and restores normal atom behavior.</Text>}>
      <Button
        label="Clear All Forced States"
        systemImage="arrow.counterclockwise.circle"
        onPress={devTools.clearAllStates}
      />
    </Section>
    {devTools.catalog.length === 0 ? (
      <ContentUnavailableView
        title="No atoms discovered"
        systemImage="atom"
        description="Atoms appear here after the app uses them."
      />
    ) : (
      <Section title={`${devTools.catalog.length} discovered`}>
        {devTools.catalog.map((atom) => (
          <CatalogRow key={atom.id} atom={atom} onPress={devTools.selectAtom} />
        ))}
      </Section>
    )}
  </List>
);

const StateRow = ({
  active,
  atomId,
  description,
  label,
  onPress,
  stateId,
}: {
  readonly active: boolean;
  readonly atomId: AtomId;
  readonly description: string | undefined;
  readonly label: string;
  readonly onPress: (atomId: AtomId, stateId: StateId) => void;
  readonly stateId: StateId;
}) => (
  <Button
    onPress={() => {
      onPress(atomId, stateId);
    }}
    modifiers={[...tappableRow, accessibilityLabel(`${label}${active ? ', active' : ''}`)]}>
    <HStack spacing={12} modifiers={[fullWidth, contentShape(shapes.rectangle())]}>
      <VStack alignment="leading" spacing={2}>
        <Text>{label}</Text>
        {description === void 0 ? null : (
          <Text modifiers={[font({ textStyle: 'caption' }), secondary, lineLimit(2)]}>
            {description}
          </Text>
        )}
      </VStack>
      <Spacer />
      {active ? <Image systemName="checkmark.circle.fill" size={18} /> : null}
    </HStack>
  </Button>
);

const SnapshotDetails = ({
  devTools,
  snapshot,
}: {
  readonly devTools: AtomDevToolsController;
  readonly snapshot: AtomSnapshot;
}) => (
  <List modifiers={[listStyle('insetGrouped'), frame({ maxHeight: Infinity })]}>
    <Section title="Predefined states">
      {snapshot.states.length === 0 ? (
        <HStack spacing={12}>
          <Image systemName="switch.2" size={17} modifiers={[secondary]} />
          <Text modifiers={[secondary]}>No predefined states</Text>
        </HStack>
      ) : (
        snapshot.states.map((state) => (
          <StateRow
            key={state.id}
            active={snapshot.activeStateId === state.id}
            atomId={snapshot.id}
            description={state.description}
            label={state.label}
            onPress={devTools.activateState}
            stateId={state.id}
          />
        ))
      )}
      {snapshot.activeStateId === void 0 ? null : (
        <Button
          label="Clear Forced State"
          systemImage="xmark.circle"
          role="destructive"
          onPress={() => {
            devTools.clearState(snapshot.id);
          }}
        />
      )}
    </Section>
    <Section>
      <Button
        label="Refresh Atom"
        systemImage="arrow.clockwise"
        onPress={() => {
          devTools.refresh(snapshot.id);
        }}
      />
    </Section>
    <Section title="Current value">
      <Text
        modifiers={[
          font({ textStyle: 'caption', design: 'monospaced' }),
          multilineTextAlignment('leading'),
        ]}>
        {devTools.preview ?? 'undefined'}
      </Text>
    </Section>
  </List>
);

const SheetContent = ({ devTools }: { readonly devTools: AtomDevToolsController }) => (
  <VStack spacing={0} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity })]}>
    <SheetHeader devTools={devTools} />
    {devTools.selectedId === void 0 ? <Catalog devTools={devTools} /> : null}
    {devTools.selectedId !== void 0 && devTools.snapshot === void 0 ? (
      <VStack
        spacing={12}
        modifiers={[padding({ all: 32 }), frame({ maxWidth: Infinity, maxHeight: Infinity })]}>
        <ProgressView />
        <Text modifiers={[secondary]}>Loading atom…</Text>
      </VStack>
    ) : null}
    {devTools.selectedId !== void 0 && devTools.snapshot !== void 0 ? (
      <SnapshotDetails devTools={devTools} snapshot={devTools.snapshot} />
    ) : null}
  </VStack>
);

export const AtomDevTools = (props: AtomDevToolsProps) => {
  const devTools = useAtomDevTools(props);

  return (
    <>
      <Host matchContents style={{ position: 'absolute', right: 16, bottom: 100, zIndex: 1000 }}>
        <Button
          label={devTools.buttonLabel}
          systemImage="atom"
          onPress={devTools.present}
          modifiers={[
            labelStyle('iconOnly'),
            buttonStyle('borderedProminent'),
            buttonBorderShape('circle'),
            controlSize('large'),
            accessibilityLabel(devTools.buttonLabel),
            accessibilityHint('Opens Effect Atom Devtools'),
            shadow({ radius: 5, y: 2, color: '#00000033' }),
          ]}
        />
      </Host>

      <Host style={{ position: 'absolute' }} pointerEvents="none">
        <BottomSheet
          isPresented={devTools.isPresented}
          onIsPresentedChange={(isPresented) => {
            if (!isPresented) {
              devTools.dismiss();
            }
          }}>
          <Group
            modifiers={[
              presentationDetents([{ fraction: 0.15 }, 'medium'], { selection: 'medium' }),
              presentationDragIndicator('visible'),
            ]}>
            <SheetContent devTools={devTools} />
          </Group>
        </BottomSheet>
      </Host>
    </>
  );
};
