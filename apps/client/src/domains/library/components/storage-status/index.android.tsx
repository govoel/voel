import Check from '@expo/material-symbols/check.xml';
import Help from '@expo/material-symbols/help.xml';
import Warning from '@expo/material-symbols/warning.xml';
import { Icon } from '@expo/ui/jetpack-compose';
import { Match } from 'effect';

import { useMaterialColors } from '#src/constants/material.ts';
import type { StorageStatusComponent } from '#src/domains/library/components/storage-status';
import { storageStatusLabel } from '#src/domains/library/management.ts';

export const StorageStatus = (({ status }) => {
  const colors = useMaterialColors();
  return (
    <Icon
      source={Match.value(status).pipe(
        Match.literalsExhaustive({
          healthy: () => Check,
          unknown: () => Help,
          unhealthy: () => Warning,
        })
      )}
      size={20}
      tint={status === 'unhealthy' ? colors.error : colors.onSurfaceVariant}
      contentDescription={storageStatusLabel({ status })}
    />
  );
}) satisfies StorageStatusComponent;
