# SolarCore

SolarCore is a powerful plugin for [Kysely](https://github.com/koskimas/kysely) that provides real-time database change tracking and event emission for SQLite databases in [Bun](https://bun.sh). It allows you to easily subscribe to database changes and react accordingly in your application.

## Features

- 🔄 **Real-time database change tracking**: Get notified when data changes in your SQLite database.
- 🧠 **Smart event emission**: Events are only emitted after successful transactions.
- 🛡️ **Type-safe**: Full TypeScript support with your database schema.
- 🔍 **Minimal overhead**: Automatically adds `RETURNING *` to your `INSERT` and `UPDATE` queries to track changes without extra queries (`DELETE` is not supported yet), but preserves the exact format of your original query's results. Whether you use `returning(['id'])`, don't use returning at all, or use column aliases - your query results remain exactly as expected while SolarCore captures the full changed data for events.
## Installation

```bash
bun add @apricotta/solar-core kysely
```

## Usage

### Basic Setup

```typescript
import { Database } from 'bun:sqlite';
import { Kysely } from 'kysely';
import { SolarCore, SolarCoreDialect } from '@apricotta/solar-core';

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

// Create a SolarCore instance
const solarCore = new SolarCore<DB>({
  // Specify which tables to track changes for
  trackTables: new Set(['users', 'posts'])
});

// Create a Kysely instance with SolarCore
const db = new Kysely<DB>({
  dialect: new SolarCoreDialect({
    database: new Database('my-database.sqlite')
  }),
  plugins: [solarCore],
  log(event) {
    // Allows SolarCore to detect and work with transactions
    solarCore.transactionDetector(event);
  }
});

// Subscribe to database changes
solarCore.events.on('update', (payload) => {
  console.log(`Table ${payload.table} was updated with:`, payload.rows);
  // Do something with the updated data
});
```

### Query Example

```typescript
// When you run queries, SolarCore will automatically track changes
await db.insertInto('users')
  .values({ name: 'John Doe', email: 'john@example.com' })
  .execute();
// The 'update' event will be emitted with the new user data

// Works with all kinds of inserts and updates
await db.updateTable('users')
  .set({ name: 'Jane Doe' })
  .where('id', '=', 1)
  .execute();
// The 'update' event will be emitted with the updated user data
```

### Transaction Support

```typescript
await db.transaction().execute(async (trx) => {
  // Run multiple queries in a transaction
  await trx.insertInto('users')
    .values({ name: 'Alice', email: 'alice@example.com' })
    .execute();

  await trx.insertInto('posts')
    .values({
      title: 'Hello World',
      content: 'First post!',
      userId: 1
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

### `SolarCore`

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

### `SolarCoreDialect`

A custom Kysely dialect for SQLite in Bun.

#### Constructor

```typescript
constructor(config: SolarCoreDialectConfig)
```

- `config.database`: A Bun SQLite Database instance
- `config.onCreateConnection?`: Optional callback called when the first connection is created

## How It Works

SolarCore works by transforming your `INSERT` and `UPDATE` queries to include `RETURNING *` statements, allowing it to capture the affected rows. It then emits events with this data when queries are executed or transactions are committed.

For transactions, SolarCore buffers events until the transaction is successfully committed, ensuring that events are only emitted for changes that were actually persisted to the database.
