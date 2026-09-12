plugins {
    kotlin("multiplatform") version "2.4.20"
    kotlin("native.cocoapods") version "2.4.20"
}

version = "0.0.0"

kotlin {
    jvm()
    iosArm64()
    iosSimulatorArm64()
    cocoapods {
        summary = "Shared bounded paging engine"
        homepage = "https://github.com/govoel/voel"
        ios.deploymentTarget = "18.0"
        extraSpecAttributes["license"] = "{ :type => 'UNLICENSED' }"
        extraSpecAttributes["authors"] = "'Voel'"
        extraSpecAttributes["source"] = "{ :git => 'https://github.com/govoel/voel.git' }"
        framework {
            baseName = "VoelPagingCore"
            isStatic = true
        }
    }
    sourceSets {
        commonMain.dependencies {
            implementation("androidx.paging:paging-common:${property("pagingVersion")}")
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:${property("coroutinesVersion")}")
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:${property("coroutinesVersion")}")
        }
    }
}
