import { Show, createSignal } from 'solid-js'
import { state, setConfig } from '../state/store'
import { notifyPermission, requestNotifyPermission } from '../lib/notifications'

/** Schalter + Berechtigungs-Button für die Prio-Alarm-Benachrichtigung
    (Config und Setup-Wizard nutzen dieselbe Zeile). */
export function NotifySettings() {
  const [notifyState, setNotifyState] = createSignal(notifyPermission())

  async function handleRequestNotify() {
    setNotifyState(await requestNotifyPermission())
  }

  return (
    <>
      <div class="flex items-center gap-3 rounded-xl border border-zinc-600 bg-zinc-800 px-4 py-3">
        <div class="min-w-0 flex-1">
          <p class="text-sm text-zinc-300">Benachrichtigung bei Prio-Alarm</p>
          <p class="text-xs text-zinc-500 mt-0.5">
            {notifyState() === 'unsupported'
              ? 'In diesem Browser nicht verfügbar'
              : notifyState() === 'granted'
                ? 'Erlaubt — klingelt über den Benachrichtigungs-Kanal, nicht die Medien-Lautstärke'
                : notifyState() === 'denied'
                  ? 'Vom Browser blockiert — bitte in den Browser-Einstellungen erlauben'
                  : 'System-Notification + Vibration zusätzlich zum Weckton'}
          </p>
        </div>
        <button
          class="relative h-6 w-11 shrink-0 rounded-full transition-colors"
          classList={{
            'bg-emerald-500': state.config.alarmNotify,
            'bg-zinc-600': !state.config.alarmNotify,
          }}
          onClick={() => setConfig({ alarmNotify: !state.config.alarmNotify })}
          title="Benachrichtigung bei Prio-Alarm an/aus"
          aria-label="Prio-Alarm-Benachrichtigung an/aus"
        >
          <span
            class="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform"
            classList={{
              'translate-x-5': state.config.alarmNotify,
              'translate-x-0.5': !state.config.alarmNotify,
            }}
          />
        </button>
      </div>
      <Show when={state.config.alarmNotify && notifyState() === 'default'}>
        <button
          class="w-full rounded-xl border border-zinc-600 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-200 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
          onClick={handleRequestNotify}
        >
          Benachrichtigung erlauben …
        </button>
      </Show>
    </>
  )
}
