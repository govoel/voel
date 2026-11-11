import { Icon } from '@expo/ui';
import { accessibilityLabel, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { Match } from 'effect';

import type { StorageStatusComponent } from '#src/domains/library/components/storage-status';
import { storageStatusLabel } from '#src/domains/library/management.ts';

export const StorageStatus = (({ status }) => {
  const appearance = Match.value(status).pipe(
    Match.literalsExhaustive({
      healthy: () => ({
        name: 'checkmark' as const,
        style: { type: 'hierarchical' as const, style: 'secondary' as const },
      }),
      unknown: () => ({
        name: 'questionmark.circle' as const,
        style: { type: 'hierarchical' as const, style: 'secondary' as const },
      }),
      unhealthy: () => ({ name: 'exclamationmark.triangle' as const, style: 'orange' as const }),
    })
  );
  return (
    <Icon
      name={appearance.name}
      modifiers={[
        accessibilityLabel(storageStatusLabel({ status })),
        foregroundStyle(appearance.style),
      ]}
    />
  );
}) satisfies StorageStatusComponent;
