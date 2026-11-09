import { Icon } from '@expo/ui';
import { accessibilityLabel, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { Match } from 'effect';

import type { StorageStatusComponent } from '#src/domains/library/components/storage-status';
import { storageStatusLabel } from '#src/domains/library/management.ts';

export const StorageStatus = (({ status }) => (
  <Icon
    name={Match.value(status).pipe(
      Match.literalsExhaustive({
        healthy: () => 'checkmark' as const,
        unknown: () => 'questionmark.circle' as const,
        unhealthy: () => 'exclamationmark.triangle' as const,
      })
    )}
    modifiers={[
      accessibilityLabel(storageStatusLabel({ status })),
      foregroundStyle(
        status === 'unhealthy' ? 'orange' : { type: 'hierarchical', style: 'secondary' }
      ),
    ]}
  />
)) satisfies StorageStatusComponent;
