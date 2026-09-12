Pod::Spec.new do |spec|
    spec.name                     = 'VoelPagingCore'
    spec.version                  = '0.0.0'
    spec.homepage                 = 'https://github.com/govoel/voel'
    spec.source                   = { :http=> ''}
    spec.authors                  = ''
    spec.license                  = ''
    spec.summary                  = 'Shared bounded paging engine'
    spec.vendored_frameworks      = 'build/cocoapods/framework/VoelPagingCore.framework'
    spec.libraries                = 'c++'
    spec.ios.deployment_target    = '18.0'
    if !Dir.exist?('build/cocoapods/framework/VoelPagingCore.framework') || Dir.empty?('build/cocoapods/framework/VoelPagingCore.framework')
        raise "
        Kotlin framework 'VoelPagingCore' doesn't exist yet, so a proper Xcode project can't be generated.
        'pod install' should be executed after running ':generateDummyFramework' Gradle task:
            ./gradlew :generateDummyFramework
        Alternatively, proper pod installation is performed during Gradle sync in the IDE (if Podfile location is set)"
    end
    spec.xcconfig = {
        'ENABLE_USER_SCRIPT_SANDBOXING' => 'NO',
    }
    spec.pod_target_xcconfig = {
        'KOTLIN_PROJECT_PATH' => '',
        'PRODUCT_MODULE_NAME' => 'VoelPagingCore',
    }
    spec.script_phases = [
        {
            :name => 'Build VoelPagingCore',
            :execution_position => :before_compile,
            :shell_path => '/bin/sh',
            :script => <<-SCRIPT
                if [ "YES" = "$OVERRIDE_KOTLIN_BUILD_IDE_SUPPORTED" ]; then
                    echo "Skipping Gradle build task invocation due to OVERRIDE_KOTLIN_BUILD_IDE_SUPPORTED environment variable set to \"YES\""
                    exit 0
                fi
                set -ev
                REPO_ROOT="$PODS_TARGET_SRCROOT"
                "$REPO_ROOT/gradlew" -p "$REPO_ROOT" $KOTLIN_PROJECT_PATH:syncFramework \
                    -Pkotlin.native.cocoapods.platform=$PLATFORM_NAME \
                    -Pkotlin.native.cocoapods.archs="$ARCHS" \
                    -Pkotlin.native.cocoapods.configuration="$CONFIGURATION"
            SCRIPT
        }
    ]
    spec.license = { :type => 'UNLICENSED' }
    spec.authors = 'Voel'
    spec.source = { :git => 'https://github.com/govoel/voel.git' }
end
