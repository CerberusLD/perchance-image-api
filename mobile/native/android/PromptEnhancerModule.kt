package com.aether.studio

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Puente JS -> PromptEnhancer (modelo de prompts local).
 * `enhance` recibe el prompt ya en inglés y devuelve la versión mejorada.
 */
class PromptEnhancerModule(private val ctx: ReactApplicationContext) :
  ReactContextBaseJavaModule(ctx) {

  override fun getName(): String = "PromptEnhancer"

  @ReactMethod
  fun enhance(text: String, promise: Promise) {
    Thread {
      try {
        promise.resolve(PromptEnhancer.enhance(ctx, text))
      } catch (e: Exception) {
        promise.reject("enhance_error", e)
      }
    }.start()
  }

  /** Carga el modelo en segundo plano (primera llamada ~1-2 s). */
  @ReactMethod
  fun warmup(promise: Promise) {
    Thread {
      try {
        promise.resolve(PromptEnhancer.ensureLoaded(ctx))
      } catch (e: Exception) {
        promise.reject("warmup_error", e)
      }
    }.start()
  }
}
