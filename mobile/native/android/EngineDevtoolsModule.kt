package com.aether.studio

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Puente JS -> DevtoolsClient.
 * `generate` conduce el generador real dentro de la WebView oculta y devuelve
 * la imagen como data URL base64 (o null si no hubo resultado).
 */
class EngineDevtoolsModule(context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  override fun getName(): String = "EngineDevtools"

  @ReactMethod
  fun generate(prompt: String, promise: Promise) {
    Thread {
      try {
        val result = DevtoolsClient.generate(prompt)
        promise.resolve(result)
      } catch (e: Exception) {
        promise.reject("cdp_error", e)
      }
    }.start()
  }

  @ReactMethod
  fun improve(prompt: String, promise: Promise) {
    Thread {
      try {
        promise.resolve(DevtoolsClient.improve(prompt))
      } catch (e: Exception) {
        promise.reject("cdp_error", e)
      }
    }.start()
  }

  @ReactMethod
  fun enableDebugging() {
    DevtoolsClient.enableDebugging()
  }
}
