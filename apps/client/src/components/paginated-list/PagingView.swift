internal import ExpoModulesCore
internal import ExpoUI
internal import VoelNativePaging

/// Props have the native view's lifetime, unlike transient SwiftUI body values.
class PagingViewProps<Value: Record & AnyObject>: UIBaseViewProps {
  @Field var paging: PagingOptions?
  var onPageRequest = EventDispatcher()
  var onPageCancel = EventDispatcher()
  private var currentPager: NativePager<Value>?

  // Sizing is creation-time configuration; the React wrapper remounts on changes.
  func pager(options: PagingOptions) -> NativePager<Value> {
    if let currentPager { return currentPager }
    let context = appContext
    let pager = NativePager<Value>(
      options: options,
      decode: {
        guard let context else { throw Exceptions.AppContextLost() }
        return try Value(from: $0, appContext: context)
      },
      onRequest: { [weak self] in self?.onPageRequest($0) },
      onCancel: { [weak self] in self?.onPageCancel($0) }
    )
    currentPager = pager
    return pager
  }

  func resolvePage(_ page: PageDelivery) throws { try currentPager?.resolve(page) }
  func rejectPage(_ request: PageCancellation) { currentPager?.reject(request) }
}
