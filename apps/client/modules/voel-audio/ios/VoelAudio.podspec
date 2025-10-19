Pod::Spec.new do |s|
  s.name           = 'VoelAudio'
  s.version        = '0.0.0'
  s.summary        = 'Audio playback module for Voel'
  s.description    = 'Audio playback module for Voel'
  s.license        = 'Proprietary'
  s.author         = 'Voel'
  s.homepage       = 'https://github.com/goknsh/voel'
  s.platforms = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/goknsh/voel.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
