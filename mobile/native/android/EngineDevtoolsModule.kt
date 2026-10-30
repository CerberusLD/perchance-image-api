package com.aether.studio

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Puente JS -> DevtoolsClient.
 *
 * `generate` conduce el generador real dentro de la WebView oculta y devuelve
 * un data URL base64, una URL http, o un código "ERR:<etapa>" si falló.
 * `diagnose` devuelve un informe de texto con el estado del motor.
 */
class EngineDevtoolsModule(context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  override fun getName(): String = "EngineDevtools"

  @ReactMethod
  fun generate(prompt: String, promise: Promise) {
    Thread {
      try {
        promise.resolve(DevtoolsClient.generate(prompt))
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
  fun diagnose(promise: Promise) {
    Thread {
      try {
        promise.resolve(DevtoolsClient.diagnose())
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
