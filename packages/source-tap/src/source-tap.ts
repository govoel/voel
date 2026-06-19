// oxlint-disable-next-line import/no-nodejs-modules
import { EventEmitter } from 'node:events';

import {
  AliasNode,
  ColumnNode,
  IdentifierNode,
  InsertQueryNode,
  OperationNodeTransformer,
  ReferenceNode,
  ReturningNode,
  SelectAllNode,
  SelectionNode,
  TableNode,
  UpdateQueryNode,
} from 'kysely';
import type {
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryResult,
  RootOperationNode,
  Selectable,
  UnknownRow,
} from 'kysely';

type ListenerSignature<L> = {
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  [E in keyof L]: (...args: any[]) => unknown;
};

type DefaultListener = Record<string, (...args: unknown[]) => unknown>;

interface TypedEmitter<L extends ListenerSignature<L> = DefaultListener> {
  addListener<U extends keyof L>(event: U, listener: L[U]): this;
  prependListener<U extends keyof L>(event: U, listener: L[U]): this;
  prependOnceListener<U extends keyof L>(event: U, listener: L[U]): this;
  removeListener<U extends keyof L>(event: U, listener: L[U]): this;
  removeAllListeners(event?: keyof L): this;
  once<U extends keyof L>(event: U, listener: L[U]): this;
  on<U extends keyof L>(event: U, listener: L[U]): this;
  off<U extends keyof L>(event: U, listener: L[U]): this;
  emit<U extends keyof L>(event: U, ...args: Parameters<L[U]>): boolean;
  eventNames<U extends keyof L>(): U[];
  listenerCount(type: keyof L): number;
  listeners<U extends keyof L>(type: U): L[U][];
  rawListeners<U extends keyof L>(type: U): L[U][];
  getMaxListeners(): number;
  setMaxListeners(n: number): this;
}

type SourceTapQueryId =
  PluginTransformQueryArgs['queryId'] extends PluginTransformResultArgs['queryId']
    ? PluginTransformQueryArgs['queryId']
    : never;

export interface SourceTapEvents<DB> {
  update: (
    payload: {
      [T in keyof DB]: { table: T; rows: Selectable<DB[T]>[] };
    }[keyof DB]
  ) => void;
}

export class SourceTap<DB> implements KyselyPlugin {
  public readonly events: TypedEmitter<SourceTapEvents<DB>>;

  #inTransaction: boolean;
  #transactionEvents: [
    keyof SourceTapEvents<DB>,
    Parameters<SourceTapEvents<DB>[keyof SourceTapEvents<DB>]>[0],
  ][];

  readonly #trackTables: ReadonlySet<keyof DB>;

  readonly #transformer: SourceTapTransformer;
  readonly #transformerVars: Map<'currentQueryId', SourceTapQueryId>;
  readonly #currentTable: WeakMap<SourceTapQueryId, Extract<keyof DB, string>>;
  readonly #currentQueryType: WeakMap<SourceTapQueryId, 'insert' | 'update'>;
  readonly #currentOriginalReturning: WeakMap<SourceTapQueryId, Set<string>>;
  readonly #currentOriginalReturningAlias: WeakMap<SourceTapQueryId, Set<string>>;

  public constructor(opts: { trackTables: Set<keyof DB> }) {
    this.#trackTables = opts.trackTables;

    // oxlint-disable-next-line unicorn/prefer-event-target, typescript/no-unsafe-type-assertion
    this.events = new EventEmitter() as TypedEmitter<SourceTapEvents<DB>>;

    this.#inTransaction = false;
    this.#transactionEvents = [];

    this.#currentTable = new WeakMap();
    this.#currentQueryType = new WeakMap();
    this.#currentOriginalReturning = new WeakMap();
    this.#currentOriginalReturningAlias = new WeakMap();

    this.#transformerVars = new Map();
    this.#transformer = new SourceTapTransformer(
      this.#transformerVars,
      this.#currentOriginalReturning,
      this.#currentOriginalReturningAlias
    );
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
    this.#currentTable.set(queryId, tableName);
    this.#currentQueryType.set(queryId, queryType);
    this.#transformerVars.set('currentQueryId', queryId);
  }

  public transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
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
    this.#currentTable.delete(queryId);
    this.#currentQueryType.delete(queryId);
    this.#currentOriginalReturning.delete(queryId);
    this.#currentOriginalReturningAlias.delete(queryId);
  }

  public async transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const currentTable = this.#currentTable.get(args.queryId)!;
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const currentQueryType = this.#currentQueryType.get(args.queryId)!;
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const currentOriginalReturning = this.#currentOriginalReturning.get(args.queryId)!;
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const currentOriginalReturningAlias = this.#currentOriginalReturningAlias.get(args.queryId)!;
    if (typeof currentTable === 'string' && currentTable.length > 0) {
      let listenerRows: QueryResult<UnknownRow>['rows'] = [];

      if (currentOriginalReturningAlias.size > 0) {
        // original query has aliases that must be removed
        // since listeners expect data from RETURNING * only
        for (const row of args.result.rows) {
          const newRow: UnknownRow = {};
          for (const key in row) {
            if (!currentOriginalReturningAlias.has(key)) {
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
        if (this.#inTransaction) {
          this.#transactionEvents.push([
            'update',
            {
              table: currentTable,
              // oxlint-disable-next-line typescript/no-unsafe-type-assertion
              rows: listenerRows as Selectable<DB[keyof DB]>[],
            },
          ]);
        } else {
          this.events.emit('update', {
            table: currentTable,
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion
            rows: listenerRows as Selectable<DB[keyof DB]>[],
          });
        }
      }

      // oxlint-disable-next-line eslint/no-useless-assignment
      let newArgs = args.result;
      if (currentOriginalReturning.size === 0) {
        // we return info about the query if the original
        // query had no RETURNING statement
        newArgs =
          currentQueryType === 'insert'
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
      } else if (!currentOriginalReturning.has('*')) {
        // original query did not have RETURNING * which
        // means some data has to be removed before we send it back
        newArgs = {
          ...args.result,
          rows: args.result.rows.map((row) => {
            const filteredRow: UnknownRow = {};
            for (const key in row) {
              if (currentOriginalReturning.has(key)) {
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

  public beginTransaction() {
    this.#inTransaction = true;
  }

  public commitTransaction() {
    this.#transactionEvents.forEach((transactionEvent) => {
      this.events.emit(transactionEvent[0], transactionEvent[1]);
    });
    this.#transactionEvents = [];
    this.#inTransaction = false;
  }

  public rollbackTransaction() {
    this.#transactionEvents = [];
    this.#inTransaction = false;
  }
}

class SourceTapTransformer extends OperationNodeTransformer {
  readonly #transformerVars: Map<'currentQueryId', SourceTapQueryId>;
  readonly #currentOriginalReturning: WeakMap<SourceTapQueryId, Set<string>>;
  readonly #currentOriginalReturningAlias: WeakMap<SourceTapQueryId, Set<string>>;

  public static returningNode = ReturningNode.create([SelectionNode.createSelectAll()]);
  public static selectAllNode = SelectionNode.createSelectAll();

  public constructor(
    transformerVars: Map<'currentQueryId', SourceTapQueryId>,
    currentOriginalReturning: WeakMap<SourceTapQueryId, Set<string>>,
    currentOriginalReturningAlias: WeakMap<SourceTapQueryId, Set<string>>
  ) {
    super();

    this.#transformerVars = transformerVars;
    this.#currentOriginalReturning = currentOriginalReturning;
    this.#currentOriginalReturningAlias = currentOriginalReturningAlias;
  }

  private addReturning<T extends InsertQueryNode | UpdateQueryNode>(node: T): T {
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const currentQueryId = this.#transformerVars.get('currentQueryId')!;
    this.#currentOriginalReturning.set(currentQueryId, new Set<string>());
    this.#currentOriginalReturningAlias.set(currentQueryId, new Set<string>());

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
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const currentQueryId = this.#transformerVars.get('currentQueryId')!;

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

    this.#currentOriginalReturning.set(currentQueryId, currentOriginalReturning);
    this.#currentOriginalReturningAlias.set(currentQueryId, currentOriginalReturningAlias);

    if (currentOriginalReturning.has('*')) {
      return transformedReturningNode;
    }

    return {
      ...transformedReturningNode,
      selections: [...transformedReturningNode.selections, SourceTapTransformer.selectAllNode],
    };
  }
}
