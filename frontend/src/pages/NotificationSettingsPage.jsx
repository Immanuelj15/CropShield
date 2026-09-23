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
  Database,
  ArrowRight,
  WifiOff
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
import { getPendingCount, flushOfflineQueue, getPendingActions } from '../utils/offlineQueue';

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
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });

  // Preferences state
  const [pushEnabled, setPushEnabled] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('+919876543210');
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
      const res = await getNotificationPreferences();
      setPushEnabled(Boolean(res.has_push_subscription));
      setSmsEnabled(res.sms_enabled ?? true);
      setWhatsappEnabled(res.whatsapp_enabled ?? false);
      if (res.phone_number) setPhoneNumber(res.phone_number);
      if (res.preferred_language) setLanguage(res.preferred_language);
      if (res.quiet_hours) setQuietHours(res.quiet_hours);
    } catch (err) {
      console.warn('Could not load preferences from backend:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    try {
      const logs = await getNotificationLogs(10);
      setDeliveryLogs(logs || []);
    } catch (e) {
      // offline or silent
    }
  };

  const handleTogglePush = async () => {
    if (!pushSupported) {
      alert('Web Push is not supported by your current browser or device.');
      return;
    }

    if (pushEnabled) {
      // Unsubscribe flow
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
        await unsubscribePush();
        setPushEnabled(false);
        setStatusMessage({ type: 'success', text: 'Push notifications disabled.' });
      } catch (err) {
        setStatusMessage({ type: 'error', text: 'Error disabling push: ' + err.message });
      }
      return;
    }

    // Subscribe flow
    try {
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

      const { public_key } = await getVapidPublicKey();
      const reg = await navigator.serviceWorker.ready;

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
    }
  };

  const handleSavePreferences = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setStatusMessage({ type: '', text: '' });
    try {
      await updateNotificationPreferences({
        sms_enabled: smsEnabled,
        whatsapp_enabled: whatsappEnabled,
        phone_number: phoneNumber,
        preferred_language: language,
        quiet_hours: quietHours,
      });
      setStatusMessage({
        type: 'success',
        text: 'Delivery preferences updated successfully!',
      });
      setTimeout(() => setStatusMessage({ type: '', text: '' }), 4000);
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
      setStatusMessage({
        type: 'success',
        text: 'Test notification dispatched! Check your notifications / SMS logs.',
      });
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
      const res = await flushOfflineQueue();
      await refreshOfflineStatus();
      setStatusMessage({
        type: 'success',
        text: `Queue flushed: ${res.processed} item(s) synchronized to server.`,
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
        <RefreshCw className="w-8 h-8 animate-spin text-emerald-600 mb-2" />
        <p className="text-sm font-medium">Loading notification settings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="border-b border-stone-200 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-xl">
            <Radio className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-900 tracking-tight">
              Multi-Channel Alert Delivery & Offline PWA
            </h1>
            <p className="text-sm text-stone-500 mt-0.5">
              Guaranteed delivery infrastructure: Web Push, SMS, and WhatsApp fallback for rural connectivity.
            </p>
          </div>
        </div>
      </div>

      {/* Status banner */}
      {statusMessage.text && (
        <div
          className={`p-4 rounded-xl text-sm flex items-center gap-3 ${
            statusMessage.type === 'error'
              ? 'bg-rose-50 text-rose-800 border border-rose-200'
              : statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-blue-50 text-blue-800 border border-blue-200'
          }`}
        >
          {statusMessage.type === 'error' ? (
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />
          ) : (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSavePreferences} className="space-y-6">
        {/* Delivery Channels Card */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-6">
          <h2 className="text-lg font-semibold text-stone-800 flex items-center gap-2">
            <Bell className="w-5 h-5 text-emerald-600" />
            Alert Delivery Channels
          </h2>

          <div className="space-y-4">
            {/* Channel 1: Web Push */}
            <div className="flex items-start justify-between p-4 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition">
              <div className="flex items-start gap-3 max-w-xl">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg shrink-0 mt-0.5">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-stone-900">Web Push (Installed PWA)</span>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      Zero SMS Cost
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 mt-1">
                    Instant alerts on your phone or tablet even when the browser or app is closed.
                    Recommended for farmers with regular internet access.
                  </p>
                  {pushSupported && (
                    <div className="mt-2 text-xs font-medium text-stone-600">
                      Browser Status:{' '}
                      <span
                        className={`capitalize font-semibold ${
                          pushEnabled ? 'text-emerald-600' : 'text-stone-500'
                        }`}
                      >
                        {pushEnabled ? 'Subscribed & Active' : permissionState}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleTogglePush}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  pushEnabled ? 'bg-emerald-600' : 'bg-stone-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    pushEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Channel 2: Universal SMS */}
            <div className="flex items-start justify-between p-4 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition">
              <div className="flex items-start gap-3 max-w-xl">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-lg shrink-0 mt-0.5">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-stone-900">Universal SMS Fallback</span>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                      Works on Any Mobile
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 mt-1">
                    Delivered via cellular GSM network. Critical for rural areas in Tamil Nadu where 4G/5G data drops.
                    Automatically triggers if Web Push is absent.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSmsEnabled(!smsEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  smsEnabled ? 'bg-emerald-600' : 'bg-stone-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    smsEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Channel 3: WhatsApp Alert */}
            <div className="flex items-start justify-between p-4 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition">
              <div className="flex items-start gap-3 max-w-xl">
                <div className="p-2 bg-green-100 text-green-700 rounded-lg shrink-0 mt-0.5">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-stone-900">WhatsApp Advisory</span>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                      Rich Formatting & Links
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 mt-1">
                    Direct WhatsApp notifications with formatted treatment prescriptions and direct links to the voice assistant.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWhatsappEnabled(!whatsappEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  whatsappEnabled ? 'bg-emerald-600' : 'bg-stone-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    whatsappEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Registered Mobile Number */}
          <div className="pt-2 border-t border-stone-100">
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Registered Mobile Number (for SMS & WhatsApp)
            </label>
            <div className="relative max-w-md">
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+919876543210"
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
              />
            </div>
            <p className="text-xs text-stone-400 mt-1">
              Include country code (e.g. +91 for India).
            </p>
          </div>
        </div>

        {/* Multilingual & Quiet Hours Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Preferred Language */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-stone-800 flex items-center gap-2">
              <Globe className="w-5 h-5 text-emerald-600" />
              Alert Language (மொழி / भाषा)
            </h2>
            <p className="text-xs text-stone-500">
              Alerts and prescriptions are automatically translated into your preferred regional dialect.
            </p>

            <div className="space-y-2.5">
              {[
                { id: 'ta', label: 'தமிழ் (Tamil)', desc: 'உள்ளூர் மொழி விழிப்பூட்டல்கள்' },
                { id: 'en', label: 'English', desc: 'Standard Agronomic English' },
                { id: 'hi', label: 'हिंदी (Hindi)', desc: 'क्षेत्रीय हिंदी चेतावनी' },
              ].map((item) => (
                <label
                  key={item.id}
                  className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                    language === item.id
                      ? 'border-emerald-600 bg-emerald-50/60 font-semibold text-emerald-950'
                      : 'border-stone-200 hover:bg-stone-50 text-stone-700'
                  }`}
                >
                  <div>
                    <div className="text-sm">{item.label}</div>
                    <div className="text-xs text-stone-400 font-normal">{item.desc}</div>
                  </div>
                  <input
                    type="radio"
                    name="preferred_language"
                    value={item.id}
                    checked={language === item.id}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Quiet Hours Picker */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-stone-800 flex items-center gap-2">
              <Moon className="w-5 h-5 text-indigo-600" />
              Quiet Hours (Do Not Disturb)
            </h2>
            <p className="text-xs text-stone-500">
              Non-urgent notifications will be queued and delivered in the morning.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">
                  Start (Night)
                </label>
                <div className="relative">
                  <input
                    type="time"
                    value={quietHours.start}
                    onChange={(e) =>
                      setQuietHours({ ...quietHours, start: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">
                  End (Morning)
                </label>
                <div className="relative">
                  <input
                    type="time"
                    value={quietHours.end}
                    onChange={(e) =>
                      setQuietHours({ ...quietHours, end: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/60 text-xs text-amber-900 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                <strong>Urgent Override:</strong> Severe <em>High Risk</em> pest alerts and regional outbreaks bypass quiet hours to protect your yield.
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-sm shadow-sm transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Delivery Preferences'}
          </button>

          <button
            type="button"
            onClick={handleSendTest}
            disabled={testing}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-900 text-white font-medium text-sm shadow-sm transition disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {testing ? 'Dispatching...' : 'Send Test Notification'}
          </button>
        </div>
      </form>

      {/* Offline Action Queue Diagnostic Card */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-stone-800">
              Offline Action Queue (IndexedDB Storage)
            </h2>
          </div>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
              pendingCount > 0
                ? 'bg-amber-100 text-amber-900'
                : 'bg-emerald-100 text-emerald-900'
            }`}
          >
            {pendingCount} item{pendingCount === 1 ? '' : 's'} queued
          </span>
        </div>

        <p className="text-xs text-stone-500">
          When you upload leaf images or record treatment interventions in zero-connectivity field zones, submissions are compressed client-side and saved into IndexedDB. They automatically flush via Background Sync once network connection returns.
        </p>

        {pendingItems.length > 0 ? (
          <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden bg-stone-50/50">
            {pendingItems.map((item) => (
              <div key={item.id} className="p-3 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-stone-400" />
                  <span className="font-semibold text-stone-700 capitalize">
                    {item.type.replace('_', ' ')}
                  </span>
                  <span className="text-stone-400">
                    Queued at {new Date(item.queued_at).toLocaleTimeString()}
                  </span>
                </div>
                <span className="text-amber-700 font-medium">Pending Auto-Sync</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-100 text-xs text-stone-500 text-center">
            All offline actions are synchronized with the server database.
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={handleFlushQueue}
            disabled={syncingQueue || pendingCount === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingQueue ? 'animate-spin' : ''}`} />
            {syncingQueue ? 'Synchronizing Queue...' : 'Force Sync Offline Queue Now'}
          </button>
        </div>
      </div>

      {/* Delivery Audit Logs */}
      {deliveryLogs.length > 0 && (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold text-stone-800 flex items-center gap-2">
            <Clock className="w-5 h-5 text-stone-500" />
            Recent Notification Audit Logs
          </h2>
          <p className="text-xs text-stone-500">
            Auditable trail of alerts delivered to your devices and fallback carriers.
          </p>

          <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden">
            {deliveryLogs.map((log) => (
              <div key={log.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-stone-800 uppercase text-[10px] px-2 py-0.5 bg-stone-100 rounded">
                      {log.channel}
                    </span>
                    <span className="font-medium text-stone-600">
                      {log.event_type.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-stone-700">{log.message}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 sm:text-right">
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                      log.status === 'sent'
                        ? 'bg-emerald-100 text-emerald-800'
                        : log.status === 'queued'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {log.status}
                  </span>
                  <span className="text-stone-400 text-[11px]">
                    {new Date(log.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
