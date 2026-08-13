allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory = rootProject.layout.buildDirectory.dir("../../build").get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}

// 1. CRITICAL FIX: Place overrides BEFORE evaluationDependsOn
subprojects {
    afterEvaluate {
        val android = extensions.findByName("android")
        if (android != null) {
            try {
                // Safely forces all plugins (like file_picker) to use API 36
                val method = android.javaClass.getMethod("compileSdkVersion", Int::class.javaPrimitiveType)
                method.invoke(android, 36)
            } catch (e: Exception) {
                // Ignore if plugin is not an Android library
            }
        }
    }
}

// 2. Now it is safe to evaluate the app!
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}

// 3. Force Kotlin to JVM 11
subprojects {
    tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_11)
        }
    }
}