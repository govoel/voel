import { TRPCError } from '@trpc/server';
import { schemas } from '@voel/schemas';
import { NoResultError } from 'kysely';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { getLibraryActor } from '@/router/v1/library/machine';

import { db, isSQLiteError } from '@/libs/db';

import { env } from '@/env';
import { adminProcedure, createTRPCRouter } from '@/trpc';

export const libraryRouter = createTRPCRouter({
  create: adminProcedure.input(schemas.v1.library.create).mutation(async ({ input }) => {
    const library = await db
      .insertInto('library')
      .values({ name: input.name })
      .returning([
        'id as id',
        'name as name',
        'createdAt as createdAt',
        'updatedAt as updatedAt',
        'deletedAt as deletedAt',
      ])
      .executeTakeFirstOrThrow()
      .catch((err: Error) => {
        if (isSQLiteError(err) && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'A library with this name already exists.',
          });
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `An error occurred while creating the library: ${err.message}. Please try again later.`,
        });
      });

    const importPath = join(env.IMPORT_PATH, library.name);
    await mkdir(importPath, { recursive: true, mode: 0o770 }).catch((err: Error) => {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `An error occurred while creating the library import path: ${err.message}. Please try again later.`,
      });
    });

    return library;
  }),
  scan: adminProcedure.input(schemas.v1.library.scan).mutation(async ({ input }) => {
    const library = await db
      .selectFrom('library')
      .where('id', '=', input.id)
      .select(['id', 'name'])
      .executeTakeFirstOrThrow()
      .catch((err) => {
        if (err instanceof NoResultError) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Library with ID ${input.id} could not be found.`,
          });
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `An error occurred while scanning the library: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again later.`,
        });
      });

    try {
      const actor = getLibraryActor(library.id, library.name);

      if (actor.getSnapshot().can({ type: 'scan' })) {
        actor.send({ type: 'scan' });
        return {
          message: 'Library scan has been queued.',
        };
      } else {
        return {
          message: 'A library scanning is already in progress.',
        };
      }
    } catch (err) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `An error occurred while scanning the library: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again later.`,
      });
    }
  }),
});
