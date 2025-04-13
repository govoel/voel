# SourceTap

SourceTap is a powerful plugin for [Kysely](https://github.com/kysely-org/kysely) that provides real-time database change tracking and event emission for SQLite databases in [Bun](https://bun.sh). It allows you to easily subscribe to database changes and react accordingly in your application.

## Features

- 🔄 **Real-time database change tracking**: Get notified when data changes in your SQLite database.
- 🧠 **Smart event emission**: Events are only emitted after successful transactions.
- 🛡️ **Type-safe**: Full TypeScript support with your database schema.
- 🔍 **Minimal overhead**: Automatically adds `RETURNING *` to your `INSERT` and `UPDATE` queries to track changes without extra queries (`DELETE` is not supported yet), but preserves the exact format of your original query's results. Whether you use `returning(['id'])`, don't use returning at all, or use column aliases - your query results remain exactly as expected while SourceTap captures the full changed data for events.

> [!NOTE]
> SourceTap does not support `DELETE` queries, savepoints, and nested transactions.

## Installation

```bash
bun add @apricotta/source-tap kysely
```

## Usage

### Basic Setup

```typescript
import { SourceTap, SourceTapDialect } from '@apricotta/source-tap';
import { Database } from 'bun:sqlite';
import { Kysely } from 'kysely';

// Define your database schema
interface DB {
  users: {
    id: number;
    name: string;
    email: string;
  };
  posts: {
    id: number;
    title: string;
    content: string;
    userId: number;
  };
}

// Create a SourceTap instance
const sourceTap = new SourceTap<DB>({
  // Specify which tables to track changes for
  trackTables: new Set(['users', 'posts']),
});

// Create a Kysely instance with SourceTap
const db = new Kysely<DB>({
  dialect: new SourceTapDialect({
    database: new Database('my-database.sqlite'),
  }),
  plugins: [sourceTap],
  log(event) {
    // Allows SourceTap to detect and work with transactions
    sourceTap.transactionDetector(event);
  },
});

// Subscribe to database changes
sourceTap.events.on('update', (payload) => {
  console.log(`Table ${payload.table} was updated with:`, payload.rows);
  // Do something with the updated data
});
```

### Query Example

```typescript
// When you run queries, SourceTap will automatically track changes
await db.insertInto('users').values({ name: 'John Doe', email: 'john@example.com' }).execute();
// The 'update' event will be emitted with the new user data

// Works with all kinds of inserts and updates
await db.updateTable('users').set({ name: 'Jane Doe' }).where('id', '=', 1).execute();
// The 'update' event will be emitted with the updated user data
```

### Transaction Support

```typescript
await db.transaction().execute(async (trx) => {
  // Run multiple queries in a transaction
  await trx.insertInto('users').values({ name: 'Alice', email: 'alice@example.com' }).execute();

  await trx
    .insertInto('posts')
    .values({
      title: 'Hello World',
      content: 'First post!',
      userId: 1,
    })
    .execute();

  // Events are not emitted until the transaction is committed
});
// After successful commit, events for both users and posts will be emitted

// If a transaction is rolled back, no events are emitted
try {
  await db.transaction().execute(async (trx) => {
    // Run queries...
    throw new Error('Something went wrong');
  });
} catch (error) {
  // No events are emitted since the transaction was rolled back
}
```

## API Reference

### `SourceTap`

The main class that implements the Kysely plugin interface and provides event emission.

#### Constructor

```typescript
constructor(opts: { trackTables: Set<string> })
```

- `trackTables`: A Set containing the names of tables to track changes for

#### Properties

- `events`: An EventEmitter instance that emits 'update' events

#### Methods

- `transactionDetector(event: LogEvent)`: Used internally to detect transaction events

### `SourceTapDialect`

A custom Kysely dialect for SQLite in Bun.

#### Constructor

```typescript
constructor(config: SourceTapDialectConfig)
```

- `config.database`: A Bun SQLite Database instance
- `config.onCreateConnection?`: Optional callback called when the first connection is created

## How It Works

SourceTap works by transforming your `INSERT` and `UPDATE` queries to include `RETURNING *` statements, allowing it to capture the affected rows. It then emits events with this data when queries are executed or transactions are committed.

For transactions, SourceTap buffers events until the transaction is successfully committed, ensuring that events are only emitted for changes that were actually persisted to the database.
