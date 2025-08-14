import { pino } from 'pino';
import pretty from 'pino-pretty';

import { env } from '@/env';

export const logger = pino(
  {
    level: env.LOG_LEVEL,
  },
  pretty({
    colorize: true,
    messageFormat:
      '{if dir}{dir} {end}{if method}{method} {end}{if path}{path} {end}{if status}{status} {end}{msg}',
    ignore: 'hostname,dir,method,path,status,msg',
    sync: process.env.NODE_ENV === 'test',
  })
).child({ pid: 'SRV' });

export const scanLogger = logger.child({ pid: 'SCN' });
