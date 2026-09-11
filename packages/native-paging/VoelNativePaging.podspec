require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))
core = File.expand_path('core', __dir__)

# CocoaPods needs a framework skeleton to inspect before the first Xcode build. Kotlin's
# CocoaPods plugin then builds/syncs the correct architecture and configuration in Xcode.
unless system(File.join(core, 'gradlew'), '-p', core, 'generateDummyFramework', 'podspec', :out => $stderr)
  raise 'Could not prepare VoelPagingCore. Check the Gradle output above and your JDK installation.'
end

Pod::Spec.new do |s|
  s.name = 'VoelNativePaging'
  s.version = package['version']
  s.summary = package['description']
  s.homepage = 'https://github.com/govoel/voel'
  s.license = { :type => 'UNLICENSED' }
  s.author = 'Voel'
  s.source = { :git => 'https://github.com/govoel/voel.git' }
  s.platform = :ios, '18.0'
  s.swift_version = '5.9'
  s.static_framework = true
  s.source_files = 'ios/*.swift'
  s.dependency 'ExpoModulesCore'
  s.dependency 'VoelPagingCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
