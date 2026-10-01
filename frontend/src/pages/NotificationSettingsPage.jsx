import React, { useState, useEffect } from 'react';
import {
  Bell,
  Smartphone,
  MessageSquare,
  Globe,
  Moon,
  Send,
  Save,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Radio,
  Clock,
  Database
} from 'lucide-react';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  getVapidPublicKey,
  subscribePush,
  unsubscribePush,
  sendTestNotification,
  getNotificationLogs
} from '../utils/api';
import { getPendingCount, flushOfflineQueue, getPendingActions, describeAction } from '../utils/offlineQueue';
import Toggle from '../components/ui/Toggle';
import { useToast } from '../components/ui/Toast';
import { ErrorState } from '../components';

// Backend timestamps are naive UTC ISO strings (datetime.utcnow().isoformat()) — parse them as UTC.
function parseUtc(value) {
  if (!value) return null;
  const s = String(value);
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const humanize = (s) => String(s || '').replace(/_/g, ' ');

const PHONE_RE = /^\+?\d{8,15}$/;

const LOG_STATUS_CLASS = {
  sent: 'bg-green-100 text-green-800',
  delivered: 'bg-green-100 text-green-800',
  delivered_from_queue: 'bg-green-100 text-green-800',
  queued: 'bg-amber-100 text-amber-800',
  delivering: 'bg-amber-100 text-amber-800',
};

const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';

// P2-11: navigator.serviceWorker.ready never resolves when no SW is registered (e.g. dev mode
// or an install failure). Race it against a timeout so the UI shows a clear message instead of hanging.
const SW_READY_TIMEOUT_MS = 8000;
function serviceWorkerReadyWithTimeout(timeoutMs = SW_READY_TIMEOUT_MS) {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('The offline service worker is not active yet. Reload the app (or install it as a PWA) and try again.')),
        timeoutMs
      )
    ),
  ]);
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function NotificationSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  // null = unknown, false = server has no VAPID keys (push disabled server-side)
  const [serverPushEnabled, setServerPushEnabled] = useState(null);
  const [testing, setTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });

  // Preferences state
  const [pushEnabled, setPushEnabled] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [language, setLanguage] = useState('en');
  const [quietHours, setQuietHours] = useState({ start: '21:00', end: '06:00' });

  // Browser push support
  const [pushSupported, setPushSupported] = useState(false);
  const [permissionState, setPermissionState] = useState('default');

  // Logs & Offline queue status
  const [deliveryLogs, setDeliveryLogs] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingItems, setPendingItems] = useState([]);
  const [syncingQueue, setSyncingQueue] = useState(false);
  const toast = useToast();

  useEffect(() => {
    // Check Web Push support in browser
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      setPushSupported(true);
      if ('Notification' in window) {
        setPermissionState(Notification.permission);
      }
    }

    loadPreferences();
    loadLogs();
    refreshOfflineStatus();
    getVapidPublicKey()
      .then((res) => setServerPushEnabled(Boolean(res?.public_key) && res?.push_enabled !== false))
      .catch(() => setServerPushEnabled(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshOfflineStatus = async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
      const items = await getPendingActions();
      setPendingItems(items);
    } catch (e) {
      console.error(e);
    }
  };

  const loadPreferences = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const res = await getNotificationPreferences();
      setPushEnabled(Boolean(res.has_push_subscription));
      setSmsEnabled(res.sms_enabled ?? true);
      setWhatsappEnabled(res.whatsapp_enabled ?? false);
      setPhoneNumber(res.phone_number || '');
      if (res.preferred_language) setLanguage(res.preferred_language);
      if (res.quiet_hours) {
        setQuietHours({
          start: res.quiet_hours.start || '21:00',
          end: res.quiet_hours.end || '06:00',
        });
      }
    } catch (err) {
      // Don't silently show defaults: saving them would overwrite the real preferences.
      setLoadError(err?.message || 'Could not load your notification preferences.');
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    try {
      const logs = await getNotificationLogs(10);
      setDeliveryLogs(Array.isArray(logs) ? logs : []);
    } catch (e) {
      // offline or silent
    }
  };

  const handleTogglePush = async () => {
    if (pushBusy) return;
    if (!pushSupported) {
      toast.error('Web Push is not supported by your current browser or device.');
      return;
    }

    if (pushEnabled) {
      // Unsubscribe flow: always clear the server-side subscription, even if the SW is not active.
      setPushBusy(true);
      try {
        try {
          const reg = await serviceWorkerReadyWithTimeout();
          const sub = await reg.pushManager.getSubscription();
          if (sub) await sub.unsubscribe();
        } catch (swErr) {
          console.warn('Could not remove browser push subscription:', swErr);
        }
        await unsubscribePush();
        setPushEnabled(false);
        setStatusMessage({ type: 'success', text: 'Push notifications disabled.' });
      } catch (err) {
        setStatusMessage({ type: 'error', text: 'Error disabling push: ' + err.message });
      } finally {
        setPushBusy(false);
      }
      return;
    }

    // Subscribe flow
    setPushBusy(true);
    try {
      // Check the server first so we never ask for browser permission when push cannot work.
      const { public_key, push_enabled } = await getVapidPublicKey();
      if (!public_key || push_enabled === false) {
        setServerPushEnabled(false);
        setStatusMessage({
          type: 'error',
          text: 'Web Push is not configured on the server yet (no VAPID key). SMS / WhatsApp alerts still work.',
        });
        return;
      }
      setServerPushEnabled(true);

      setStatusMessage({ type: 'info', text: 'Requesting notification permission...' });
      const perm = await Notification.requestPermission();
      setPermissionState(perm);

      if (perm !== 'granted') {
        setStatusMessage({
          type: 'error',
          text: 'Push notification permission was denied in your browser settings.',
        });
        return;
      }

      const reg = await serviceWorkerReadyWithTimeout();

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(public_key),
      });

      await subscribePush(sub.toJSON());
      setPushEnabled(true);
      setStatusMessage({
        type: 'success',
        text: 'Web Push enabled successfully! Installed PWA alerts are active.',
      });
    } catch (err) {
      console.error('Push subscription failed:', err);
      setStatusMessage({
        type: 'error',
        text: 'Push subscription registration failed: ' + err.message,
      });
    } finally {
      setPushBusy(false);
    }
  };

  const handleSavePreferences = async (e) => {
    e?.preventDefault();
    const cleanedPhone = phoneNumber.replace(/[\s\-()]/g, '');
    if (cleanedPhone && !PHONE_RE.test(cleanedPhone)) {
      setStatusMessage({
        type: 'error',
        text: 'Enter a valid mobile number with country code, e.g. +91 followed by 10 digits.',
      });
      return;
    }
    if (!quietHours.start || !quietHours.end) {
      setStatusMessage({ type: 'error', text: 'Set both a start and an end time for quiet hours.' });
      return;
    }
    if ((smsEnabled || whatsappEnabled) && !cleanedPhone) {
      setStatusMessage({
        type: 'info',
        text: 'Add a mobile number so SMS / WhatsApp alerts can reach you. Saving other preferences…',
      });
    } else {
      setStatusMessage({ type: '', text: '' });
    }
    setSaving(true);
    try {
      await updateNotificationPreferences({
        sms_enabled: smsEnabled,
        whatsapp_enabled: whatsappEnabled,
        // Send '' (not null) so clearing the field actually removes the saved number;
        // the backend ignores null.
        phone_number: cleanedPhone,
        preferred_language: language,
        quiet_hours: quietHours,
      });
      setPhoneNumber(cleanedPhone);
      const successText = 'Delivery preferences updated successfully!';
      setStatusMessage({ type: 'success', text: successText });
      setTimeout(
        () => setStatusMessage((prev) => (prev.text === successText ? { type: '', text: '' } : prev)),
        4000
      );
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: 'Failed to update preferences: ' + err.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    setTesting(true);
    setStatusMessage({ type: 'info', text: 'Sending test notification through configured channels...' });
    try {
      const res = await sendTestNotification({});
      // The router always answers "dispatched"; the real outcome is in details.status
      // (sent | delivered | queued | failed | error).
      const outcome = res?.details?.status;
      if (outcome === 'sent' || outcome === 'delivered') {
        setStatusMessage({
          type: 'success',
          text: 'Test notification delivered. Check your device and the delivery log below.',
        });
      } else if (outcome === 'queued') {
        setStatusMessage({
          type: 'info',
          text: 'You are inside your quiet hours, so the test was queued and will be delivered after they end.',
        });
      } else if (outcome === 'failed' && res?.details?.reason === 'no_channels') {
        setStatusMessage({
          type: 'error',
          text: 'No delivery channel is active. Enable Web Push, or save a mobile number with SMS / WhatsApp turned on, then try again.',
        });
      } else if (outcome === 'failed' || outcome === 'error') {
        setStatusMessage({
          type: 'error',
          text: 'Test notification could not be delivered. See the delivery log below for details.',
        });
      } else {
        setStatusMessage({ type: 'success', text: 'Test notification dispatched.' });
      }
      loadLogs();
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: 'Test dispatch failed: ' + err.message,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleFlushQueue = async () => {
    setSyncingQueue(true);
    try {
      const res = await flushOfflineQueue({ force: true });
      await refreshOfflineStatus();
      if (res?.error) throw res.error;
      const parts = [`${res.processed} item(s) synchronized to server`];
      if (res.retrying) parts.push(`${res.retrying} will retry later`);
      if (res.failed) parts.push(`${res.failed} rejected by the server (see the banner at the top to review)`);
      setStatusMessage({
        type: res.failed ? 'error' : 'success',
        text: `Queue flushed: ${parts.join(', ')}.`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: 'Queue synchronization error: ' + err.message,
      });
    } finally {
      setSyncingQueue(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-stone-500">
        <RefreshCw className="w-8 h-8 animate-spin text-brand-600 mb-2" />
        <p className="text-sm font-medium">Loading notification settings...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-4xl mx-auto">
        <ErrorState
          message={`Could not load your notification preferences. ${loadError}`}
          onRetry={loadPreferences}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="border-b border-stone-200 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand-100 text-brand-800 rounded-xl shrink-0">
            <Radio className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-stone-900 tracking-tight">
              Notification Settings
            </h1>
            <p className="text-sm text-stone-600 mt-0.5">
              Choose how AgriGuard AI alerts reach you: Web Push, SMS and WhatsApp, plus your offline sync queue.
            </p>
          </div>
        </div>
      </div>

      {/* Status banner */}
      {statusMessage.text && (
        <div
          role={statusMessage.type === 'error' ? 'alert' : 'status'}
          className={`p-4 rounded-xl text-sm flex items-start gap-3 ${
            statusMessage.type === 'error'
              ? 'bg-red-50 text-red-800 border border-red-200'
              : statusMessage.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-sky-50 text-sky-800 border border-sky-200'
          }`}
        >
          {statusMessage.type === 'error' ? (
            <AlertTriangle className="w-5 h-5 shrink-0 text-red-600" />
          ) : statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-green-600" />
          ) : (
            <Bell className="w-5 h-5 shrink-0 text-sky-600" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSavePreferences} className="space-y-6">
        {/* Delivery Channels Card */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-6">
          <h2 className="text-lg font-semibold text-stone-800 flex items-center gap-2">
            <Bell className="w-5 h-5 text-brand-600" />
            Alert Delivery Channels
          </h2>

          <div className="space-y-4">
            {/* Channel 1: Web Push */}
            <div className="flex items-start justify-between gap-3 p-4 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition">
              <div className="flex items-start gap-3 max-w-xl min-w-0">
                <div className="p-2 bg-brand-100 text-brand-700 rounded-lg shrink-0 mt-0.5">
                  <Bell className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-stone-900">Web Push (Installed App)</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-brand-100 text-brand-800">
                      No SMS Cost
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 mt-1">
                    Instant alerts on your phone or tablet even when the browser or app is closed.
                    Recommended if you have regular internet access.
                  </p>
                  {!pushSupported && (
                    <p className="mt-2 text-xs font-medium text-amber-700">
                      This browser does not support Web Push. Use SMS or WhatsApp instead.
                    </p>
                  )}
                  {pushSupported && serverPushEnabled === false && !pushEnabled && (
                    <p className="mt-2 text-xs font-medium text-amber-700">
                      Web Push is not enabled on the server yet. SMS and WhatsApp alerts still work.
                    </p>
                  )}
                  {pushSupported && (
                    <div className="mt-2 text-xs font-medium text-stone-600">
                      Browser status:{' '}
                      <span
                        className={`font-semibold ${
                          pushEnabled ? 'text-green-700' : permissionState === 'denied' ? 'text-red-700' : 'text-stone-600'
                        }`}
                      >
                        {pushEnabled
                          ? 'Subscribed and active'
                          : permissionState === 'granted'
                          ? 'Permission granted (not subscribed)'
                          : permissionState === 'denied'
                          ? 'Blocked in browser settings'
                          : 'Not enabled'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="shrink-0">
                <Toggle
                  aria-label="Web Push notifications"
                  checked={pushEnabled}
                  onChange={handleTogglePush}
                  disabled={pushBusy || !pushSupported || (serverPushEnabled === false && !pushEnabled)}
                />
              </div>
            </div>

            {/* Channel 2: Universal SMS */}
            <div className="flex items-start justify-between gap-3 p-4 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition">
              <div className="flex items-start gap-3 max-w-xl min-w-0">
                <div className="p-2 bg-sky-100 text-sky-700 rounded-lg shrink-0 mt-0.5">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-stone-900">SMS Alerts</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
                      Works on Any Mobile
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 mt-1">
                    Delivered over the regular mobile network, so alerts arrive even where 4G/5G data drops.
                    Used whenever Web Push is unavailable. Needs a saved mobile number.
                  </p>
                </div>
              </div>
              <div className="shrink-0">
                <Toggle aria-label="SMS alerts" checked={smsEnabled} onChange={setSmsEnabled} />
              </div>
            </div>

            {/* Channel 3: WhatsApp Alert */}
            <div className="flex items-start justify-between gap-3 p-4 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition">
              <div className="flex items-start gap-3 max-w-xl min-w-0">
                <div className="p-2 bg-brand-100 text-brand-700 rounded-lg shrink-0 mt-0.5">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-stone-900">WhatsApp Alerts</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-brand-100 text-brand-800">
                      Detailed Advice
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 mt-1">
                    WhatsApp messages with the alert and treatment advice. Needs a saved mobile number.
                  </p>
                </div>
              </div>
              <div className="shrink-0">
                <Toggle aria-label="WhatsApp alerts" checked={whatsappEnabled} onChange={setWhatsappEnabled} />
              </div>
            </div>
          </div>

          {/* Registered Mobile Number */}
          <div className="pt-2 border-t border-stone-100">
            <label htmlFor="notif-phone" className="label">
              Mobile Number (for SMS & WhatsApp)
            </label>
            <div className="relative max-w-md">
              <input
                id="notif-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={20}
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+91 9xxxxxxxxx"
                className="input-field"
              />
            </div>
            <p className="text-xs text-stone-500 mt-1">
              Include the country code (e.g. +91 for India). Leave empty to remove your number.
            </p>
          </div>
        </div>

        {/* Multilingual & Quiet Hours Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Preferred Language */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-stone-800 flex items-center gap-2">
              <Globe className="w-5 h-5 text-brand-600" />
              Alert Language (மொழி / भाषा)
            </h2>
            <p className="text-xs text-stone-500">
              SMS, WhatsApp and push alerts are sent in the language you choose here.
            </p>

            <div className="space-y-2.5" role="radiogroup" aria-label="Alert language">
              {[
                { id: 'ta', label: 'தமிழ் (Tamil)', desc: 'தமிழில் எச்சரிக்கைகள்' },
                { id: 'en', label: 'English', desc: 'Alerts in English' },
                { id: 'hi', label: 'हिंदी (Hindi)', desc: 'हिंदी में चेतावनी' },
                { id: 'te', label: 'తెలుగు (Telugu)', desc: 'తెలుగులో హెచ్చరికలు' },
                { id: 'ml', label: 'മലയാളം (Malayalam)', desc: 'മലയാളത്തിൽ മുന്നറിയിപ്പുകൾ' },
              ].map((item) => (
                <label
                  key={item.id}
                  className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                    language === item.id
                      ? 'border-brand-600 bg-brand-50/60 font-semibold text-brand-900'
                      : 'border-stone-200 hover:bg-stone-50 text-stone-700'
                  }`}
                >
                  <div>
                    <div className="text-sm">{item.label}</div>
                    <div className="text-xs text-stone-500 font-normal">{item.desc}</div>
                  </div>
                  <input
                    type="radio"
                    name="preferred_language"
                    value={item.id}
                    checked={language === item.id}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-4 h-4 text-brand-600 focus:ring-brand-500"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Quiet Hours Picker */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-stone-800 flex items-center gap-2">
              <Moon className="w-5 h-5 text-brand-600" />
              Quiet Hours (Do Not Disturb)
            </h2>
            <p className="text-xs text-stone-500">
              Non-urgent notifications are held during these hours (India time) and delivered when they end.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label htmlFor="quiet-start" className="block text-xs font-medium text-stone-600 mb-1">
                  Start (Night)
                </label>
                <div className="relative">
                  <input
                    id="quiet-start"
                    required
                    type="time"
                    value={quietHours.start}
                    onChange={(e) =>
                      setQuietHours({ ...quietHours, start: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="quiet-end" className="block text-xs font-medium text-stone-600 mb-1">
                  End (Morning)
                </label>
                <div className="relative">
                  <input
                    id="quiet-end"
                    required
                    type="time"
                    value={quietHours.end}
                    onChange={(e) =>
                      setQuietHours({ ...quietHours, end: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/60 text-xs text-amber-900 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                <strong>Urgent override:</strong> <em>High Risk</em> pest alerts bypass quiet hours to protect your yield.
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <button
            type="submit"
            disabled={saving}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING}`}
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>

          <button
            type="button"
            onClick={handleSendTest}
            disabled={testing}
            title="Uses your saved preferences — save any changes first"
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING}`}
          >
            {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {testing ? 'Sending...' : 'Send Test Notification'}
          </button>
        </div>
      </form>

      {/* Offline Action Queue Diagnostic Card */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-brand-600" />
            <h2 className="text-lg font-semibold text-stone-800">
              Offline Sync Queue
            </h2>
          </div>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
              pendingCount > 0
                ? 'bg-amber-100 text-amber-900'
                : 'bg-green-100 text-green-800'
            }`}
          >
            {pendingCount} item{pendingCount === 1 ? '' : 's'} queued
          </span>
        </div>

        <p className="text-xs text-stone-500">
          Leaf photos, treatment logs, expenses and revenue recorded without a connection are saved on this device
          and sent automatically once you are back online.
        </p>

        {pendingItems.length > 0 ? (
          <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden bg-stone-50/50">
            {pendingItems.map((item) => (
              <div key={item.id} className="p-3 text-xs flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-stone-500" />
                  <span className="font-semibold text-stone-700">
                    {describeAction(item)}
                  </span>
                  <span className="text-stone-500">
                    Queued {item.queued_at ? new Date(item.queued_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                  </span>
                </div>
                <span className="text-amber-700 font-medium">Waiting to sync</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-100 text-xs text-stone-500 text-center">
            Everything recorded offline has been sent to the server.
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={handleFlushQueue}
            disabled={syncingQueue || pendingCount === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingQueue ? 'animate-spin' : ''}`} />
            {syncingQueue ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Delivery Audit Logs */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-stone-800 flex items-center gap-2">
            <Clock className="w-5 h-5 text-stone-500" />
            Recent Deliveries
          </h2>
          <button
            type="button"
            onClick={loadLogs}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-stone-600 hover:bg-stone-100 transition ${FOCUS_RING}`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
        <p className="text-xs text-stone-500">
          The last 10 alerts sent to you, with the channel used and whether delivery succeeded.
        </p>

        {deliveryLogs.length === 0 ? (
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-100 text-xs text-stone-500 text-center">
            No notifications have been sent to you yet. Use "Send Test Notification" to check your setup.
          </div>
        ) : (
          <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden">
            {deliveryLogs.map((log, idx) => {
              const sentAt = parseUtc(log.sent_at);
              return (
                <div key={log.id || idx} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-stone-800 uppercase text-xs px-2 py-0.5 bg-stone-100 rounded">
                        {log.channel || '—'}
                      </span>
                      <span className="font-medium text-stone-600 capitalize">
                        {humanize(log.event_type)}
                      </span>
                    </div>
                    <p className="text-stone-700 break-words">{log.message}</p>
                    {log.error && log.status !== 'queued' && (
                      <p className="text-red-700 break-words">{log.error}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 sm:text-right">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold capitalize ${
                        LOG_STATUS_CLASS[log.status] || 'bg-red-100 text-red-800'
                      }`}
                    >
                      {humanize(log.status)}
                    </span>
                    {sentAt && (
                      <span className="text-stone-500 text-xs">
                        {sentAt.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
