import { HttpApi } from 'effect/http-api';

import { LibraryApi } from '#src/domains/library/http.ts';

export const Api = HttpApi.make('Api').add(LibraryApi);
