import { HttpApi } from 'effect/http-api';

import { LibraryApi } from '#src/groups/library.ts';

export const Api = HttpApi.make('Api').add(LibraryApi);
