import ExpoModulesCore
import ExpoUI

public final class VoelDesignSystemModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VoelDesignSystem")

    OnCreate {
      ViewModifierRegistry.register("voelTextStyle") { params, appContext, _ in
        return try VoelTextStyleModifier(from: params, appContext: appContext)
      }
    }

    OnDestroy {
      ViewModifierRegistry.unregister("voelTextStyle")
    }
  }
}
