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
  const appearance = Match.value(status).pipe(
    Match.literalsExhaustive({
      healthy: () => ({ source: Check, tint: colors.onSurfaceVariant }),
      unknown: () => ({ source: Help, tint: colors.onSurfaceVariant }),
      unhealthy: () => ({ source: Warning, tint: colors.error }),
    })
  );
  return <Icon {...appearance} size={20} contentDescription={storageStatusLabel({ status })} />;
}) satisfies StorageStatusComponent;
