import {
  BottomSheet,
  Button,
  Column,
  Host,
  Icon,
  List,
  ListItem,
  Row,
  Spacer,
  Text,
} from '@expo/ui';

import type { AtomDevToolsProps } from './use-atom-dev-tools.ts';
import { useAtomDevTools } from './use-atom-dev-tools.ts';

export type { AtomDevToolsProps } from './use-atom-dev-tools.ts';

const atomIcons = {
  readOnly: Icon.select({
    ios: 'eye',
    android: import('@expo/material-symbols/visibility.xml'),
  }),
  readOnlyOverridden: Icon.select({
    ios: 'eye.fill',
    android: import('@expo/material-symbols/visibility_lock.xml'),
  }),
  writable: Icon.select({
    ios: 'pencil',
    android: import('@expo/material-symbols/edit.xml'),
  }),
  writableOverridden: Icon.select({
    ios: 'pencil.circle.fill',
    android: import('@expo/material-symbols/edit_square.xml'),
  }),
} as const;

const atomIcon = (writable: boolean, overridden: boolean) => {
  if (writable) {
    return overridden ? atomIcons.writableOverridden : atomIcons.writable;
  }
  return overridden ? atomIcons.readOnlyOverridden : atomIcons.readOnly;
};

export const AtomDevTools = (props: AtomDevToolsProps) => {
  const devTools = useAtomDevTools(props);
  const { catalog, isPresented, preview, selectedId, snapshot } = devTools;

  return (
    <>
      <Host matchContents style={{ position: 'absolute', right: 16, bottom: 16, zIndex: 1000 }}>
        <Button label={devTools.buttonLabel} onPress={devTools.present} />
      </Host>

      <BottomSheet isPresented={isPresented} onDismiss={devTools.dismiss} snapPoints={['full']}>
        <Column spacing={12} style={{ width: '100%' }}>
          <Row alignment="center" spacing={8} style={{ width: '100%' }}>
            {selectedId === void 0 ? null : (
              <Button
                label="Back"
                variant="outlined"
                onPress={() => {
                  devTools.selectAtom(void 0);
                }}
              />
            )}
            <Text textStyle={{ fontSize: 20, fontWeight: '700' }}>
              {snapshot?.name ?? 'Atom states'}
            </Text>
            <Spacer flexible />
            <Button label="Close" variant="outlined" onPress={devTools.dismiss} />
          </Row>

          {selectedId === void 0 && (
            <List>
              <ListItem
                onPress={() => {
                  devTools.clearAllStates();
                }}
                supportingText="Restore every atom to its normal state">
                Clear all forced states
              </ListItem>
              {catalog.map((atom) => (
                <ListItem
                  key={atom.id}
                  onPress={() => {
                    devTools.selectAtom(atom.id);
                  }}
                  leading={
                    <Icon
                      name={atomIcon(atom.writable, atom.overridden)}
                      size={18}
                      accessibilityLabel={`${atom.writable ? 'Writable' : 'Read-only'} atom${atom.overridden ? ', overridden' : ''}`}
                    />
                  }>
                  {atom.name}
                </ListItem>
              ))}
              {catalog.length === 0 ? (
                <ListItem supportingText="Atoms appear here after the app uses them">
                  No atoms discovered
                </ListItem>
              ) : null}
            </List>
          )}
          {selectedId !== void 0 && snapshot === void 0 && <Text>Loading atom…</Text>}
          {selectedId !== void 0 && snapshot !== void 0 && (
            <List>
              {snapshot.states.map((state) => (
                <ListItem
                  key={state.id}
                  onPress={() => {
                    devTools.activateState(snapshot.id, state.id);
                  }}
                  supportingText={state.description}
                  trailing={snapshot.activeStateId === state.id ? 'Active' : void 0}>
                  {state.label}
                </ListItem>
              ))}
              {snapshot.states.length === 0 ? <ListItem>No predefined states</ListItem> : null}
              {snapshot.activeStateId === void 0 ? null : (
                <ListItem
                  onPress={() => {
                    devTools.clearState(snapshot.id);
                  }}
                  supportingText={`Active: ${snapshot.activeStateId}`}>
                  Clear forced state
                </ListItem>
              )}
              <ListItem
                onPress={() => {
                  devTools.refresh(snapshot.id);
                }}>
                Refresh atom
              </ListItem>
              <ListItem supportingText={preview ?? 'undefined'}>Current value</ListItem>
            </List>
          )}
        </Column>
      </BottomSheet>
    </>
  );
};
