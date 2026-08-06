import { useState, useRef, useCallback, useEffect } from 'react';
import { User, Building2, Bell, Shield, Globe, Save, Upload, CheckCircle2, Palette, Percent, DollarSign, Download, FileUp, AlertTriangle, Loader2, Info, Database, HardDrive, Calendar, Tag, FolderOpen } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { api, APP_VERSION } from '@/lib/api';
import { getDbInfo, verifyIntegrity } from '@/lib/db';

type Tab = 'profile' | 'business' | 'notifications' | 'security' | 'about';

const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'business', label: 'Business', icon: Building2 },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'about', label: 'About', icon: Info },
];

const currencies = [
  { code: 'INR', symbol: '₹', label: 'Indian Rupee (₹)' },
  { code: 'USD', symbol: '$', label: 'US Dollar ($)' },
  { code: 'EUR', symbol: '€', label: 'Euro (€)' },
  { code: 'GBP', symbol: '£', label: 'British Pound (£)' },
  { code: 'AED', symbol: 'AED', label: 'UAE Dirham (AED)' },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar (A$)' },
  { code: 'JPY', symbol: '¥', label: 'Japanese Yen (¥)' },
];

const themes = [
  { id: 'light', label: 'Light', desc: 'Clean, bright default theme' },
  { id: 'dark', label: 'Dark', desc: 'Reduced glare for low-light environments' },
  { id: 'system', label: 'System', desc: 'Follow your device preference' },
] as const;

export default function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [notif, setNotif] = useState({ lowStock: true, newOrders: true, paymentAlerts: true, weeklyDigest: false });
  const [currency, setCurrency] = useState('INR');
  const [taxRate, setTaxRate] = useState('18');
  const [theme, setTheme] = useState<(typeof themes)[number]['id']>('light');
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmImport, setConfirmImport] = useState<File | null>(null);
  const [dbInfo, setDbInfo] = useState<{ schemaVersion: string; appVersion: string; dbLocation: string; storageType: string } | null>(null);
  const [integrityStatus, setIntegrityStatus] = useState<{ ok: boolean; missingTables: string[] } | null>(null);

  useEffect(() => {
    if (activeTab !== 'about') return;
    getDbInfo().then(setDbInfo).catch(() => {});
    verifyIntegrity().then(setIntegrityStatus).catch(() => {});
  }, [activeTab]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setBackupMsg(null);
    try {
      const blob = await api.exportDatabase();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nain-tools-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBackupMsg({ type: 'success', text: 'Backup downloaded successfully.' });
    } catch {
      setBackupMsg({ type: 'error', text: 'Failed to export. Please try again.' });
    } finally {
      setExporting(false);
    }
  }, []);

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setConfirmImport(file);
    e.target.value = '';
  }, []);

  const handleImportConfirm = useCallback(async () => {
    if (!confirmImport) return;
    setImporting(true);
    setBackupMsg(null);
    try {
      const text = await confirmImport.text();
      await api.importDatabase(text);
      setBackupMsg({ type: 'success', text: 'Data restored successfully. Reloading...' });
      setConfirmImport(null);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setBackupMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to import. Invalid backup file.' });
    } finally {
      setImporting(false);
    }
  }, [confirmImport]);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Settings"
        subtitle="Manage your account, business info, and preferences."
        actions={
          <button className="btn-primary" onClick={handleSave}>
            {saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            <span className="hidden sm:inline">{saved ? 'Saved!' : 'Save Changes'}</span>
          </button>
        }
      />

      {saved && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm font-medium text-accent-700 animate-fade-in">
          <CheckCircle2 className="h-4 w-4" />
          Settings saved successfully. (Mock save — changes are not persisted.)
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        {/* Tab nav */}
        <nav className="card h-fit p-2">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  activeTab === t.id
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Tab content */}
        <div className="card p-6">
          {activeTab === 'profile' && (
            <div className="animate-fade-in">
              <h3 className="text-lg font-semibold text-slate-900">Profile Information</h3>
              <p className="text-sm text-slate-500">Update your personal account details.</p>

              {/* Avatar */}
              <div className="mt-6 flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-xl font-bold text-white">
                  NT
                </div>
                <div>
                  <button className="btn-secondary">
                    <Upload className="h-4 w-4" />
                    Upload Photo
                  </button>
                  <p className="mt-1.5 text-xs text-slate-400">JPG or PNG. Max 2MB.</p>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Full Name" defaultValue="Tanishq Nain" />
                <Field label="Email Address" defaultValue="tanishq@naintools.in" type="email" />
                <Field label="Phone Number" defaultValue="+91 98250 12345" />
                <Field label="Role" defaultValue="Owner" disabled />
              </div>
            </div>
          )}

          {activeTab === 'business' && (
            <div className="animate-fade-in">
              <h3 className="text-lg font-semibold text-slate-900">Business Details</h3>
              <p className="text-sm text-slate-500">Information used on invoices and reports.</p>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Business Name" defaultValue="Nain Tools & Bolt Co." />
                <Field label="GST Number" defaultValue="24ABCDE1234F1Z5" />
                <Field label="Time Zone" defaultValue="IST (UTC+05:30) India" />
                <div className="sm:col-span-2">
                  <Field label="Business Address" defaultValue="Plot 42, GIDC Industrial Estate, Jamnagar, Gujarat 361004" />
                </div>
              </div>

              {/* Currency selector */}
              <div className="mt-6">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Currency</label>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-slate-400" />
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="input w-auto"
                  >
                    {currencies.map((c) => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <p className="mt-1.5 text-xs text-slate-400">Used across all sales, purchases, and reports.</p>
              </div>

              {/* Tax percentage */}
              <div className="mt-5">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Tax / GST Percentage</label>
                <div className="flex items-center gap-2">
                  <Percent className="h-4 w-4 text-slate-400" />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    className="input w-24"
                  />
                  <span className="text-sm text-slate-500">% applied to all invoices</span>
                </div>
              </div>

              {/* Theme preference */}
              <div className="mt-5">
                <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Palette className="h-4 w-4 text-slate-400" />
                  Theme Preference
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {themes.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id)}
                      className={`rounded-xl border p-3 text-left transition ${
                        theme === t.id
                          ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <p className="text-sm font-semibold text-slate-800">{t.label}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex items-center gap-2 rounded-xl bg-brand-50 p-3 text-sm text-brand-700">
                <Globe className="h-4 w-4 shrink-0" />
                These details appear on all generated invoices and purchase orders.
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="animate-fade-in">
              <h3 className="text-lg font-semibold text-slate-900">Notification Preferences</h3>
              <p className="text-sm text-slate-500">Choose what alerts you want to receive.</p>

              <div className="mt-6 divide-y divide-slate-100">
                <Toggle
                  label="Low stock alerts"
                  description="Get notified when products fall below their reorder level."
                  checked={notif.lowStock}
                  onChange={(v) => setNotif((n) => ({ ...n, lowStock: v }))}
                />
                <Toggle
                  label="New orders"
                  description="Receive a notification when a new sale is recorded."
                  checked={notif.newOrders}
                  onChange={(v) => setNotif((n) => ({ ...n, newOrders: v }))}
                />
                <Toggle
                  label="Payment alerts"
                  description="Get alerted about overdue and pending payments."
                  checked={notif.paymentAlerts}
                  onChange={(v) => setNotif((n) => ({ ...n, paymentAlerts: v }))}
                />
                <Toggle
                  label="Weekly digest"
                  description="A summary of your inventory and sales every Monday."
                  checked={notif.weeklyDigest}
                  onChange={(v) => setNotif((n) => ({ ...n, weeklyDigest: v }))}
                />
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="animate-fade-in">
              <h3 className="text-lg font-semibold text-slate-900">Security</h3>
              <p className="text-sm text-slate-500">Keep your account secure.</p>

              <div className="mt-6 space-y-4">
                <Field label="Current Password" defaultValue="" type="password" placeholder="Enter current password" />
                <Field label="New Password" defaultValue="" type="password" placeholder="Enter new password" />
                <Field label="Confirm New Password" defaultValue="" type="password" placeholder="Re-enter new password" />

                <div className="mt-2 flex items-center justify-between rounded-xl border border-slate-200 p-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Two-Factor Authentication</p>
                    <p className="text-xs text-slate-500">Add an extra layer of security to your account.</p>
                  </div>
                  <button className="btn-secondary">Enable</button>
                </div>
              </div>

              <div className="mt-8 border-t border-slate-200 pt-6">
                <h4 className="text-base font-semibold text-slate-900">Data Backup &amp; Restore</h4>
                <p className="text-sm text-slate-500">Export all your business data into a single file, or restore from a previous backup.</p>

                {backupMsg && (
                  <div className={`mt-4 flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium animate-fade-in ${
                    backupMsg.type === 'success'
                      ? 'border-accent-200 bg-accent-50 text-accent-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}>
                    {backupMsg.type === 'success'
                      ? <CheckCircle2 className="h-4 w-4" />
                      : <AlertTriangle className="h-4 w-4" />}
                    {backupMsg.text}
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2">
                      <Download className="h-5 w-5 text-brand-600" />
                      <p className="text-sm font-semibold text-slate-800">Export Database</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Download all products, customers, suppliers, sales, purchases, and verifications as a JSON backup file.</p>
                    <button
                      onClick={handleExport}
                      disabled={exporting}
                      className="btn-primary mt-3 w-full"
                    >
                      {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      {exporting ? 'Exporting...' : 'Export Backup'}
                    </button>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2">
                      <FileUp className="h-5 w-5 text-brand-600" />
                      <p className="text-sm font-semibold text-slate-800">Import Database</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Restore from a previously exported backup file. This will replace all current data.</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/json,.json"
                      onChange={handleImportFile}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={importing}
                      className="btn-secondary mt-3 w-full"
                    >
                      {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                      {importing ? 'Restoring...' : 'Select Backup File'}
                    </button>
                  </div>
                </div>

                {confirmImport && (
                  <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 animate-fade-in">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-amber-900">Confirm Restore</p>
                        <p className="mt-0.5 text-xs text-amber-700">
                          You are about to restore from <span className="font-medium">{confirmImport.name}</span>. This will permanently replace all current data. This cannot be undone.
                        </p>
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={handleImportConfirm}
                            disabled={importing}
                            className="btn-primary"
                          >
                            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            {importing ? 'Restoring...' : 'Yes, Replace All Data'}
                          </button>
                          <button
                            onClick={() => setConfirmImport(null)}
                            disabled={importing}
                            className="btn-secondary"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'about' && (
            <div className="animate-fade-in">
              <h3 className="text-lg font-semibold text-slate-900">About</h3>
              <p className="text-sm text-slate-500">Application and database information.</p>

              <div className="mt-6 rounded-xl border border-slate-200 p-6">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white">
                    <Database className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-900">Nain Tools Inventory</p>
                    <p className="text-sm text-slate-500">Stainless Steel Fastener Management System</p>
                  </div>
                </div>

                <dl className="mt-4 space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-slate-50">
                    <dt className="flex items-center gap-2 text-sm text-slate-600"><Tag className="h-4 w-4 text-slate-400" /> Application Version</dt>
                    <dd className="text-sm font-semibold text-slate-900">{APP_VERSION}</dd>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-50">
                    <dt className="flex items-center gap-2 text-sm text-slate-600"><Calendar className="h-4 w-4 text-slate-400" /> Build Date</dt>
                    <dd className="text-sm font-semibold text-slate-900">{__BUILD_DATE__}</dd>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-50">
                    <dt className="flex items-center gap-2 text-sm text-slate-600"><Database className="h-4 w-4 text-slate-400" /> Database Version</dt>
                    <dd className="text-sm font-semibold text-slate-900">{dbInfo?.schemaVersion ?? '—'}</dd>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-50">
                    <dt className="flex items-center gap-2 text-sm text-slate-600"><HardDrive className="h-4 w-4 text-slate-400" /> Database Location</dt>
                    <dd className="text-sm font-semibold text-slate-900">{dbInfo?.dbLocation ?? '—'}</dd>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-50">
                    <dt className="flex items-center gap-2 text-sm text-slate-600"><FolderOpen className="h-4 w-4 text-slate-400" /> Storage Type</dt>
                    <dd className="text-sm font-semibold text-slate-900">{dbInfo?.storageType ?? '—'}</dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="flex items-center gap-2 text-sm text-slate-600"><Info className="h-4 w-4 text-slate-400" /> Application Path</dt>
                    <dd className="text-sm font-semibold text-slate-900">{__APP_PATH__}</dd>
                  </div>
                </dl>

                {integrityStatus && (
                  <div className={`mt-4 flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium ${
                    integrityStatus.ok
                      ? 'border-accent-200 bg-accent-50 text-accent-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}>
                    {integrityStatus.ok
                      ? <CheckCircle2 className="h-4 w-4" />
                      : <AlertTriangle className="h-4 w-4" />}
                    {integrityStatus.ok
                      ? 'Database integrity verified — all tables present.'
                      : `Database integrity issue: missing tables — ${integrityStatus.missingTables.join(', ')}`}
                  </div>
                )}
              </div>

              <p className="mt-4 text-center text-xs text-slate-400">Nain Tools Inventory — Version {APP_VERSION} — Built {__BUILD_DATE__}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  defaultValue,
  type = 'text',
  disabled = false,
  placeholder,
}: {
  label: string;
  defaultValue?: string;
  type?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      <input
        type={type}
        defaultValue={defaultValue}
        disabled={disabled}
        placeholder={placeholder}
        className="input disabled:bg-slate-100 disabled:text-slate-500"
      />
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="pr-4">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-brand-600' : 'bg-slate-200'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
