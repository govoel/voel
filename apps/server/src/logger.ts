import { pino } from 'pino';

import { env } from '@/env';

export const logger = pino(
  {
    level: env.LOG_LEVEL,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        messageFormat:
          '{if dir}{dir} {end}{if method}{method} {end}{if path}{path} {end}{if status}{status} {end}{msg}',
        ignore: 'hostname,dir,method,path,status,msg',
      },
    },
  },
  pino.destination({ sync: process.env.NODE_ENV === 'test' })
).child({ pid: 'SRV' });

export const scanLogger = logger.child({ pid: 'SCN' });
