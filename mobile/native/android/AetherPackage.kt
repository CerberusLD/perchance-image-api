package com.aether.studio

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AetherPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(EngineDevtoolsModule(context), AppInstallerModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
