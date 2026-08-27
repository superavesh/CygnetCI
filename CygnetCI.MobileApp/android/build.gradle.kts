allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

// Some plugins (e.g. `vibration`) ship an old hardcoded compileSdk in their own Gradle
// module, which is now too low for the AndroidX libraries they transitively pull in.
// Force every plugin subproject to compile against the same SDK as the app itself.
// (":app" is excluded — evaluationDependsOn(":app") above forces it to evaluate early,
// so afterEvaluate can no longer attach to it here, and it already sets its own compileSdk.)
subprojects {
    if (project.name != "app") {
        afterEvaluate {
            extensions.findByName("android")?.let { ext ->
                val common = ext as com.android.build.gradle.BaseExtension
                common.compileSdkVersion(36)
            }
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
