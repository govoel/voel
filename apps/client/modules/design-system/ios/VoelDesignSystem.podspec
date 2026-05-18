Pod::Spec.new do |s|
  s.name           = 'VoelDesignSystem'
  s.version        = '0.0.0'
  s.summary        = 'Voel native design system helpers'
  s.description    = 'Native design system helpers for the Voel client app'
  s.author         = ''
  s.homepage       = 'https://voel.app'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: 'https://voel.app' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'ExpoUI'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
