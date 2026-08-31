/**
 * Prio-Alarm-Benachrichtigungen:
 * - System-Notification (falls erlaubt): klingelt auf Android über den
 *   Benachrichtigungs-Kanal, nicht über die Medien-Lautstärke.
 * - Vibration (falls vorhanden): läuft komplett ohne Audio-Kanäle.
 * Beides kommt ZUSÄTZLICH zum Weckton (playAlarmBell) — der Ton läuft
 * weiter über den Medien-Kanal, damit bei stummem TTS trotzdem etwas hörbar
 * ist.
 */

export type NotifyPermission = NotificationPermission | 'unsupported'

function supported(): boolean {
  return typeof Notification !== 'undefined'
}

export function notifyPermission(): NotifyPermission {
  return supported() ? Notification.permission : 'unsupported'
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (!supported()) return 'unsupported'
  return Notification.requestPermission()
}

/** Prio-Alarm: System-Notification (nur bei erteilter Berechtigung) + Vibration */
export function notifyPrioAlarm(text: string): void {
  navigator.vibrate?.([600, 150, 600, 150, 600])
  if (!supported() || Notification.permission !== 'granted') return
  new Notification('⏰ Schritt fertig', {
    body: text,
    tag: 'murks-prio-alarm',
    requireInteraction: true,
    icon: `${import.meta.env.BASE_URL}pwa-192x192.png`,
  })
}

let autoInstalled = false

/** Einmalig: Berechtigung beim ersten Nutzer-Gestus anfordern (Pointer/Key).
    requestPermission braucht einen Gestus — der erste Tipp auf die Seite
    reicht, ein Menü/Button ist dafür nicht nötig. */
export function initAutoRequestNotify(shouldAsk: () => boolean): void {
  if (autoInstalled) return
  autoInstalled = true
  if (!supported()) return
  const ask = () => {
    if (Notification.permission !== 'default') {
      window.removeEventListener('pointerdown', ask)
      window.removeEventListener('keydown', ask)
      return
    }
    if (!shouldAsk()) return
    window.removeEventListener('pointerdown', ask)
    window.removeEventListener('keydown', ask)
    void Notification.requestPermission()
  }
  window.addEventListener('pointerdown', ask)
  window.addEventListener('keydown', ask)
}
