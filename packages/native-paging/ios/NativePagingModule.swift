import ExpoModulesCore
import SwiftUI
@_exported import VoelPagingCore

struct PagingOptions: Record {
  @Field var pageSize: Int = 50
  @Field var maxItems: Int = 250
  @Field var prefetchDistance: Int = 10
}

struct PagingItemRecord: Record {
  @Field var id: String = ""
  @Field var value: [String: Any] = [:]
}

public final class NativePager: SharedObject, ObservableObject {
  @Published public private(set) var snapshot = PageSnapshot(
    items: [], refresh: .loading, prepend: .ready, append: .ready
  )
  private var session: PagingSession?

  init(options: PagingOptions) {
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
  fileprivate func resolve(id: Int, items: [PagingItemRecord], total: Int) {
    session?.resolve(
      id: Int32(id), items: items.map { PageItem(id: $0.id, value: $0.value) }, total: Int32(total)
    )
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

public final class NativePagingModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VoelNativePaging")
    Class("Pager", NativePager.self) {
      Constructor { (options: PagingOptions) in NativePager(options: options) }
      Function("start") { (pager: NativePager) in
        DispatchQueue.main.async { pager.start() }
      }
      Function("refresh") { (pager: NativePager) in
        DispatchQueue.main.async { pager.refresh() }
      }
      Function("retry") { (pager: NativePager) in
        DispatchQueue.main.async { pager.retry() }
      }
      Function("resolve") { (pager: NativePager, id: Int, items: [PagingItemRecord], total: Int) in
        DispatchQueue.main.async { pager.resolve(id: id, items: items, total: total) }
      }
      Function("reject") { (pager: NativePager, id: Int) in
        DispatchQueue.main.async { pager.reject(id: id) }
      }
      Function("close") { (pager: NativePager) in
        DispatchQueue.main.async { pager.close() }
      }
    }
  }
}
