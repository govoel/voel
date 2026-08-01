import type { Database as BunSqliteDatabase } from 'bun:sqlite';

import { Data, Effect, PubSub, Stream } from 'effect';

import {
  AliasNode,
  ColumnNode,
  DeleteQueryNode,
  IdentifierNode,
  InsertQueryNode,
  OperationNodeTransformer,
  ReferenceNode,
  ReturningNode,
  SelectAllNode,
  SelectionNode,
  TableNode,
  UpdateQueryNode,
} from '@repo/effect-kysely';
import type {
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryResult,
  RootOperationNode,
  Selectable,
  UnknownRow,
} from '@repo/effect-kysely';

import { SourceTapSyncState } from '#src/sync-state.ts';

type SourceTapQueryId =
  PluginTransformQueryArgs['queryId'] extends PluginTransformResultArgs['queryId']
    ? PluginTransformQueryArgs['queryId']
    : never;

interface SourceTapQueryState<TableName extends string = string> {
  table: TableName;
  queryType: 'insert' | 'update';
  originalReturning: Set<string>;
  originalReturningAlias: Set<string>;
}

export class SourceTapUpdate<DB, Table extends keyof DB = keyof DB> extends Data.TaggedClass(
  'SourceTapUpdate'
)<{
  readonly operation: 'insert' | 'update';
  readonly table: Table;
  readonly rows: readonly Selectable<DB[Table]>[];
}> {}

/**
 * Indicates that an incremental update can no longer bring a client up to date.
 *
 * A delete can also remove rows through foreign-key cascades or triggers, which
 * are not visible to a Kysely plugin. Consumers must therefore discard their
 * local snapshot and perform a full sync when they receive this event.
 */
export class SourceTapFullSync extends Data.TaggedClass('SourceTapFullSync')<{
  /** The persistent sync token after the delete was committed. */
  readonly syncToken: string;
}> {}

export type SourceTapEvent<DB> = SourceTapUpdate<DB> | SourceTapFullSync;

export class SourceTap<DB> implements KyselyPlugin {
  public readonly updates: Stream.Stream<SourceTapEvent<DB>>;

  #inTransaction: boolean;
  #transactionEvents: SourceTapEvent<DB>[];
  #transactionRequiresFullSync: boolean;

  #committedSyncToken: string;
  #observedSyncToken: string;

  readonly #pubsub: PubSub.PubSub<SourceTapEvent<DB>>;
  readonly #trackTables: ReadonlySet<keyof DB>;
  readonly #syncState: SourceTapSyncState;

  readonly #transformer: SourceTapTransformer<Extract<keyof DB, string>>;
  readonly #transformerVars: Map<'currentQueryId', SourceTapQueryId>;
  readonly #queryState: WeakMap<SourceTapQueryId, SourceTapQueryState<Extract<keyof DB, string>>>;

  public static make = Effect.fnUntraced(function* <DatabaseSchema>(opts: {
    database: BunSqliteDatabase;
    trackTables: ReadonlySet<keyof DatabaseSchema>;
  }) {
    const pubsub = yield* PubSub.unbounded<SourceTapEvent<DatabaseSchema>>();
    const syncState = new SourceTapSyncState(
      opts.database,
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      opts.trackTables as ReadonlySet<string>
    );

    yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub));

    return new SourceTap({ syncState, trackTables: opts.trackTables }, pubsub);
  });

  private constructor(
    opts: { syncState: SourceTapSyncState; trackTables: ReadonlySet<keyof DB> },
    pubsub: PubSub.PubSub<SourceTapEvent<DB>>
  ) {
    this.#pubsub = pubsub;
    this.#trackTables = opts.trackTables;
    this.#syncState = opts.syncState;
    this.updates = Stream.fromPubSub(this.#pubsub);

    this.#inTransaction = false;
    this.#transactionEvents = [];
    this.#transactionRequiresFullSync = false;

    this.#committedSyncToken = this.#syncState.getSyncToken();
    this.#observedSyncToken = this.#committedSyncToken;

    this.#queryState = new WeakMap();

    this.#transformerVars = new Map();
    this.#transformer = new SourceTapTransformer(this.#transformerVars, this.#queryState);
  }

  private isTrackedTable(tableName: string): tableName is Extract<keyof DB, string> {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return this.#trackTables.has(tableName as keyof DB);
  }

  private setUpQuery(
    queryId: SourceTapQueryId,
    tableName: Extract<keyof DB, string>,
    queryType: 'insert' | 'update'
  ) {
    this.#queryState.set(queryId, {
      table: tableName,
      queryType,
      originalReturning: new Set(),
      originalReturningAlias: new Set(),
    });
    this.#transformerVars.set('currentQueryId', queryId);
  }

  public transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    // Tables may be created by migrations after SourceTap itself is created.
    if (
      DeleteQueryNode.is(args.node) ||
      InsertQueryNode.is(args.node) ||
      UpdateQueryNode.is(args.node)
    ) {
      this.#syncState.ensureDeleteTriggers();
    } else {
      this.#syncState.installDeleteTriggers();
    }

    if (
      InsertQueryNode.is(args.node) &&
      args.node.into &&
      this.isTrackedTable(args.node.into.table.identifier.name)
    ) {
      this.setUpQuery(args.queryId, args.node.into.table.identifier.name, 'insert');
      return this.#transformer.transformNode(args.node);
    } else if (UpdateQueryNode.is(args.node) && args.node.table) {
      if (TableNode.is(args.node.table)) {
        if (this.isTrackedTable(args.node.table.table.identifier.name)) {
          this.setUpQuery(args.queryId, args.node.table.table.identifier.name, 'update');
          return this.#transformer.transformNode(args.node);
        }
      } else {
        throw new Error(
          `SourceTap transformQuery has an unhandled UpdateQueryNode type: ${args.node.table.kind}`
        );
      }
    }
    return args.node;
  }

  private cleanUpQuery(queryId: SourceTapQueryId) {
    this.#queryState.delete(queryId);
  }

  public async transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
    this.detectDeletes();

    const queryState = this.#queryState.get(args.queryId);

    if (queryState !== void 0) {
      let listenerRows: QueryResult<UnknownRow>['rows'] = [];

      if (queryState.originalReturningAlias.size > 0) {
        // original query has aliases that must be removed
        // since listeners expect data from RETURNING * only
        for (const row of args.result.rows) {
          const newRow: UnknownRow = {};
          for (const key in row) {
            if (!queryState.originalReturningAlias.has(key)) {
              newRow[key] = row[key];
            }
          }
          listenerRows.push(newRow);
        }
      } else {
        // no aliases, so we're ok to send back the rows
        // as they are since we transform the original
        // query to add RETURNING *
        listenerRows = args.result.rows;
      }

      if (listenerRows.length > 0) {
        this.publish(
          new SourceTapUpdate<DB>({
            operation: queryState.queryType,
            table: queryState.table,
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion
            rows: listenerRows as Selectable<DB[keyof DB]>[],
          })
        );
      }

      // oxlint-disable-next-line eslint/no-useless-assignment
      let newArgs = args.result;
      if (queryState.originalReturning.size === 0) {
        // we return info about the query if the original
        // query had no RETURNING statement
        newArgs =
          queryState.queryType === 'insert'
            ? {
                rows: [
                  {
                    insertId: args.result.insertId,
                    numInsertedOrUpdatedRows: args.result.numAffectedRows,
                  },
                ],
              }
            : {
                rows: [{ numUpdatedRows: args.result.numAffectedRows }],
              };
      } else if (!queryState.originalReturning.has('*')) {
        // original query did not have RETURNING * which
        // means some data has to be removed before we send it back
        newArgs = {
          ...args.result,
          rows: args.result.rows.map((row) => {
            const filteredRow: UnknownRow = {};
            for (const key in row) {
              if (queryState.originalReturning.has(key)) {
                filteredRow[key] = structuredClone(row[key]);
              }
            }

            return filteredRow;
          }),
        };
      } else {
        newArgs = {
          ...args.result,
          // we clone because listeners will consume
          // the original rows result, and they need it unmodified
          rows: structuredClone(args.result.rows),
        };
      }

      this.cleanUpQuery(args.queryId);

      return newArgs;
    }

    this.cleanUpQuery(args.queryId);

    return args.result;
  }

  private publish(event: SourceTapEvent<DB>) {
    if (this.#inTransaction) {
      this.#transactionEvents.push(event);
    } else {
      PubSub.publishUnsafe(this.#pubsub, event);
    }
  }

  private detectDeletes() {
    const syncToken = this.#syncState.getSyncToken();

    if (syncToken === this.#observedSyncToken) {
      return;
    }

    this.#observedSyncToken = syncToken;

    if (this.#inTransaction) {
      this.#transactionRequiresFullSync = true;
      return;
    }

    this.#committedSyncToken = syncToken;
    PubSub.publishUnsafe(this.#pubsub, new SourceTapFullSync({ syncToken }));
  }

  /**
   * Returns an opaque checkpoint for a client's local snapshot.
   *
   * Save this after a full sync. A client that was offline can pass it to
   * `isSyncTokenCurrent` when reconnecting; a mismatch means that at least one
   * tracked row was deleted and the client must perform another full sync.
   */
  public getSyncToken(): string {
    return this.#committedSyncToken;
  }

  public isSyncTokenCurrent(syncToken: string): boolean {
    return syncToken === this.#committedSyncToken;
  }

  public beginTransaction() {
    this.#inTransaction = true;
    this.#transactionRequiresFullSync = false;
  }

  public commitTransaction() {
    this.#committedSyncToken = this.#syncState.getSyncToken();
    this.#observedSyncToken = this.#committedSyncToken;

    if (this.#transactionRequiresFullSync) {
      PubSub.publishUnsafe(
        this.#pubsub,
        new SourceTapFullSync({ syncToken: this.#committedSyncToken })
      );
    } else {
      this.#transactionEvents.forEach((transactionEvent) => {
        PubSub.publishUnsafe(this.#pubsub, transactionEvent);
      });
    }

    this.#transactionEvents = [];
    this.#transactionRequiresFullSync = false;
    this.#inTransaction = false;
  }

  public rollbackTransaction() {
    this.#committedSyncToken = this.#syncState.getSyncToken();
    this.#observedSyncToken = this.#committedSyncToken;
    this.#transactionEvents = [];
    this.#transactionRequiresFullSync = false;
    this.#inTransaction = false;
  }
}

class SourceTapTransformer<TableName extends string> extends OperationNodeTransformer {
  readonly #transformerVars: Map<'currentQueryId', SourceTapQueryId>;
  readonly #queryState: WeakMap<SourceTapQueryId, SourceTapQueryState<TableName>>;

  public static returningNode = ReturningNode.create([SelectionNode.createSelectAll()]);
  public static selectAllNode = SelectionNode.createSelectAll();

  public constructor(
    transformerVars: Map<'currentQueryId', SourceTapQueryId>,
    queryState: WeakMap<SourceTapQueryId, SourceTapQueryState<TableName>>
  ) {
    super();

    this.#transformerVars = transformerVars;
    this.#queryState = queryState;
  }

  private getCurrentQueryState(): SourceTapQueryState<TableName> {
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const currentQueryId = this.#transformerVars.get('currentQueryId')!;
    const queryState = this.#queryState.get(currentQueryId);

    if (queryState === void 0) {
      throw new Error('SourceTapTransformer could not find current query state');
    }

    return queryState;
  }

  private addReturning<T extends InsertQueryNode | UpdateQueryNode>(node: T): T {
    const queryState = this.getCurrentQueryState();
    queryState.originalReturning = new Set();
    queryState.originalReturningAlias = new Set();

    return {
      ...node,
      returning: SourceTapTransformer.returningNode,
    };
  }

  protected override transformInsertQuery(node: InsertQueryNode): InsertQueryNode {
    const transformedNode = super.transformInsertQuery(node);

    if (transformedNode.returning === void 0) {
      return this.addReturning(transformedNode);
    }

    return transformedNode;
  }

  protected override transformUpdateQuery(node: UpdateQueryNode): UpdateQueryNode {
    const transformedNode = super.transformUpdateQuery(node);

    if (transformedNode.returning === void 0) {
      return this.addReturning(transformedNode);
    }

    return transformedNode;
  }

  protected override transformReturning(returningNode: ReturningNode): ReturningNode {
    const transformedReturningNode = super.transformReturning(returningNode);
    const queryState = this.getCurrentQueryState();

    const currentOriginalReturning = new Set<string>();
    const currentOriginalReturningAlias = new Set<string>();

    for (const node of transformedReturningNode.selections) {
      if (ColumnNode.is(node.selection)) {
        currentOriginalReturning.add(node.selection.column.name);
      } else if (ReferenceNode.is(node.selection)) {
        if (ColumnNode.is(node.selection.column)) {
          currentOriginalReturning.add(node.selection.column.column.name);
        } else if (SelectAllNode.is(node.selection.column)) {
          currentOriginalReturning.add('*');
        } else {
          throw new Error('SourceTap transformReturning has an unhandled ReferenceNode type');
        }
      } else if (AliasNode.is(node.selection)) {
        if (!(ReferenceNode.is(node.selection.node) && ColumnNode.is(node.selection.node.column))) {
          throw new Error(
            `SourceTap transformReturning has an unhandled AliasNode.node type: ${node.selection.node.kind}`
          );
        }

        const columnName = node.selection.node.column.column.name;

        if (IdentifierNode.is(node.selection.alias)) {
          currentOriginalReturning.add(node.selection.alias.name);
          // we need to check that the column does not have the same name as the alias
          // otherwise transformResults will remove this column from the listeners
          if (node.selection.alias.name !== columnName) {
            currentOriginalReturningAlias.add(node.selection.alias.name);
          }
        } else {
          throw new Error(
            `SourceTap transformReturning has an unhandled AliasNode.alias type: ${node.selection.alias.kind}`
          );
        }
      } else if (SelectAllNode.is(node.selection)) {
        currentOriginalReturning.add('*');
      } else {
        throw new Error('SourceTap transformReturning has an unhandled SelectionNode type');
      }
    }

    queryState.originalReturning = currentOriginalReturning;
    queryState.originalReturningAlias = currentOriginalReturningAlias;

    if (currentOriginalReturning.has('*')) {
      return transformedReturningNode;
    }

    return {
      ...transformedReturningNode,
      selections: [...transformedReturningNode.selections, SourceTapTransformer.selectAllNode],
    };
  }
}
