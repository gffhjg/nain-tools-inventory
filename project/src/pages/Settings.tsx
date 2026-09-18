import { useState, useRef, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { User, Building2, Bell, Shield, Globe, Save, Upload, CheckCircle2, Palette, DollarSign, Download, FileUp, AlertTriangle, Loader2, Info, Database, HardDrive, Calendar, Tag, FolderOpen, Trash2, RotateCcw, Check, Sparkles } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { api, APP_VERSION } from '@/lib/api';
import { getDbInfo, verifyIntegrity } from '@/lib/db';
import { useStore } from '@/store/AppStore';
import type { CompanySettings } from '@/lib/types';

type Tab = 'profile' | 'business' | 'notifications' | 'security' | 'about';

const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'business', label: 'Business & Firms', icon: Building2 },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security & Backup', icon: Shield },
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
  const {
    companySettings: storeCompanySettings,
    firmProfiles,
    activeFirmId,
    switchActiveFirm,
    updateCompanySettings,
    wipeAllData,
    restoreDemoData,
  } = useStore();

  const location = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab') as Tab;
      if (tabParam && tabs.some((t) => t.id === tabParam)) {
        return tabParam;
      }
    } catch {}
    return 'profile';
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab') as Tab;
    if (tabParam && tabs.some((t) => t.id === tabParam)) {
      setActiveTab(tabParam);
    }
  }, [location.search]);

  const [notif, setNotif] = useState({ lowStock: true, newOrders: true, paymentAlerts: true, weeklyDigest: false });
  const [currency, setCurrency] = useState('INR');
  const [taxRate, setTaxRate] = useState('18');
  const [theme, setTheme] = useState<(typeof themes)[number]['id']>('light');
  const [saved, setSaved] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [editingFirmId, setEditingFirmId] = useState<number>(() => activeFirmId || 1);
  const [firmForm, setFirmForm] = useState<CompanySettings | null>(null);

  useEffect(() => {
    if (activeFirmId && !editingFirmId) {
      setEditingFirmId(activeFirmId);
    }
  }, [activeFirmId, editingFirmId]);

  useEffect(() => {
    const current = firmProfiles.find((f) => f.id === editingFirmId);
    if (current) {
      setFirmForm({ ...current });
    } else if (storeCompanySettings && editingFirmId === (storeCompanySettings.id || 1)) {
      setFirmForm({ ...storeCompanySettings });
    }
  }, [editingFirmId, firmProfiles, storeCompanySettings]);

  const [userProfile, setUserProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('nain-tools-user-profile');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      name: 'Tanishq Nain',
      email: 'tanishq@naintools.in',
      phone: '+91 98250 12345',
      role: 'Owner',
    };
  });

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmImport, setConfirmImport] = useState<File | null>(null);
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [preserveCompany, setPreserveCompany] = useState(true);
  const [wiping, setWiping] = useState(false);
  const [restoring, setRestoring] = useState(false);
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

  const handleWipeConfirm = useCallback(async (exportFirst: boolean) => {
    setWiping(true);
    setBackupMsg(null);
    try {
      if (exportFirst) {
        await handleExport();
      }
      await wipeAllData(preserveCompany);
      setShowWipeModal(false);
      setBackupMsg({ type: 'success', text: 'All data has been wiped successfully. Ready for your new corrected data!' });
    } catch (err) {
      setBackupMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to wipe data.' });
    } finally {
      setWiping(false);
    }
  }, [handleExport, wipeAllData, preserveCompany]);

  const handleRestoreConfirm = useCallback(async () => {
    setRestoring(true);
    setBackupMsg(null);
    try {
      await restoreDemoData();
      setShowRestoreModal(false);
      setBackupMsg({ type: 'success', text: 'Demo dataset restored successfully!' });
    } catch (err) {
      setBackupMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to restore demo data.' });
    } finally {
      setRestoring(false);
    }
  }, [restoreDemoData]);

  const handleSave = async () => {
    if (activeTab === 'business' && firmForm) {
      setSavingSettings(true);
      try {
        await updateCompanySettings({ ...firmForm, id: editingFirmId });
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } catch {
        setBackupMsg({ type: 'error', text: 'Failed to save business settings.' });
      } finally {
        setSavingSettings(false);
      }
    } else if (activeTab === 'profile') {
      try {
        localStorage.setItem('nain-tools-user-profile', JSON.stringify(userProfile));
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } catch {
        // ignore
      }
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  const handleSetActiveFirm = (firmId: number) => {
    switchActiveFirm(firmId);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Settings"
        subtitle="Manage your account, business info, and preferences."
        actions={
          <button className="btn-primary" onClick={handleSave} disabled={savingSettings}>
            {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            <span className="hidden sm:inline">{savingSettings ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}</span>
          </button>
        }
      />

      {saved && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm font-medium text-accent-700 animate-fade-in">
          <CheckCircle2 className="h-4 w-4" />
          Settings saved successfully.
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
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-xl font-bold text-white shadow-sm">
                  {(userProfile.name || 'TN')
                    .split(' ')
                    .filter(Boolean)
                    .map((n: string) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
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
                <ControlledField
                  label="Full Name"
                  value={userProfile.name}
                  onChange={(v) => setUserProfile((p: typeof userProfile) => ({ ...p, name: v }))}
                  placeholder="e.g. Tanishq Nain"
                />
                <ControlledField
                  label="Email Address"
                  value={userProfile.email}
                  onChange={(v) => setUserProfile((p: typeof userProfile) => ({ ...p, email: v }))}
                  type="email"
                  placeholder="e.g. tanishq@naintools.in"
                />
                <ControlledField
                  label="Phone Number"
                  value={userProfile.phone}
                  onChange={(v) => setUserProfile((p: typeof userProfile) => ({ ...p, phone: v }))}
                  placeholder="+91 98250 12345"
                />
                <ControlledField
                  label="Role"
                  value={userProfile.role}
                  onChange={(v) => setUserProfile((p: typeof userProfile) => ({ ...p, role: v }))}
                  placeholder="Owner"
                />
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={savingSettings}
                  className="btn-primary"
                >
                  {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Profile Details
                </button>
              </div>
            </div>
          )}

          {activeTab === 'business' && (
            <div className="animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Commercial Firm Profiles</h3>
                  <p className="text-sm text-slate-500">Configure legal identities for your 2 commercial firms with 100% shared physical inventory.</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-800 self-start sm:self-auto">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Active for Billing: Firm {activeFirmId} ({firmProfiles.find((f) => f.id === activeFirmId)?.firmCode || `F${activeFirmId}`})
                </span>
              </div>

              {/* Shared Unified Inventory Guarantee Card */}
              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-900 flex items-start gap-3">
                <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs shrink-0 mt-0.5">
                  <Database className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-black text-blue-950 text-sm">Unified Shared Fastener Inventory Architecture</p>
                  <p className="mt-0.5 text-blue-800 leading-relaxed">
                    Both Firm 1 and Firm 2 operate from the exact same physical warehouse stock, rack locations, and box status observations.
                    When you switch active profiles, stock counts remain identical while the issuing entity, GSTIN, PAN, and Bank remittance accounts on Tax Invoices and Purchase Bills switch dynamically.
                  </p>
                </div>
              </div>

              {/* Firm Selector Cards */}
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Select Firm to View &amp; Edit
                  </label>
                  <span className="text-xs text-slate-400">Click a card to edit its details</span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {firmProfiles.map((firm) => {
                    const isSelected = firm.id === editingFirmId;
                    const isActive = firm.id === activeFirmId;
                    const isFirm2 = firm.id === 2;

                    return (
                      <div
                        key={firm.id}
                        onClick={() => setEditingFirmId(firm.id!)}
                        className={`cursor-pointer rounded-2xl border p-4 transition text-left relative ${
                          isSelected
                            ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20 shadow-sm'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white shadow-xs ${
                              isFirm2 ? 'bg-emerald-600' : 'bg-brand-600'
                            }`}>
                              {firm.firmCode || `F${firm.id}`}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-black text-slate-900 truncate">
                                {firm.companyName}
                              </p>
                              <p className="text-xs font-mono text-slate-500 truncate mt-0.5">
                                {firm.gstin ? `GST: ${firm.gstin}` : 'GSTIN not configured'}
                              </p>
                            </div>
                          </div>

                          {isActive ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              Active Firm
                            </span>
                          ) : (
                            <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                              Firm {firm.id}
                            </span>
                          )}
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-2.5 text-xs">
                          <span className={isSelected ? 'font-bold text-brand-700' : 'text-slate-500'}>
                            {isSelected ? '● Currently Editing' : 'Click to Edit'}
                          </span>
                          {!isActive && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetActiveFirm(firm.id!);
                              }}
                              className="font-bold text-brand-600 hover:text-brand-800 hover:underline"
                            >
                              Set as Active Firm →
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Currently Selected Firm Details Banner */}
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">
                        Editing: {firmForm?.companyName || `Firm ${editingFirmId}`}
                      </span>
                      {editingFirmId === activeFirmId ? (
                        <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">
                          Currently Active
                        </span>
                      ) : (
                        <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          Secondary Profile
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {editingFirmId === activeFirmId
                        ? 'This firm’s name, GSTIN, and bank accounts are automatically printed on all new invoices and purchase bills.'
                        : 'Click "Set as Active Firm" to make this firm the default for issuing new invoices.'}
                    </p>
                  </div>

                  {editingFirmId !== activeFirmId && (
                    <button
                      type="button"
                      onClick={() => handleSetActiveFirm(editingFirmId)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-700 transition shrink-0"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Set as Active Firm
                    </button>
                  )}
                </div>
              </div>

              {/* Firm Form Fields */}
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ControlledField
                  label="Firm / Business Name"
                  value={firmForm?.companyName ?? ''}
                  onChange={(v) => setFirmForm((s) => s ? { ...s, companyName: v } : s)}
                  placeholder="e.g. Nain Tools & Bolt Co."
                />
                <ControlledField
                  label="Firm Code / Invoice Prefix"
                  value={firmForm?.firmCode ?? ''}
                  onChange={(v) => setFirmForm((s) => s ? { ...s, firmCode: v } : s)}
                  placeholder="e.g. NT1 or NT2"
                />
                <ControlledField
                  label="GST Number (GSTIN)"
                  value={firmForm?.gstin ?? ''}
                  onChange={(v) => setFirmForm((s) => s ? { ...s, gstin: v.toUpperCase() } : s)}
                  placeholder="e.g. 06CCCPK0841B1ZA"
                />
                <ControlledField
                  label="PAN Number"
                  value={firmForm?.pan ?? ''}
                  onChange={(v) => setFirmForm((s) => s ? { ...s, pan: v.toUpperCase() } : s)}
                  placeholder="e.g. CCCPK0841B"
                />
                <ControlledField
                  label="Phone Number(s)"
                  value={firmForm?.phone ?? ''}
                  onChange={(v) => setFirmForm((s) => s ? { ...s, phone: v } : s)}
                  placeholder="+91 9213469582, +91 7053795074"
                />
                <ControlledField
                  label="Email Address"
                  value={firmForm?.email ?? ''}
                  onChange={(v) => setFirmForm((s) => s ? { ...s, email: v } : s)}
                  placeholder="e.g. info@naintools.in"
                />
                <ControlledField
                  label="State"
                  value={firmForm?.state ?? ''}
                  onChange={(v) => setFirmForm((s) => s ? { ...s, state: v } : s)}
                  placeholder="e.g. Haryana"
                />
                <ControlledField
                  label="State Code"
                  value={firmForm?.stateCode ?? ''}
                  onChange={(v) => setFirmForm((s) => s ? { ...s, stateCode: v } : s)}
                  placeholder="e.g. 06"
                />
                <div className="sm:col-span-2">
                  <ControlledField
                    label="Registered Business Address"
                    value={firmForm?.address ?? ''}
                    onChange={(v) => setFirmForm((s) => s ? { ...s, address: v } : s)}
                    placeholder="Plot / Shop No., Industrial Area, City, Pin"
                  />
                </div>
              </div>

              {/* Bank details */}
              <h4 className="mt-6 text-sm font-bold text-slate-800">
                Bank Details for Payment Remittances ({firmForm?.firmCode || `Firm ${editingFirmId}`})
              </h4>
              <p className="text-xs text-slate-500">These bank details are printed on invoices for customer NEFT/RTGS/IMPS payments.</p>

              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ControlledField
                  label="Bank Name"
                  value={firmForm?.bankName ?? ''}
                  onChange={(v) => setFirmForm((s) => s ? { ...s, bankName: v } : s)}
                  placeholder="e.g. HDFC BANK"
                />
                <ControlledField
                  label="Account Number"
                  value={firmForm?.bankAccount ?? ''}
                  onChange={(v) => setFirmForm((s) => s ? { ...s, bankAccount: v } : s)}
                  placeholder="e.g. 50200088182531"
                />
                <ControlledField
                  label="IFSC Code"
                  value={firmForm?.bankIfsc ?? ''}
                  onChange={(v) => setFirmForm((s) => s ? { ...s, bankIfsc: v.toUpperCase() } : s)}
                  placeholder="e.g. HDFC0002034"
                />
                <ControlledField
                  label="Branch"
                  value={firmForm?.bankBranch ?? ''}
                  onChange={(v) => setFirmForm((s) => s ? { ...s, bankBranch: v } : s)}
                  placeholder="e.g. NIT Faridabad"
                />
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Globe className="h-4 w-4 text-slate-400" />
                  <span>All edits to this firm profile take effect immediately in Tax Invoices and Purchase Bills.</span>
                </div>
                <div className="flex items-center gap-2">
                  {editingFirmId !== activeFirmId && (
                    <button
                      type="button"
                      onClick={() => handleSetActiveFirm(editingFirmId)}
                      className="btn-secondary text-xs"
                    >
                      Make This Active Firm
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={savingSettings}
                    className="btn-primary text-xs"
                  >
                    {savingSettings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    <span>Save Firm {editingFirmId} Details</span>
                  </button>
                </div>
              </div>

              {/* Currency selector */}
              <div className="mt-8 border-t border-slate-100 pt-6">
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

              {/* Danger Zone: Data Reset & Clean Slate */}
              <div className="mt-8 border-t border-red-200 pt-6">
                <div>
                  <h4 className="text-base font-semibold text-red-700 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    Danger Zone: Data Reset &amp; Clean Slate
                  </h4>
                  <p className="text-sm text-slate-500">
                    Wipe out all records to start fresh with new corrected data, or restore the initial demo inventory.
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-red-200 bg-red-50/40 p-4">
                    <div className="flex items-center gap-2">
                      <Trash2 className="h-5 w-5 text-red-600" />
                      <p className="text-sm font-semibold text-red-900">Wipe All Inventory Data</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      Deletes all products, sales, purchases, customers, suppliers, and cheques for a completely fresh clean slate.
                    </p>
                    <button
                      onClick={() => setShowWipeModal(true)}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-red-300 bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Wipe Data (Clean Slate)
                    </button>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                    <div className="flex items-center gap-2">
                      <RotateCcw className="h-5 w-5 text-slate-700" />
                      <p className="text-sm font-semibold text-slate-800">Restore Demo Dataset</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Restores the initial Excel dataset (997 fastener items, sample purchases &amp; sales) for testing purposes.
                    </p>
                    <button
                      onClick={() => setShowRestoreModal(true)}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Restore Demo Data
                    </button>
                  </div>
                </div>

                {/* Wipe Confirmation Modal */}
                {showWipeModal && (
                  <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-5 animate-fade-in shadow-sm">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-red-600" />
                      <div className="flex-1">
                        <h5 className="text-base font-bold text-red-900">Confirm Clean Slate Wipe</h5>
                        <p className="mt-1 text-sm text-red-800">
                          Are you sure you want to wipe all inventory records? This will delete all products, sales invoices, purchases, customers, suppliers, and cheques so you can add new corrected data.
                        </p>
                        <div className="mt-3 flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="preserveCompanySettings"
                            checked={preserveCompany}
                            onChange={(e) => setPreserveCompany(e.target.checked)}
                            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                          <label htmlFor="preserveCompanySettings" className="text-xs font-medium text-slate-700">
                            Keep Company Profile (business name, GSTIN, and bank details)
                          </label>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2.5">
                          <button
                            onClick={() => handleWipeConfirm(true)}
                            disabled={wiping}
                            className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-black disabled:opacity-50"
                          >
                            {wiping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            Export Backup First &amp; Wipe
                          </button>
                          <button
                            onClick={() => handleWipeConfirm(false)}
                            disabled={wiping}
                            className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-red-700 disabled:opacity-50"
                          >
                            {wiping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            Wipe Immediately
                          </button>
                          <button
                            onClick={() => setShowWipeModal(false)}
                            disabled={wiping}
                            className="btn-secondary"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Restore Confirmation Modal */}
                {showRestoreModal && (
                  <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-5 animate-fade-in shadow-sm">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
                      <div className="flex-1">
                        <h5 className="text-base font-bold text-amber-900">Restore Demo Dataset?</h5>
                        <p className="mt-1 text-sm text-amber-800">
                          This will reload the 997 Excel fastener items, sample sales, and purchases into your inventory.
                        </p>
                        <div className="mt-4 flex gap-2.5">
                          <button
                            onClick={handleRestoreConfirm}
                            disabled={restoring}
                            className="btn-primary"
                          >
                            {restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                            Yes, Restore Demo Data
                          </button>
                          <button
                            onClick={() => setShowRestoreModal(false)}
                            disabled={restoring}
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

function ControlledField({
  label,
  value,
  onChange,
  type = 'text',
  disabled = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="input disabled:bg-slate-100 disabled:text-slate-500"
      />
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
