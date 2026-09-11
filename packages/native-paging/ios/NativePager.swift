import ExpoModulesCore
import SwiftUI
@_exported import VoelPagingCore

public struct PagingOptions: Record {
  @Field var pageSize: Int = 50
  @Field var maxItems: Int = 250
  @Field var prefetchDistance: Int = 10

  public init() {}
}

struct PagingItemRecord: Record {
  @Field(.required) var id: String = ""
  @Field(.required) var value: [String: Any] = [:]
}

open class NativePager<Value: AnyObject>: SharedObject, ObservableObject {
  @Published public private(set) var snapshot = PageSnapshot<Value>(
    items: [], refresh: .loading, prepend: .ready, append: .ready
  )
  private var session: PagingSession<Value>?
  private let decode: ([String: Any]) throws -> Value

  public init(options: PagingOptions, decode: @escaping ([String: Any]) throws -> Value) {
    self.decode = decode
    super.init()
    session = PagingSession(
      pageSize: Int32(options.pageSize),
      maxItems: Int32(options.maxItems),
      prefetchDistance: Int32(options.prefetchDistance),
      onRequest: { [weak self] request in
        self?.emit(
          event: "request",
          payload: [
            "id": request.id, "offset": request.offset, "limit": request.limit,
          ])
      },
      onCancel: { [weak self] id in
        self?.emit(event: "cancel", payload: ["id": id.intValue])
      },
      onSnapshot: { [weak self] snapshot in self?.snapshot = snapshot }
    )
  }

  public func access(id: String) { session?.access(id: id) }
  public func retry() { session?.retry() }
  public func refresh() { session?.refresh() }

  fileprivate func start() { session?.start() }
  fileprivate func resolve(id: Int, items: [PagingItemRecord], total: Int) throws {
    // Decode the whole page synchronously so JS can reject a malformed response. Never
    // publish partially decoded rows or throw from the asynchronous main-thread block.
    let decoded = try items.map { PageItem<Value>(id: $0.id, value: try decode($0.value)) }
    DispatchQueue.main.async {
      self.session?.resolve(id: Int32(id), items: decoded, total: Int32(total))
    }
  }
  fileprivate func reject(id: Int) { session?.reject(id: Int32(id)) }
  fileprivate func close() {
    session?.close()
    session = nil
  }
  public override func sharedObjectWillRelease() {
    DispatchQueue.main.async { self.close() }
  }
}

/// Register a concrete feature subclass so Expo can check the shared object's runtime type.
public func NativePagerDefinition<Value: AnyObject, Pager: NativePager<Value>>(
  _ pagerType: Pager.Type,
  create: @escaping (PagingOptions) -> Pager
) -> ClassDefinition {
  Class("Pager", pagerType) {
    Constructor { (options: PagingOptions) in create(options) }
    Function("start") { (pager: Pager) in
      DispatchQueue.main.async { pager.start() }
    }
    Function("refresh") { (pager: Pager) in
      DispatchQueue.main.async { pager.refresh() }
    }
    Function("retry") { (pager: Pager) in
      DispatchQueue.main.async { pager.retry() }
    }
    Function("resolve") { (pager: Pager, id: Int, items: [PagingItemRecord], total: Int) in
      try pager.resolve(id: id, items: items, total: total)
    }
    Function("reject") { (pager: Pager, id: Int) in
      DispatchQueue.main.async { pager.reject(id: id) }
    }
    Function("close") { (pager: Pager) in
      DispatchQueue.main.async { pager.close() }
    }
  }
}
