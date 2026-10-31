package com.aether.studio

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/**
 * Instalación de una actualización descargada.
 *
 * Abre el instalador del sistema con el APK del caché de la app (FileProvider).
 * Si el usuario no ha permitido "instalar apps desconocidas" para Aether, se
 * abre directamente esa pantalla de ajustes.
 */
class AppInstallerModule(private val ctx: ReactApplicationContext) :
  ReactContextBaseJavaModule(ctx) {

  override fun getName(): String = "AppInstaller"

  @ReactMethod
  fun canInstall(promise: Promise) {
    try {
      val ok = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ctx.packageManager.canRequestPackageInstalls()
      } else {
        true
      }
      promise.resolve(ok)
    } catch (e: Exception) {
      promise.resolve(true)
    }
  }

  @ReactMethod
  fun openInstallSettings(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}"))
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("settings_error", e)
    }
  }

  @ReactMethod
  fun install(path: String, promise: Promise) {
    try {
      val clean = path.removePrefix("file://")
      val file = File(clean)
      if (!file.exists()) {
        promise.reject("missing_apk", "No se encontró el archivo descargado")
        return
      }
      val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", file)
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      ctx.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("install_error", e)
    }
  }
}
