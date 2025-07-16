The instances schema has two versions, realtime and regular.

Regular is the default schema and is meant for use in the regular application. The types allow for reads only and no writes.

Realtime is the schema used for the client to server synchronization. The types allow for reads and writes.

The instances migration should be 1:1 with the server's schema, except for unique indexes, since we rely on the server to enforce uniqueness. Enforcing uniqueness on the client makes things more complex. Imagine a situation like this:

* Two libraries named `library1` and `library2` exist. Library names are unique.
* A user renames `library1` to `library3`, then renames `library2` to `library1`, then renames `library3` to `library1`. Basically swapping names.
* Now, when another user tries to sync changes, the client will complain about the duplicate library name, even though the end state is consistent, since we don't maintain transaction logs and apply them on the client... the server simply tells the client the current state.
