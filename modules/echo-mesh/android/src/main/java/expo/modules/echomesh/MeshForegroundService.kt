package expo.modules.echomesh

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Keeps the mesh alive when the app is backgrounded. Started on demand from
 * [EchoMeshModule.start] (once the backend is up).
 *
 * STAGE 2 status: the service is registered in the manifest via the in-tree
 * config plugin, and the notification scaffolding is real. The bridge to
 * trigger it from the module is a TODO; for now the module runs without
 * elevation, which means Android will background-throttle the BLE/Nearby
 * loops after a few minutes.
 */
class MeshForegroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val n = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
    } else {
      startForeground(NOTIF_ID, n)
    }
    return START_STICKY
  }

  private fun buildNotification(): Notification {
    val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val chan = NotificationChannel(CHAN_ID, "Echo mesh", NotificationManager.IMPORTANCE_LOW)
      mgr.createNotificationChannel(chan)
    }
    return NotificationCompat.Builder(this, CHAN_ID)
      .setContentTitle("Echo")
      .setContentText("Mesh active — listening for nearby peers")
      .setOngoing(true)
      .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
      .build()
  }

  companion object {
    private const val CHAN_ID = "echo.mesh"
    private const val NOTIF_ID = 32337
  }
}
