import React, { useState, useEffect, useMemo } from 'react';
import { formatApiError } from '../../utils/errorFormatter';
import { useAdminTheme } from '../../utils/adminTheme';
import { PageContainer, SectionHeader, StatusBadge } from '../../components/ui';
import { queryClient } from '../../main';
import {
  getAdminConfig,
  updateAdminConfig,
  getAdminSections,
  createAdminSection,
  updateAdminSection,
  deleteAdminSection,
  bulkDeleteAdminSections,
  clearAdminSystemCache,
  type AdminAssessmentConfig,
  type AdminSection,
  type ExportScoreThreshold,
} from '../../api/admin';

const DEFAULT_EXPORT_THRESHOLDS: ExportScoreThreshold[] = [
  { min: 80, max: 100, color: '#D4EDDA', label: 'Distinction' },
  { min: 60, max: 79.99, color: '#FFF3CD', label: 'First Class' },
  { min: 40, max: 59.99, color: '#FFE5D0', label: 'Pass' },
  { min: 0, max: 39.99, color: '#F8D7DA', label: 'Fail / Action Required' },
];

export function AdminConfigView() {
  const { tokens } = useAdminTheme();
  const [config, setConfig] = useState<AdminAssessmentConfig | null>(null);
  const [initialConfig, setInitialConfig] = useState<AdminAssessmentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Reusable Section Library State
  const [sections, setSections] = useState<AdminSection[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [selectedSectionIds, setSelectedSectionIds] = useState<number[]>([]);
  const [bulkDeletingSections, setBulkDeletingSections] = useState(false);
  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<AdminSection | null>(null);
  const [sectionForm, setSectionForm] = useState({
    name: '',
    code: '',
    description: '',
    is_active: true,
  });
  const [sectionSaving, setSectionSaving] = useState(false);
  const [sectionError, setSectionError] = useState('');
  const [sectionSuccess, setSectionSuccess] = useState('');
  const [cacheClearing, setCacheClearing] = useState(false);
  const [cacheStatusMessage, setCacheStatusMessage] = useState('');

  const handleClearCache = async () => {
    if (!window.confirm('Are you sure you want to purge the platform cache?\n\nThis will invalidate in-memory cached statistics, college lists, and assessment summaries across all nodes.')) {
      return;
    }
    setCacheClearing(true);
    setCacheStatusMessage('');
    try {
      const res = await clearAdminSystemCache();
      queryClient.invalidateQueries();
      setCacheStatusMessage(`✓ Cache cleared successfully at ${new Date(res.timestamp).toLocaleTimeString()}`);
    } catch (err: any) {
      alert(err?.response?.data?.error || err?.response?.data?.detail || 'Failed to clear cache.');
    } finally {
      setCacheClearing(false);
    }
  };

  const loadConfig = async () => {
    try {
      setLoading(true);
      const data = await getAdminConfig();
      setConfig(data);
      setInitialConfig(data);
    } catch {
      setError('Failed to fetch platform configuration.');
    } finally {
      setLoading(false);
    }
  };

  const loadSections = async () => {
    try {
      setSectionsLoading(true);
      const data = await getAdminSections();
      setSections(data);
    } catch {
      console.error('Failed to fetch reusable sections.');
    } finally {
      setSectionsLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
    loadSections();
  }, []);

  const isDirty = useMemo(() => {
    if (!config || !initialConfig) return false;
    return JSON.stringify(config) !== JSON.stringify(initialConfig);
  }, [config, initialConfig]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    if (!config) return;
    const { name, value, type } = e.target;
    let val: any = value;
    if (type === 'number') {
      val = parseInt(value, 10) || 0;
    } else if (type === 'checkbox') {
      val = (e.target as HTMLInputElement).checked;
    }
    setConfig({ ...config, [name]: val });
  };

  const handleReset = () => {
    if (initialConfig) {
      setConfig({ ...initialConfig });
      setError('');
      setMessage('');
    }
  };

  const handleThresholdChange = (index: number, field: keyof ExportScoreThreshold, rawValue: string | number) => {
    if (!config) return;
    const baseBands =
      config.export_score_thresholds && config.export_score_thresholds.length > 0
        ? config.export_score_thresholds
        : DEFAULT_EXPORT_THRESHOLDS;
    const updated = baseBands.map((band, idx) => {
      if (idx !== index) return band;
      if (field === 'min' || field === 'max') {
        const parsed = Number(rawValue);
        return { ...band, [field]: Number.isFinite(parsed) ? parsed : 0 };
      }
      return { ...band, [field]: String(rawValue) };
    });
    setConfig({ ...config, export_score_thresholds: updated });
  };

  const handleResetExportPalette = () => {
    if (!config) return;
    setConfig({
      ...config,
      export_header_bg_color: '#1E293B',
      export_header_text_color: '#FFFFFF',
      export_alt_row_color: '#F8FAFC',
      enable_alt_row_styling: true,
      export_score_thresholds: DEFAULT_EXPORT_THRESHOLDS.map((b) => ({ ...b })),
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setMessage('');
    setError('');

    setSaving(true);
    try {
      const updated = await updateAdminConfig(config);
      setConfig(updated);
      setInitialConfig(updated);
      setMessage('Platform-wide configuration updated and persisted successfully.');
    } catch (err: unknown) {
      setError(formatApiError(err, 'Failed to update configuration.'));
    } finally {
      setSaving(false);
    }
  };

  // Reusable Section handlers
  const handleOpenCreateSection = () => {
    setEditingSection(null);
    setSectionForm({
      name: '',
      code: '',
      description: '',
      is_active: true,
    });
    setSectionError('');
    setSectionModalOpen(true);
  };

  const handleOpenEditSection = (section: AdminSection) => {
    setEditingSection(section);
    setSectionForm({
      name: section.name,
      code: section.code,
      description: section.description || '',
      is_active: section.is_active,
    });
    setSectionError('');
    setSectionModalOpen(true);
  };

  const handleSaveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sectionForm.name.trim() || !sectionForm.code.trim()) {
      setSectionError('Section name and code are required.');
      return;
    }

    setSectionSaving(true);
    setSectionError('');
    try {
      if (editingSection) {
        await updateAdminSection(editingSection.id, {
          name: sectionForm.name.trim(),
          code: sectionForm.code.trim().toUpperCase(),
          description: sectionForm.description.trim(),
          is_active: sectionForm.is_active,
        });
        setSectionSuccess(`Section "${sectionForm.name}" updated successfully.`);
      } else {
        await createAdminSection({
          name: sectionForm.name.trim(),
          code: sectionForm.code.trim().toUpperCase(),
          description: sectionForm.description.trim(),
          is_active: sectionForm.is_active,
        });
        setSectionSuccess(`New section "${sectionForm.name}" created and added to the reusable library.`);
      }
      setSectionModalOpen(false);
      loadSections();
    } catch (err: any) {
      setSectionError(formatApiError(err, 'Failed to save section.'));
    } finally {
      setSectionSaving(false);
    }
  };

  const handleDeleteSection = async (section: AdminSection) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete the reusable section "${section.name}" (${section.code})?\n\nNote: If this section is referenced by existing assessments or question records, deletion will be safely rejected.`
    );
    if (!confirmDelete) return;

    setSectionError('');
    setSectionSuccess('');
    try {
      const res = await deleteAdminSection(section.id);
      setSectionSuccess(res.message || `Section "${section.name}" deleted successfully.`);
      setSelectedSectionIds((prev) => prev.filter((id) => id !== section.id));
      loadSections();
    } catch (err: any) {
      const detailMsg = formatApiError(err, 'Cannot delete section.');
      alert(`Deletion Denied: ${detailMsg}`);
    }
  };

  const handleToggleSelectAllSections = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedSectionIds(sections.map((s) => s.id));
    } else {
      setSelectedSectionIds([]);
    }
  };

  const handleToggleSelectSection = (id: number) => {
    setSelectedSectionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkDeleteSections = async () => {
    if (selectedSectionIds.length === 0) return;
    const confirmDelete = window.confirm(
      `Are you sure you want to delete ${selectedSectionIds.length} selected reusable section(s)?\n\nSections referenced by existing questions or assessments will be protected and will block the deletion.`
    );
    if (!confirmDelete) return;

    setBulkDeletingSections(true);
    setSectionError('');
    setSectionSuccess('');
    try {
      const res = await bulkDeleteAdminSections(selectedSectionIds);
      setSectionSuccess(res.message);
      setSelectedSectionIds([]);
      loadSections();
    } catch (err: any) {
      const msg = formatApiError(err, 'Failed to bulk delete sections.');
      alert(`Deletion Denied: ${msg}`);
      setSectionError(msg);
    } finally {
      setBulkDeletingSections(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '64px', textAlign: 'center', color: '#64748B' }}>
        <div style={{ fontSize: '14px', fontWeight: 600 }}>Loading platform configuration...</div>
      </div>
    );
  }

  if (!config) {
    return (
      <div
        style={{
          padding: '24px',
          backgroundColor: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: '12px',
          color: '#991B1B',
          maxWidth: '680px',
        }}
      >
        <strong style={{ display: 'block', marginBottom: '6px' }}>Configuration Error</strong>
        <p style={{ margin: 0, fontSize: '13px' }}>{error || 'Unable to load configuration from the database.'}</p>
        <button
          onClick={loadConfig}
          style={{
            marginTop: '12px',
            padding: '6px 14px',
            backgroundColor: '#0B2E6F',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <PageContainer maxWidth="1040px">
      <SectionHeader
        title="Platform Policy & Section Library"
        description="Authoritative platform-wide parameters, attempt policies, export appearance, and the centralized library of reusable assessment sections."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {isDirty ? (
              <StatusBadge status="PENDING" label="Unsaved Changes" size="sm" />
            ) : (
              <StatusBadge status="ACTIVE" label="Synchronized" size="sm" />
            )}

            {isDirty && (
              <button type="button" onClick={handleReset} className="csl-btn-secondary" style={{ fontSize: '12px' }}>
                Revert
              </button>
            )}

            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="csl-btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: !isDirty || saving ? 'not-allowed' : 'pointer',
                opacity: !isDirty || saving ? 0.65 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        }
      />

      {/* Cache Engine Management Panel */}
      <div
        className="csl-card"
        style={{
          padding: '18px 22px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              backgroundColor: tokens.cslBlueSoftBg,
              border: `1px solid ${tokens.cslBlueSoftBorder}`,
              color: tokens.cslBlue,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
            }}
          >
            ⚡
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <strong style={{ fontSize: '15px', color: tokens.textPrimary }}>Platform Cache Engine</strong>
              <StatusBadge status="ACTIVE" label="Redis / LocMem Active" size="sm" dot={false} />
            </div>
            <p style={{ margin: '3px 0 0 0', fontSize: '12.5px', color: tokens.textMuted }}>
              High-throughput caching for college directory, question summaries, and admin analytics.
            </p>
            {cacheStatusMessage && (
              <span style={{ fontSize: '12px', color: tokens.successText, fontWeight: 600, display: 'block', marginTop: '4px' }}>
                {cacheStatusMessage}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleClearCache}
          disabled={cacheClearing}
          className="csl-btn-secondary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            cursor: cacheClearing ? 'not-allowed' : 'pointer',
          }}
        >
          <span>🔄</span>
          <span>{cacheClearing ? 'Purging Cache...' : 'Clear Platform Cache'}</span>
        </button>
      </div>

      {/* Notifications */}
      {message && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: '#ECFDF5',
            border: '1px solid #A7F3D0',
            color: '#065F46',
            padding: '12px 18px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 600,
            marginBottom: '20px',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#991B1B',
            padding: '12px 18px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 600,
            marginBottom: '20px',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Architecture Separation Callout */}
      <div
        className="csl-card"
        style={{
          display: 'flex',
          gap: '14px',
          backgroundColor: tokens.surfaceCard,
          border: `1px solid ${tokens.warningBorder}`,
          padding: '16px 20px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: tokens.cardShadow,
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            backgroundColor: tokens.warningBg,
            color: tokens.warningText,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: '2px',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
        </div>
        <div style={{ fontSize: '13px', lineHeight: 1.5, color: tokens.textSecondary }}>
          <strong style={{ color: tokens.textPrimary, display: 'block', marginBottom: '2px', fontSize: '13px' }}>
            Platform-Wide Governance Active
          </strong>
          Parameters configured here apply as global defaults and security guardrails across the platform.
          Specific assessment rounds independently define their own timing, total marks, and section allocations under
          the <strong style={{ color: tokens.textPrimary }}>Assessments</strong> tab.
        </div>
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '40px' }}>
        {/* Section 1: Assessment Portal Identity & Defaults */}
        <div
          className="csl-card"
          style={{
            backgroundColor: tokens.surfaceCard,
            borderRadius: '12px',
            border: `1px solid ${tokens.border}`,
            padding: '24px',
            boxShadow: tokens.cardShadow,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                backgroundColor: tokens.infoBg,
                color: tokens.cslBlue,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: tokens.textPrimary, margin: 0 }}>
              1. Platform Assessment Identity & Status
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '6px' }}>
                Default Assessment Portal Title
              </label>
              <input
                type="text"
                name="title"
                value={config.title}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: `1px solid ${tokens.borderStrong}`,
                  backgroundColor: tokens.inputBg,
                  color: tokens.textPrimary,
                  fontSize: '14px',
                  outlineColor: tokens.cslBlue,
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: '11px', color: tokens.textMuted, marginTop: '4px', display: 'block' }}>
                Displayed as the fallback title on candidate registration and test instructions.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '6px' }}>
                Assessment Engine Active
              </label>
              <select
                name="is_active"
                value={config.is_active ? 'true' : 'false'}
                onChange={(e) => setConfig({ ...config, is_active: e.target.value === 'true' })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: `1px solid ${tokens.borderStrong}`,
                  backgroundColor: tokens.inputBg,
                  color: tokens.textPrimary,
                  fontSize: '14px',
                  outlineColor: tokens.cslBlue,
                  boxSizing: 'border-box',
                  fontWeight: 600,
                }}
              >
                <option value="true">Enabled (Accepting Test Sessions)</option>
                <option value="false">Disabled (Maintenance Mode)</option>
              </select>
              <span style={{ fontSize: '11px', color: tokens.textMuted, marginTop: '4px', display: 'block' }}>
                Global switch governing student assessment eligibility.
              </span>
            </div>
          </div>

          <div style={{ marginTop: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '6px' }}>
              Default Instructions & Guidelines
            </label>
            <textarea
              name="description"
              rows={3}
              value={config.description || ''}
              onChange={handleChange}
              placeholder="Candidate instructions shown when assessment-specific description is omitted..."
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: `1px solid ${tokens.borderStrong}`,
                backgroundColor: tokens.inputBg,
                color: tokens.textPrimary,
                fontSize: '13px',
                outlineColor: tokens.cslBlue,
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Section 2: Proctoring & Attempt Policy */}
        <div
          className="csl-card"
          style={{
            backgroundColor: tokens.surfaceCard,
            borderRadius: '12px',
            border: `1px solid ${tokens.border}`,
            padding: '24px',
            boxShadow: tokens.cardShadow,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                backgroundColor: tokens.infoBg,
                color: tokens.cslBlue,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
            </div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: tokens.textPrimary, margin: 0 }}>
              2. Platform Proctoring & Attempt Policies
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '6px' }}>
                Default Max Attempts per Candidate
              </label>
              <input
                type="number"
                name="max_attempts"
                min={1}
                value={config.max_attempts}
                onChange={handleChange}
                className="csl-tabular"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: `1px solid ${tokens.borderStrong}`,
                  backgroundColor: tokens.inputBg,
                  color: tokens.textPrimary,
                  fontSize: '14px',
                  outlineColor: tokens.cslBlue,
                  boxSizing: 'border-box',
                  fontFamily: tokens.monoFamily,
                  fontWeight: 700,
                }}
              />
              <span style={{ fontSize: '11px', color: tokens.textMuted, marginTop: '4px', display: 'block' }}>
                Default: 1 Attempt (Strict Single-Session)
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '6px' }}>
                Permitted Tab-Switch Warnings
              </label>
              <input
                type="number"
                name="max_tab_switches_warning"
                min={1}
                value={config.max_tab_switches_warning}
                onChange={handleChange}
                className="csl-tabular"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: `1px solid ${tokens.borderStrong}`,
                  backgroundColor: tokens.inputBg,
                  color: tokens.textPrimary,
                  fontSize: '14px',
                  outlineColor: tokens.cslBlue,
                  boxSizing: 'border-box',
                  fontFamily: tokens.monoFamily,
                  fontWeight: 700,
                }}
              />
              <span style={{ fontSize: '11px', color: tokens.textMuted, marginTop: '4px', display: 'block' }}>
                Default: 2 warnings. The 3rd tab switch triggers immediate automated submission.
              </span>
            </div>
          </div>

          {/* Auto submit checkbox toggle */}
          <div
            style={{
              marginTop: '20px',
              padding: '14px 18px',
              borderRadius: '10px',
              backgroundColor: tokens.surfaceMuted,
              border: `1px solid ${tokens.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              cursor: 'pointer',
            }}
            onClick={() => setConfig({ ...config, auto_submit_on_tab_limit: !config.auto_submit_on_tab_limit })}
          >
            <input
              type="checkbox"
              name="auto_submit_on_tab_limit"
              checked={config.auto_submit_on_tab_limit}
              onChange={handleChange}
              style={{
                width: '18px',
                height: '18px',
                accentColor: tokens.cslBlue,
                cursor: 'pointer',
              }}
              onClick={(e) => e.stopPropagation()}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: tokens.textPrimary }}>
                Automated Submission on Threshold Violation
              </div>
              <div style={{ fontSize: '11px', color: tokens.textMuted, marginTop: '2px' }}>
                When enabled, the student portal immediately halts testing, collects answered responses, and submits the attempt on the 3rd tab switch without manual intervention.
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Global XLSX Export Appearance Formatting */}
        <div
          className="csl-card"
          style={{
            backgroundColor: tokens.surfaceCard,
            borderRadius: '12px',
            border: `1px solid ${tokens.border}`,
            padding: '24px',
            boxShadow: tokens.cardShadow,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: tokens.textPrimary, margin: '0 0 4px 0' }}>
                3. Export Spreadsheet Appearance (Excel / XLSX Only)
              </h3>
              <p style={{ fontSize: '12px', color: tokens.textMuted, margin: 0 }}>
                Colors apply exclusively to formatted Excel (.xlsx) exports. CSV downloads remain plain standards-compliant unstyled text.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetExportPalette}
              className="csl-btn-secondary"
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: `1px solid ${tokens.borderStrong}`,
                backgroundColor: tokens.surfaceMuted,
                color: tokens.textPrimary,
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reset Default Palette
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '18px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '6px' }}>
                Header Fill Color
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="color"
                  value={config.export_header_bg_color || '#1E293B'}
                  onChange={(e) => setConfig({ ...config, export_header_bg_color: e.target.value.toUpperCase() })}
                  style={{ width: '40px', height: '36px', border: `1px solid ${tokens.borderStrong}`, borderRadius: '6px', backgroundColor: tokens.inputBg, cursor: 'pointer', padding: '2px' }}
                />
                <input
                  type="text"
                  name="export_header_bg_color"
                  value={config.export_header_bg_color || '#1E293B'}
                  onChange={handleChange}
                  maxLength={7}
                  style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: '8px', border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.inputBg, color: tokens.textPrimary, fontFamily: tokens.monoFamily, fontSize: '13px' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '6px' }}>
                Header Text Color
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="color"
                  value={config.export_header_text_color || '#FFFFFF'}
                  onChange={(e) => setConfig({ ...config, export_header_text_color: e.target.value.toUpperCase() })}
                  style={{ width: '40px', height: '36px', border: `1px solid ${tokens.borderStrong}`, borderRadius: '6px', backgroundColor: tokens.inputBg, cursor: 'pointer', padding: '2px' }}
                />
                <input
                  type="text"
                  name="export_header_text_color"
                  value={config.export_header_text_color || '#FFFFFF'}
                  onChange={handleChange}
                  maxLength={7}
                  style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: '8px', border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.inputBg, color: tokens.textPrimary, fontFamily: tokens.monoFamily, fontSize: '13px' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '6px' }}>
                Alternating Row Shade
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={config.enable_alt_row_styling ?? true}
                  onChange={(e) => setConfig({ ...config, enable_alt_row_styling: e.target.checked })}
                  style={{ width: '18px', height: '18px', accentColor: tokens.cslBlue }}
                />
                <input
                  type="color"
                  value={config.export_alt_row_color || '#F8FAFC'}
                  onChange={(e) => setConfig({ ...config, export_alt_row_color: e.target.value.toUpperCase() })}
                  disabled={config.enable_alt_row_styling === false}
                  style={{ width: '40px', height: '36px', border: `1px solid ${tokens.borderStrong}`, borderRadius: '6px', backgroundColor: tokens.inputBg, cursor: 'pointer', padding: '2px' }}
                />
                <input
                  type="text"
                  name="export_alt_row_color"
                  value={config.export_alt_row_color || '#F8FAFC'}
                  onChange={handleChange}
                  disabled={config.enable_alt_row_styling === false}
                  maxLength={7}
                  style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: '8px', border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.inputBg, color: tokens.textPrimary, fontFamily: tokens.monoFamily, fontSize: '13px' }}
                />
              </div>
            </div>
          </div>

          {/* Score / Status Highlight Bands */}
          <div style={{ marginBottom: '18px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: tokens.textPrimary, marginBottom: '8px' }}>
              Score Percentage & Status Highlight Rules (XLSX)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {((config.export_score_thresholds && config.export_score_thresholds.length > 0)
                ? config.export_score_thresholds
                : DEFAULT_EXPORT_THRESHOLDS
              ).map((band, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                    gap: '10px',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    backgroundColor: tokens.surfaceMuted,
                    border: `1px solid ${tokens.border}`,
                  }}
                >
                  <input
                    type="text"
                    value={band.label}
                    onChange={(e) => handleThresholdChange(idx, 'label', e.target.value)}
                    placeholder="Band Label"
                    style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.inputBg, color: tokens.textPrimary, fontSize: '12.5px', fontWeight: 600 }}
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={band.min}
                    onChange={(e) => handleThresholdChange(idx, 'min', e.target.value)}
                    title="Min %"
                    style={{ padding: '6px 8px', borderRadius: '6px', border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.inputBg, color: tokens.textPrimary, fontSize: '12.5px' }}
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={band.max}
                    onChange={(e) => handleThresholdChange(idx, 'max', e.target.value)}
                    title="Max %"
                    style={{ padding: '6px 8px', borderRadius: '6px', border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.inputBg, color: tokens.textPrimary, fontSize: '12.5px' }}
                  />
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="color"
                      value={band.color.startsWith('#') ? band.color : `#${band.color}`}
                      onChange={(e) => handleThresholdChange(idx, 'color', e.target.value.toUpperCase())}
                      style={{ width: '34px', height: '30px', border: `1px solid ${tokens.borderStrong}`, borderRadius: '6px', backgroundColor: tokens.inputBg, cursor: 'pointer' }}
                    />
                    <input
                      type="text"
                      value={band.color}
                      onChange={(e) => handleThresholdChange(idx, 'color', e.target.value.toUpperCase())}
                      maxLength={7}
                      style={{ flex: 1, minWidth: '72px', padding: '5px 8px', borderRadius: '6px', border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.inputBg, color: tokens.textPrimary, fontFamily: tokens.monoFamily, fontSize: '12px' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live XLSX Style Preview Swatch */}
          <div style={{ border: `1px solid ${tokens.borderStrong}`, borderRadius: '10px', overflow: 'hidden', overflowX: 'auto' }}>
            <div style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 700, color: tokens.textMuted, backgroundColor: tokens.surfaceMuted, borderBottom: `1px solid ${tokens.border}` }}>
              Live XLSX Workbook Preview (Sample Rows)
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: config.export_header_bg_color || '#1E293B',
                    color: config.export_header_text_color || '#FFFFFF',
                  }}
                >
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Student Name</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>College</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Percentage</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: 'Ananya S', college: 'Anna University', pct: '88.0%', status: 'SUBMITTED', bandIdx: 0 },
                  { name: 'Karthik R', college: 'PSG Tech', pct: '64.5%', status: 'SUBMITTED', bandIdx: 1 },
                ].map((sample, rowIdx) => {
                  const bands = (config.export_score_thresholds && config.export_score_thresholds.length > 0)
                    ? config.export_score_thresholds
                    : DEFAULT_EXPORT_THRESHOLDS;
                  const bandColor = bands[sample.bandIdx]?.color || '#FFFFFF';
                  const rowBg = (config.enable_alt_row_styling ?? true) && rowIdx % 2 === 1
                    ? (config.export_alt_row_color || '#F8FAFC')
                    : '#FFFFFF';
                  return (
                    <tr key={rowIdx} style={{ backgroundColor: rowBg, color: '#0F172A', borderTop: '1px solid #E2E8F0' }}>
                      <td style={{ padding: '7px 12px', fontWeight: 600, color: '#0F172A' }}>{sample.name}</td>
                      <td style={{ padding: '7px 12px', color: '#475569' }}>{sample.college}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', backgroundColor: bandColor, color: '#0F172A', fontWeight: 700 }}>{sample.pct}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'center', backgroundColor: bandColor, color: '#0F172A', fontWeight: 700 }}>{sample.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </form>

      {/* ─────────────────────────────────────────────────────────────────────────────
          SECTION 3: REUSABLE ASSESSMENT SECTION LIBRARY
          ───────────────────────────────────────────────────────────────────────────── */}
      <div
        className="csl-card"
        style={{
          backgroundColor: tokens.surfaceCard,
          borderRadius: '12px',
          border: `1px solid ${tokens.border}`,
          padding: '24px',
          boxShadow: tokens.cardShadow,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  backgroundColor: tokens.infoBg,
                  color: tokens.cslBlue,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7"></rect>
                  <rect x="14" y="3" width="7" height="7"></rect>
                  <rect x="14" y="14" width="7" height="7"></rect>
                  <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: tokens.textPrimary, margin: 0 }}>
                Reusable Assessment Section Library
              </h3>
            </div>
            <p style={{ fontSize: '13px', color: tokens.textMuted, margin: '4px 0 0 0' }}>
              Define reusable sections (e.g. Aptitude, Coding, Logical Reasoning, Verbal). Selected sections can be dynamically allocated to any assessment.
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenCreateSection}
            className="csl-btn-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
              backgroundColor: tokens.cslBlue,
              color: tokens.onPrimary,
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Create Reusable Section
          </button>
        </div>

        {sectionSuccess && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: tokens.successBg,
              border: `1px solid ${tokens.successBorder}`,
              color: tokens.successText,
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              marginBottom: '16px',
            }}
          >
            {sectionSuccess}
          </div>
        )}

        {/* Section Bulk Action Bar */}
        {selectedSectionIds.length > 0 && (
          <div
            style={{
              marginBottom: '16px',
              padding: '12px 18px',
              backgroundColor: tokens.infoBg,
              border: `1px solid ${tokens.infoBorder}`,
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: tokens.cslBlue,
                  color: tokens.onPrimary,
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                {selectedSectionIds.length}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: tokens.infoText }}>
                {selectedSectionIds.length} section{selectedSectionIds.length === 1 ? '' : 's'} selected
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setSelectedSectionIds([])}
                style={{
                  padding: '6px 12px',
                  backgroundColor: tokens.surfaceCard,
                  color: tokens.textSecondary,
                  border: `1px solid ${tokens.borderStrong}`,
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Deselect All
              </button>
              <button
                type="button"
                onClick={handleBulkDeleteSections}
                disabled={bulkDeletingSections}
                style={{
                  padding: '6px 14px',
                  backgroundColor: tokens.danger,
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: bulkDeletingSections ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                <span>{bulkDeletingSections ? 'Deleting...' : `Delete Selected (${selectedSectionIds.length})`}</span>
              </button>
            </div>
          </div>
        )}

        {/* Section Table */}
        {sectionsLoading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: tokens.textMuted, fontSize: '13px' }}>
            Loading sections library...
          </div>
        ) : sections.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: tokens.textMuted, fontSize: '13px' }}>
            No reusable sections defined yet. Click "Create Reusable Section" to create one.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', border: `1px solid ${tokens.border}`, borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: tokens.surfaceMuted, borderBottom: `1px solid ${tokens.border}` }}>
                  <th style={{ padding: '10px 14px', width: '40px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={sections.length > 0 && selectedSectionIds.length === sections.length}
                      ref={(el) => {
                        if (el) el.indeterminate = selectedSectionIds.length > 0 && selectedSectionIds.length < sections.length;
                      }}
                      onChange={handleToggleSelectAllSections}
                      style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: tokens.cslBlue }}
                      title="Select / Deselect All Sections"
                    />
                  </th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, color: tokens.textSecondary }}>SECTION ID</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, color: tokens.textSecondary }}>SECTION TITLE & DESCRIPTION</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, color: tokens.textSecondary, textAlign: 'center' }}>QUESTIONS POOL</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, color: tokens.textSecondary, textAlign: 'center' }}>ASSESSMENTS USING</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, color: tokens.textSecondary, textAlign: 'center' }}>STATUS</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, color: tokens.textSecondary, textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((sec) => {
                  const isSelected = selectedSectionIds.includes(sec.id);
                  return (
                  <tr
                    key={sec.id}
                    style={{
                      borderBottom: `1px solid ${tokens.borderLight}`,
                      backgroundColor: isSelected ? tokens.infoBg : 'transparent',
                    }}
                  >
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectSection(sec.id)}
                        style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: tokens.cslBlue }}
                      />
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span
                        style={{
                          backgroundColor: tokens.codingBg,
                          color: tokens.codingText,
                          border: `1px solid ${tokens.codingBorder}`,
                          fontWeight: 700,
                          fontSize: '11px',
                          fontFamily: tokens.monoFamily,
                          padding: '3px 8px',
                          borderRadius: '4px',
                        }}
                      >
                        {sec.code}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 700, color: tokens.textPrimary }}>{sec.name}</div>
                      {sec.description && (
                        <div style={{ fontSize: '12px', color: tokens.textMuted, marginTop: '2px' }}>
                          {sec.description}
                        </div>
                      )}
                    </td>
                    <td className="csl-tabular" style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: tokens.textPrimary }}>
                      {sec.question_count ?? 0}
                    </td>
                    <td className="csl-tabular" style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: tokens.textPrimary }}>
                      {sec.assessment_count ?? 0}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <StatusBadge status={sec.is_active ? 'ACTIVE' : 'INACTIVE'} label={sec.is_active ? 'Active' : 'Inactive'} />
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenEditSection(sec)}
                          style={{
                            padding: '4px 10px',
                            backgroundColor: tokens.warningBg,
                            color: tokens.warningText,
                            border: `1px solid ${tokens.warningBorder}`,
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSection(sec)}
                          style={{
                            padding: '4px 10px',
                            backgroundColor: tokens.dangerBg,
                            color: tokens.dangerText,
                            border: `1px solid ${tokens.dangerBorder}`,
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          CREATE / EDIT SECTION MODAL
          ───────────────────────────────────────────────────────────────────────────── */}
      {sectionModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: tokens.surfaceCard,
              border: `1px solid ${tokens.border}`,
              borderRadius: '12px',
              padding: '24px 28px',
              width: '460px',
              maxWidth: '90vw',
              boxShadow: tokens.modalShadow,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: tokens.textPrimary, margin: 0 }}>
                {editingSection ? `Edit Section: ${editingSection.name}` : 'Create Reusable Section'}
              </h3>
              <button
                type="button"
                onClick={() => setSectionModalOpen(false)}
                aria-label="Close modal"
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: tokens.textMuted }}
              >
                ✕
              </button>
            </div>

            {sectionError && (
              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: tokens.dangerBg,
                  border: `1px solid ${tokens.dangerBorder}`,
                  color: tokens.dangerText,
                  borderRadius: '6px',
                  fontSize: '12px',
                  marginBottom: '14px',
                }}
              >
                {sectionError}
              </div>
            )}

            <form onSubmit={handleSaveSection}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '4px' }}>
                  Section Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Logical Reasoning, Verbal Ability"
                  value={sectionForm.name}
                  onChange={(e) => setSectionForm({ ...sectionForm, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${tokens.borderStrong}`,
                    backgroundColor: tokens.inputBg,
                    color: tokens.textPrimary,
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '4px' }}>
                  Section Code * (Uppercase, Unique)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. LOGICAL, VERBAL, CODING"
                  value={sectionForm.code}
                  onChange={(e) => setSectionForm({ ...sectionForm, code: e.target.value.toUpperCase() })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${tokens.borderStrong}`,
                    backgroundColor: tokens.inputBg,
                    color: tokens.textPrimary,
                    fontFamily: tokens.monoFamily,
                    fontSize: '13px',
                    boxSizing: 'border-box',
                    textTransform: 'uppercase',
                  }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '4px' }}>
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Purpose or focus topics of this section..."
                  value={sectionForm.description}
                  onChange={(e) => setSectionForm({ ...sectionForm, description: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${tokens.borderStrong}`,
                    backgroundColor: tokens.inputBg,
                    color: tokens.textPrimary,
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="section-is-active"
                  checked={sectionForm.is_active}
                  onChange={(e) => setSectionForm({ ...sectionForm, is_active: e.target.checked })}
                  style={{ width: '16px', height: '16px', accentColor: tokens.cslBlue }}
                />
                <label htmlFor="section-is-active" style={{ fontSize: '13px', color: tokens.textPrimary, cursor: 'pointer', fontWeight: 600 }}>
                  Active (Available for assessment allocation)
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setSectionModalOpen(false)}
                  style={{
                    backgroundColor: tokens.surfaceMuted,
                    color: tokens.textSecondary,
                    border: `1px solid ${tokens.border}`,
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sectionSaving}
                  className="csl-btn-primary"
                  style={{
                    backgroundColor: tokens.cslBlue,
                    color: tokens.onPrimary,
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 18px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {sectionSaving ? 'Saving...' : editingSection ? 'Save Changes' : 'Create Section'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
