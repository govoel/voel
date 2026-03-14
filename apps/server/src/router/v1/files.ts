import type { Context } from 'hono';
import { NoResultError } from 'kysely';
import mime from 'mime/lite';

import { auth } from '@/libs/auth/auth';
import { db } from '@/libs/db';

export const handler = async (c: Context) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    return c.text('Unauthorized', 401);
  }

  const fileIdParam = c.req.param('id');

  if (!fileIdParam) {
    return c.text('Invalid file ID', 400);
  }

  const fileId = parseInt(fileIdParam, 10);

  if (isNaN(fileId)) {
    return c.text('Invalid file ID', 400);
  }

  const file = await db
    .selectFrom('audiobookFile')
    .where('audiobookFile.id', '=', fileId)
    .where('audiobookFile.deletedAt', 'is', null)
    .innerJoin('book', (join) =>
      join.onRef('book.id', '=', 'audiobookFile.bookId').on('book.deletedAt', 'is', null)
    )
    .select(['audiobookFile.path', 'book.adultsOnly'])
    .limit(1)
    .executeTakeFirstOrThrow()
    .catch((e) => {
      if (e instanceof NoResultError) {
        return { error: 404 };
      }

      throw e;
    });

  if ('error' in file) {
    if (file.error === 404) {
      return c.text('File not found', 404);
    }
    return c.text('Internal server error', 500);
  }

  if (file.adultsOnly && session.user.role === 'under18') {
    return c.text('File not found', 404);
  }

  const rangeHeader = c.req.header('Range');

  const bunFile = Bun.file(file.path);
  const fileSize = bunFile.size;

  if (fileSize === 0) {
    return c.text('File not found', 404);
  }

  if (rangeHeader) {
    const rangeStr = rangeHeader.split('=').at(-1);

    if (!rangeStr) {
      return c.text('Invalid Range header', 400);
    }

    let start = 0;
    let end = Infinity;
    const [startStr, endStr] = rangeStr.split('-');
    if (startStr === '' && typeof endStr === 'string' && endStr !== '') {
      // bytes=-500: The final 500 bytes
      start = Math.max(0, fileSize - parseInt(endStr, 10));
      end = fileSize - 1;
    } else if (typeof startStr === 'string' && startStr !== '' && endStr === '') {
      // bytes=500-: From byte 500 to the end
      start = parseInt(startStr, 10);
      end = fileSize - 1;
    } else if (typeof startStr === 'string' && typeof endStr === 'string') {
      // bytes=500-1000: From byte 500 to byte 1000
      start = parseInt(startStr, 10);
      end = parseInt(endStr, 10);
    }

    if (isNaN(start) || isNaN(end) || start < 0 || end >= fileSize || start > end) {
      return c.text('Invalid Range header', 400);
    }

    return new Response(bunFile.slice(start, end + 1), {
      headers: {
        'accept-ranges': 'bytes',
        'content-type': mime.getType(file.path) ?? 'application/octet-stream',
        'content-range': `bytes ${start}-${end}/${fileSize}`,
        'content-length': (end - start + 1).toString(), // needed because Bun doesn't set content-length on HEAD requests
      },
    });
  }

  return new Response(bunFile, {
    headers: {
      'accept-ranges': 'bytes',
      'content-type': mime.getType(file.path) ?? 'application/octet-stream',
      'content-length': fileSize.toString(), // needed because Bun doesn't set content-length on HEAD requests
    },
  });
};
