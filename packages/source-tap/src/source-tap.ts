import { type PluginTransformResultArgs, ReturningNode, TableNode } from 'kysely';
import {
  AliasNode,
  ColumnNode,
  IdentifierNode,
  InsertQueryNode,
  type KyselyPlugin,
  type LogEvent,
  OperationNodeTransformer,
  type PluginTransformQueryArgs,
  type QueryResult,
  ReferenceNode,
  type RootOperationNode,
  SelectAllNode,
  type Selectable,
  SelectionNode,
  type UnknownRow,
  UpdateQueryNode,
} from 'kysely';
import { EventEmitter } from 'node:events';

type ListenerSignature<L> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [E in keyof L]: (...args: any[]) => unknown;
};

type DefaultListener = {
  [k: string]: (...args: unknown[]) => unknown;
};

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
      [T in keyof DB]: { table: T; rows: DeepReadonly<Selectable<DB[T]>[]> };
    }[keyof DB]
  ) => void;
}

export class SourceTap<DB> implements KyselyPlugin {
  readonly events: TypedEmitter<SourceTapEvents<DB>>;

  #inTransaction: boolean;
  #transactionEvents: [
    keyof SourceTapEvents<DB>,
    Parameters<SourceTapEvents<DB>[keyof SourceTapEvents<DB>]>[0],
  ][];

  #trackTables: Set<keyof DB>;

  #transformer: SourceTapTransformer;
  #transformerVars: Map<'currentQueryId', SourceTapQueryId>;
  #currentTable: WeakMap<SourceTapQueryId, string>;
  #currentQueryType: WeakMap<SourceTapQueryId, 'insert' | 'update'>;
  #currentOriginalReturning: WeakMap<SourceTapQueryId, Set<string>>;
  #currentOriginalReturningAlias: WeakMap<SourceTapQueryId, Set<string>>;

  constructor(opts: { trackTables: Set<keyof DB> }) {
    this.#trackTables = opts.trackTables;

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

  private setUpQuery(queryId: SourceTapQueryId, tableName: string, queryType: 'insert' | 'update') {
    this.#currentTable.set(queryId, tableName);
    this.#currentQueryType.set(queryId, queryType);
    this.#transformerVars.set('currentQueryId', queryId);
  }

  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    if (
      InsertQueryNode.is(args.node) &&
      args.node.into &&
      this.#trackTables.has(args.node.into.table.identifier.name as keyof DB)
    ) {
      this.setUpQuery(args.queryId, args.node.into.table.identifier.name, 'insert');
      return this.#transformer.transformNode(args.node);
    } else if (UpdateQueryNode.is(args.node) && args.node.table) {
      if (TableNode.is(args.node.table)) {
        if (this.#trackTables.has(args.node.table.table.identifier.name as keyof DB)) {
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

  async transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
    const currentTable = this.#currentTable.get(args.queryId)!;
    const currentQueryType = this.#currentQueryType.get(args.queryId)!;
    const currentOriginalReturning = this.#currentOriginalReturning.get(args.queryId)!;
    const currentOriginalReturningAlias = this.#currentOriginalReturningAlias.get(args.queryId)!;
    if (typeof currentTable === 'string' && currentTable.length > 0) {
      let listenerRows: QueryResult<UnknownRow>['rows'] = [];

      if (currentOriginalReturningAlias.size !== 0) {
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
              table: currentTable as keyof DB,
              rows: listenerRows as unknown as DeepReadonly<Selectable<DB[keyof DB]>[]>,
            },
          ]);
        } else {
          this.events.emit('update', {
            table: currentTable as keyof DB,
            rows: listenerRows as unknown as DeepReadonly<Selectable<DB[keyof DB]>[]>,
          });
        }
      }

      let newArgs = args.result;
      if (currentOriginalReturning.size === 0) {
        // we return info about the query if the original
        // query had no RETURNING statement
        if (currentQueryType === 'insert') {
          newArgs = {
            rows: [
              {
                insertId: args.result.insertId,
                numInsertedOrUpdatedRows: args.result.numAffectedRows,
              },
            ],
          };
        } else {
          newArgs = {
            rows: [{ numUpdatedRows: args.result.numAffectedRows }],
          };
        }
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

  transactionDetector(event: LogEvent) {
    if (event.query.sql === 'begin') {
      // we don't need to check if we are already in a transaction
      // here because sqlite itself does not support nested transactions
      // by calling begin again
      this.#inTransaction = true;
    } else if (event.query.sql === 'commit') {
      this.#transactionEvents.forEach((transactionEvent) => {
        this.events.emit(transactionEvent[0], transactionEvent[1]);
      });
      this.#transactionEvents = [];
      this.#inTransaction = false;
    } else if (event.query.sql === 'rollback') {
      this.#transactionEvents = [];
      this.#inTransaction = false;
    } else if (
      event.query.sql.startsWith('savepoint') ||
      event.query.sql.startsWith('rollback to') ||
      event.query.sql.startsWith('release')
    ) {
      this.#transactionEvents = [];
      this.#inTransaction = false;
      throw new Error('SourceTap does not support nested transactions');
    }
  }
}

class SourceTapTransformer extends OperationNodeTransformer {
  #transformerVars: Map<'currentQueryId', SourceTapQueryId>;
  #currentOriginalReturning: WeakMap<SourceTapQueryId, Set<string>>;
  #currentOriginalReturningAlias: WeakMap<SourceTapQueryId, Set<string>>;

  static returningNode = ReturningNode.create([SelectionNode.createSelectAll()]);
  static selectAllNode = SelectionNode.createSelectAll();

  constructor(
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
    const currentQueryId = this.#transformerVars.get('currentQueryId')!;
    this.#currentOriginalReturning.set(currentQueryId, new Set<string>());
    this.#currentOriginalReturningAlias.set(currentQueryId, new Set<string>());

    return {
      ...node,
      returning: SourceTapTransformer.returningNode,
    };
  }

  protected override transformInsertQuery(node: InsertQueryNode): InsertQueryNode {
    node = super.transformInsertQuery(node);

    if (typeof node.returning === 'undefined') {
      return this.addReturning(node);
    }

    return node;
  }

  protected override transformUpdateQuery(node: UpdateQueryNode): UpdateQueryNode {
    node = super.transformUpdateQuery(node);

    if (typeof node.returning === 'undefined') {
      return this.addReturning(node);
    }

    return node;
  }

  protected override transformReturning(returningNode: ReturningNode): ReturningNode {
    returningNode = super.transformReturning(returningNode);
    const currentQueryId = this.#transformerVars.get('currentQueryId')!;
    const currentOriginalReturning = new Set<string>();
    const currentOriginalReturningAlias = new Set<string>();

    for (const node of returningNode.selections) {
      if (ColumnNode.is(node.selection)) {
        currentOriginalReturning.add(node.selection.column.name);
      } else if (ReferenceNode.is(node.selection)) {
        if (ColumnNode.is(node.selection.column)) {
          currentOriginalReturning.add(node.selection.column.column.name);
        } else if (SelectAllNode.is(node.selection.column)) {
          currentOriginalReturning.add('*');
        } else {
          throw new Error(
            `SourceTap transformReturning has an unhandled ReferenceNode type: ${node.selection.column}`
          );
        }
      } else if (AliasNode.is(node.selection)) {
        if (IdentifierNode.is(node.selection.alias)) {
          currentOriginalReturning.add(node.selection.alias.name);
          currentOriginalReturningAlias.add(node.selection.alias.name);
        } else {
          throw new Error(
            `SourceTap transformReturning has an unhandled AliasNode type: ${node.selection.alias}`
          );
        }
      } else if (SelectAllNode.is(node.selection)) {
        currentOriginalReturning.add('*');
      } else {
        throw new Error(
          `SourceTap transformReturning has an unhandled SelectionNode type: ${node.selection}`
        );
      }
    }

    this.#currentOriginalReturning.set(currentQueryId, currentOriginalReturning);
    this.#currentOriginalReturningAlias.set(currentQueryId, currentOriginalReturningAlias);

    if (currentOriginalReturning.has('*')) {
      return returningNode;
    }

    return {
      ...returningNode,
      selections: [...returningNode.selections, SourceTapTransformer.selectAllNode],
    };
  }
}

type AnyArray<Type = unknown> = Array<Type> | ReadonlyArray<Type>;
type Primitive = string | number | boolean | bigint | symbol | undefined | null;
type Builtin = Primitive | Date | Error | RegExp;
type IsTuple<Type> = Type extends readonly unknown[]
  ? unknown[] extends Type
    ? never
    : Type
  : never;
type IsAny<Type> = 0 extends 1 & Type ? true : false;
type IsUnknown<Type> = IsAny<Type> extends true ? false : unknown extends Type ? true : false;

type DeepReadonly<Type> =
  Type extends Exclude<Builtin, Error>
    ? Type
    : Type extends Map<infer Keys, infer Values>
      ? ReadonlyMap<DeepReadonly<Keys>, DeepReadonly<Values>>
      : Type extends ReadonlyMap<infer Keys, infer Values>
        ? ReadonlyMap<DeepReadonly<Keys>, DeepReadonly<Values>>
        : Type extends WeakMap<infer Keys, infer Values>
          ? WeakMap<DeepReadonly<Keys>, DeepReadonly<Values>>
          : Type extends Set<infer Values>
            ? ReadonlySet<DeepReadonly<Values>>
            : Type extends ReadonlySet<infer Values>
              ? ReadonlySet<DeepReadonly<Values>>
              : Type extends WeakSet<infer Values>
                ? WeakSet<DeepReadonly<Values>>
                : Type extends Promise<infer Value>
                  ? Promise<DeepReadonly<Value>>
                  : Type extends AnyArray<infer Values>
                    ? Type extends IsTuple<Type>
                      ? { readonly [Key in keyof Type]: DeepReadonly<Type[Key]> }
                      : ReadonlyArray<DeepReadonly<Values>>
                    : Type extends object
                      ? { readonly [Key in keyof Type]: DeepReadonly<Type[Key]> }
                      : IsUnknown<Type> extends true
                        ? unknown
                        : Readonly<Type>;
