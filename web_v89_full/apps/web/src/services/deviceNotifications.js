let audioContext;
let ringtoneTimer;

function getAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioContext = new AudioContextClass();
  }
  return audioContext;
}

export async function unlockNotificationAudio() {
  const context = getAudioContext();
  if (context?.state === 'suspended') await context.resume().catch(() => {});
}

function tone(frequency, duration = 0.16, volume = 0.08, delay = 0) {
  const context = getAudioContext();
  if (!context || context.state !== 'running') return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const start = context.currentTime + delay;
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

export function playMessageSound() {
  tone(740, 0.12, 0.07, 0);
  tone(980, 0.16, 0.065, 0.13);
}

export function startRingtone() {
  stopRingtone();
  const ring = () => {
    tone(520, 0.32, 0.08, 0);
    tone(660, 0.32, 0.08, 0.38);
    tone(820, 0.4, 0.075, 0.76);
  };
  ring();
  ringtoneTimer = window.setInterval(ring, 2200);
  return stopRingtone;
}

export function stopRingtone() {
  if (ringtoneTimer) window.clearInterval(ringtoneTimer);
  ringtoneTimer = null;
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.requestPermission();
}

export function showDeviceNotification(title, options = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const payload = {
    body: options.body || '',
    icon: options.icon || '/icon.svg',
    badge: '/icon.svg',
    tag: options.tag,
    renotify: true,
    data: { ...(options.data || {}), path: options.path || '/chats' }
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => registration.showNotification(title, payload))
      .catch(() => showWindowNotification(title, options));
    return;
  }
  showWindowNotification(title, options);
}

function showWindowNotification(title, options = {}) {
  try {
    const notification = new Notification(title, {
      body: options.body || '',
      icon: options.icon || '/icon.svg',
      tag: options.tag,
      renotify: true,
      data: options.data || {}
    });
    notification.onclick = () => {
      window.focus();
      if (options.path) window.location.assign(options.path);
      notification.close();
    };
  } catch {
    // Some mobile browsers only allow ServiceWorkerRegistration.showNotification().
  }
}
