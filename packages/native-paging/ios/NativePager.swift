import ExpoModulesCore
import SwiftUI
@_exported import VoelPagingCore

public struct PagingOptions: Record {
  @Field public var pageSize: Int = 50
  @Field public var maxResidentItems: Int = 250
  public init() {}
}

struct PagingItemRecord: Record {
  @Field(.required) var id: String = ""
  @Field(.required) var value: [String: Any] = [:]
}

public struct PageDelivery: Record {
  @Field(.required) var id: String = ""
  @Field(.required) var items: [PagingItemRecord] = []
  @Field(.required) var total: Int = 0
  public init() {}
}

public struct PageCancellation: Record {
  @Field(.required) var id: String = ""
  public init() {}
}

/// Main-thread state owned by the native view, not an Expo shared object.
public final class NativePager<Value: AnyObject>: ObservableObject {
  @Published public private(set) var snapshot = PageSnapshot<Value>(
    items: [], refresh: .loading, prepend: .ready, append: .ready
  )
  private var session: PagingSession<Value>?
  private let decode: ([String: Any]) throws -> Value
  private let generation = UUID().uuidString
  private var pending: [String: Int32] = [:]

  public init(
    options: PagingOptions,
    decode: @escaping ([String: Any]) throws -> Value,
    onRequest: @escaping ([String: Any]) -> Void,
    onCancel: @escaping ([String: Any]) -> Void
  ) {
    self.decode = decode
    session = PagingSession(
      pageSize: Int32(options.pageSize),
      maxItems: Int32(options.maxResidentItems),
      onRequest: { [weak self] request in
        guard let self else { return }
        let id = "\(generation):\(request.id)"
        pending[id] = request.id
        onRequest(["id": id, "offset": request.offset, "limit": request.limit])
      },
      onCancel: { [weak self] requestId in
        guard let self else { return }
        let id = "\(generation):\(requestId.intValue)"
        pending.removeValue(forKey: id)
        onCancel(["id": id])
      },
      onSnapshot: { [weak self] snapshot in self?.snapshot = snapshot }
    )
  }

  public func start() { session?.start() }
  public func access(id: String) { session?.access(id: id) }
  public func retry() { session?.retry() }
  public func refresh() { session?.refresh() }
  public func resolve(_ page: PageDelivery) throws {
    guard let id = pending[page.id] else { return }
    let items = try page.items.map { PageItem<Value>(id: $0.id, value: try decode($0.value)) }
    pending.removeValue(forKey: page.id)
    session?.resolve(id: id, items: items, total: Int32(page.total))
  }
  public func reject(_ request: PageCancellation) {
    guard let id = pending.removeValue(forKey: request.id) else { return }
    session?.reject(id: id)
  }
  public func close() {
    session?.close()
    session = nil
    pending.removeAll()
  }

  deinit {
    // ARC can release view props off the main thread. Do not retain the view until
    // a network request finishes; session callbacks above deliberately capture weakly.
    let session = session
    DispatchQueue.main.async { session?.close() }
  }
}
