import React, { useEffect, useState } from 'react';
import {
  importCodingQuestionsJson,
  fetchCodingQuestionsJsonTemplate,
  getAdminQuestionPools,
  type AdminQuestionPool,
  type CodingJsonImportResult,
  type SectionMappingRule,
} from '../../api/admin';
import { formatApiError } from '../../utils/errorFormatter';
import { useAdminTheme } from '../../utils/adminTheme';

interface ImportCodingJsonModalProps {
  onClose: () => void;
  onSuccess: () => void;
  poolId?: string;
  targetPool?: AdminQuestionPool | null;
  pools?: AdminQuestionPool[];
}

export const ImportCodingJsonModal: React.FC<ImportCodingJsonModalProps> = ({
  onClose,
  onSuccess,
  poolId,
  targetPool = null,
  pools,
}) => {
  const { tokens } = useAdminTheme();
  const initialPoolId = targetPool?.id || poolId || '';
  const isPoolLocked = Boolean(initialPoolId);

  const [availableCodingPools, setAvailableCodingPools] = useState<AdminQuestionPool[]>(() =>
    (pools || []).filter((p) => p.question_type === 'CODING')
  );
  const [selectedPoolId, setSelectedPoolId] = useState<string>(initialPoolId);
  const [addToGlobalBank, setAddToGlobalBank] = useState<boolean>(!isPoolLocked);

  const [jsonText, setJsonText] = useState('');
  const [duplicatePolicy, setDuplicatePolicy] = useState<'CREATE_NEW' | 'SKIP' | 'OVERWRITE'>('CREATE_NEW');
  const [previewResult, setPreviewResult] = useState<CodingJsonImportResult | null>(null);
  const [sectionMapping, setSectionMapping] = useState<Record<string, SectionMappingRule>>({});
  const [sectionSearchTerms, setSectionSearchTerms] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (pools && pools.length > 0) {
      setAvailableCodingPools(pools.filter((p) => p.question_type === 'CODING'));
      return;
    }
    getAdminQuestionPools({ question_type: 'CODING', is_active: true })
      .then((res) => setAvailableCodingPools(res))
      .catch(() => {});
  }, [pools]);

  const resolvedPool =
    targetPool && targetPool.id === selectedPoolId
      ? targetPool
      : availableCodingPools.find((p) => p.id === selectedPoolId) || null;

  const handleDownloadTemplate = async () => {
    try {
      const data = await fetchCodingQuestionsJsonTemplate();
      const blob = new Blob([JSON.stringify(data.template || data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'coding_questions_sample.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setErrorMsg('Failed to download sample JSON template.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setJsonText((evt.target?.result as string) || '');
      setPreviewResult(null);
      setErrorMsg('');
      setSuccessMsg('');
    };
    reader.readAsText(file);
  };

  const parsePayload = () => {
    if (!jsonText.trim()) {
      throw new Error('Please paste JSON or upload a .json file.');
    }
    try {
      return JSON.parse(jsonText);
    } catch (e: any) {
      throw new Error(`Invalid JSON syntax: ${e.message}`);
    }
  };

  const handlePreview = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const payload = parsePayload();
      setIsProcessing(true);
      const res = await importCodingQuestionsJson(payload, {
        preview: true,
        poolId: selectedPoolId || undefined,
        duplicatePolicy,
        addToGlobalBank,
      });
      setPreviewResult(res);

      // Initialize Section Directory resolution state: unmatched sections require explicit decision
      const nextMapping: Record<string, SectionMappingRule> = {};
      (res.detected_sections || []).forEach((sec) => {
        const key = (sec.raw_section || sec.code || '').toUpperCase();
        if (sec.matched && sec.matched_section_id) {
          nextMapping[key] = {
            action: 'map',
            target_section_id: sec.matched_section_id,
            target_section_code: sec.matched_section_code || sec.code,
          };
        }
      });
      setSectionMapping(nextMapping);
      setSectionSearchTerms({});
    } catch (err: any) {
      setPreviewResult(null);
      setErrorMsg(formatApiError(err, 'Validation failed.'));
    } finally {
      setIsProcessing(false);
    }
  };

  const unmatchedSections = (previewResult?.detected_sections || []).filter((s) => !s.matched);
  const allUnmatchedResolved = unmatchedSections.every((sec) => {
    const key = (sec.raw_section || sec.code || '').toUpperCase();
    const rule = sectionMapping[key];
    if (!rule) return false;
    if (rule.action === 'skip') return true;
    if (rule.action === 'map') return Boolean(rule.target_section_id);
    if (rule.action === 'create') {
      return Boolean((rule.target_section_name || '').trim() && (rule.target_section_code || '').trim());
    }
    return false;
  });

  const handleCommit = async () => {
    if (!previewResult || (previewResult.invalid_count || 0) > 0) {
      setErrorMsg('Run Validate & Preview cleanly with zero invalid questions before committing.');
      return;
    }
    if (!allUnmatchedResolved) {
      setErrorMsg('Resolve all unmatched sections (Map to Existing, Create New, or Skip) before importing.');
      return;
    }
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const payload = parsePayload();
      setIsProcessing(true);
      const res = await importCodingQuestionsJson(payload, {
        preview: false,
        poolId: selectedPoolId || undefined,
        duplicatePolicy,
        addToGlobalBank,
        sectionMapping,
      });
      setSuccessMsg(res.message || 'Coding questions imported successfully.');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 900);
    } catch (err: any) {
      setErrorMsg(formatApiError(err, 'Import failed.'));
    } finally {
      setIsProcessing(false);
    }
  };

  const canCommit =
    Boolean(previewResult) &&
    (previewResult?.invalid_count || 0) === 0 &&
    ((previewResult?.valid_count || 0) > 0 || (previewResult?.duplicate_count || 0) > 0) &&
    allUnmatchedResolved &&
    !isProcessing;

  return (
    <div
      data-testid="import-coding-json-modal"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px',
        fontFamily: tokens.fontFamily,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isProcessing) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: tokens.surfaceCard,
          color: tokens.textPrimary,
          border: `1px solid ${tokens.borderStrong}`,
          borderRadius: '14px',
          width: '100%',
          maxWidth: '820px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: tokens.modalShadow,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: tokens.cslCharcoal,
            borderBottom: `2px solid ${tokens.cslYellow}`,
            color: '#FFFFFF',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(245, 184, 61, 0.18)',
                  color: '#F5B83D',
                  border: '1px solid rgba(245, 184, 61, 0.4)',
                }}
              >
                Coding JSON Importer
              </span>
              {resolvedPool && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(59, 130, 246, 0.25)',
                    color: '#93C5FD',
                  }}
                >
                  Pool: {resolvedPool.name} ({resolvedPool.code})
                </span>
              )}
            </div>
            <h2 style={{ fontSize: '17px', fontWeight: 700, margin: '4px 0 0 0' }}>
              Bulk Import Coding Questions (JSON)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            aria-label="Close JSON importer"
            style={{
              backgroundColor: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px',
              width: '32px',
              height: '32px',
              color: '#FFFFFF',
              fontSize: '16px',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {errorMsg && (
            <div
              style={{
                marginBottom: '16px',
                padding: '12px 14px',
                backgroundColor: tokens.dangerBg,
                border: `1px solid ${tokens.dangerBorder}`,
                borderRadius: '8px',
                color: tokens.dangerText,
                fontSize: '12.5px',
                fontWeight: 600,
              }}
            >
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div
              style={{
                marginBottom: '16px',
                padding: '12px 14px',
                backgroundColor: tokens.successBg,
                border: `1px solid ${tokens.successBorder}`,
                borderRadius: '8px',
                color: tokens.successText,
                fontSize: '13px',
                fontWeight: 700,
              }}
            >
              ✓ {successMsg}
            </div>
          )}

          {/* Target Pool & Duplicate Policy */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '14px',
              marginBottom: '14px',
            }}
          >
            <div>
              <label
                htmlFor="json-target-pool-select"
                style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '5px' }}
              >
                Target Coding Question Pool
              </label>
              {isPoolLocked && resolvedPool ? (
                <div
                  style={{
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${tokens.cslBlueSoftBorder}`,
                    backgroundColor: tokens.cslBlueSoftBg,
                    color: tokens.cslBlueSoftText,
                    fontSize: '12.5px',
                    fontWeight: 700,
                  }}
                >
                  {resolvedPool.name} ({resolvedPool.code}) — CODING
                </div>
              ) : (
                <select
                  id="json-target-pool-select"
                  value={selectedPoolId}
                  onChange={(e) => {
                    setSelectedPoolId(e.target.value);
                    setPreviewResult(null);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${tokens.borderStrong}`,
                    fontSize: '12.5px',
                    backgroundColor: tokens.inputBg,
                    color: tokens.textPrimary,
                  }}
                >
                  <option value="">Global Question Bank Only (No Pool)</option>
                  {availableCodingPools.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code}) — {p.questions_count} Qs
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label
                htmlFor="json-duplicate-policy"
                style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '5px' }}
              >
                Duplicate Question Policy
              </label>
              <select
                id="json-duplicate-policy"
                value={duplicatePolicy}
                onChange={(e) => {
                  setDuplicatePolicy(e.target.value as 'CREATE_NEW' | 'SKIP' | 'OVERWRITE');
                  setPreviewResult(null);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${tokens.borderStrong}`,
                  fontSize: '12.5px',
                  backgroundColor: tokens.inputBg,
                  color: tokens.textPrimary,
                }}
              >
                <option value="CREATE_NEW">Create as New Question (Always)</option>
                <option value="OVERWRITE">Overwrite Existing by Title</option>
                <option value="SKIP">Skip Duplicates</option>
              </select>
            </div>
          </div>

          {/* Explicit Global Bank Policy */}
          {selectedPoolId && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 12px',
                borderRadius: '8px',
                border: `1px solid ${tokens.border}`,
                backgroundColor: tokens.surfaceElevated,
                fontSize: '12.5px',
                fontWeight: 600,
                color: tokens.textPrimary,
                marginBottom: '14px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={addToGlobalBank}
                onChange={(e) => setAddToGlobalBank(e.target.checked)}
              />
              <span>Also add imported coding questions to the Global Question Bank</span>
            </label>
          )}

          {/* Upload and Template Actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label
                style={{
                  padding: '7px 13px',
                  borderRadius: '8px',
                  backgroundColor: tokens.surfaceElevated,
                  border: `1px solid ${tokens.borderStrong}`,
                  fontSize: '12px',
                  fontWeight: 700,
                  color: tokens.textPrimary,
                  cursor: 'pointer',
                }}
              >
                Choose JSON File
                <input type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
              </label>
              <span style={{ fontSize: '12px', color: tokens.textSecondary }}>or paste structured JSON below</span>
            </div>

            <button
              type="button"
              onClick={handleDownloadTemplate}
              style={{
                background: 'none',
                border: 'none',
                color: tokens.cslBlueSoftText,
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Download Sample JSON Template
            </button>
          </div>

          {/* JSON Textarea */}
          <textarea
            data-testid="coding-json-textarea"
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setPreviewResult(null);
            }}
            placeholder='{"questions": [{"title": "Two Sum", "problem_statement": "...", "allowed_languages": ["python"], "test_cases": [{"input_text": "2 3", "expected_output": "5", "is_public": true}]}]}'
            style={{
              width: '100%',
              height: '180px',
              padding: '12px 14px',
              fontFamily: tokens.monoFamily,
              fontSize: '12px',
              borderRadius: '8px',
              border: `1px solid ${tokens.borderStrong}`,
              boxSizing: 'border-box',
              backgroundColor: tokens.inputBg,
              color: tokens.textPrimary,
              resize: 'vertical',
            }}
          />

          {/* Preview Result */}
          {previewResult && (
            <div
              data-testid="coding-json-preview-summary"
              style={{
                marginTop: '16px',
                border: `1px solid ${tokens.borderStrong}`,
                borderRadius: '10px',
                padding: '14px 16px',
                backgroundColor: tokens.surfaceElevated,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '10px',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <strong style={{ fontSize: '13px', color: tokens.textPrimary }}>
                  Validation Preview: {previewResult.total_questions} question(s)
                </strong>
                <div style={{ display: 'flex', gap: '12px', fontSize: '12px' }}>
                  <span style={{ color: tokens.successText, fontWeight: 700 }}>
                    ✓ {previewResult.valid_count} Valid
                  </span>
                  {(previewResult.invalid_count || 0) > 0 && (
                    <span style={{ color: tokens.dangerText, fontWeight: 700 }}>
                      ✗ {previewResult.invalid_count} Invalid
                    </span>
                  )}
                  {(previewResult.duplicate_count || 0) > 0 && (
                    <span style={{ color: tokens.cslYellowSoftText, fontWeight: 700 }}>
                      ⚠ {previewResult.duplicate_count} Duplicate
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '190px', overflowY: 'auto' }}>
                {previewResult.items?.map((item) => (
                  <div
                    key={item.index}
                    style={{
                      padding: '9px 12px',
                      borderRadius: '8px',
                      backgroundColor: item.status === 'ERROR' ? tokens.dangerBg : tokens.surfaceCard,
                      border: `1px solid ${item.status === 'ERROR' ? tokens.dangerBorder : tokens.border}`,
                      fontSize: '12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <div>
                      <strong style={{ color: tokens.textPrimary }}>#{item.index} {item.title}</strong>
                      <span style={{ marginLeft: '8px', color: tokens.textSecondary, fontSize: '11.5px' }}>
                        {item.section_type || 'CODING'} • {item.difficulty} • {item.marks} marks • {item.public_test_case_count} public, {item.hidden_test_case_count} hidden
                      </span>
                      {item.errors && item.errors.length > 0 && (
                        <div style={{ color: tokens.dangerText, marginTop: '3px', fontSize: '11.5px' }}>
                          {item.errors.join('; ')}
                        </div>
                      )}
                    </div>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontWeight: 700,
                        fontSize: '10.5px',
                        backgroundColor:
                          item.status === 'VALID'
                            ? tokens.successBg
                            : item.status === 'DUPLICATE'
                            ? tokens.cslYellowSoftBg
                            : tokens.dangerBg,
                        color:
                          item.status === 'VALID'
                            ? tokens.successText
                            : item.status === 'DUPLICATE'
                            ? tokens.cslYellowSoftText
                            : tokens.dangerText,
                      }}
                    >
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>

              {/* Section Directory Resolution Panel */}
              {previewResult.detected_sections && previewResult.detected_sections.length > 0 && (
                <div
                  data-testid="coding-json-section-resolution"
                  style={{
                    marginTop: '14px',
                    paddingTop: '12px',
                    borderTop: `1px solid ${tokens.borderStrong}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <strong style={{ fontSize: '12.5px', color: tokens.textPrimary }}>
                      Section Directory Resolution ({previewResult.detected_sections.length} section(s))
                    </strong>
                    {unmatchedSections.length > 0 && (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          backgroundColor: tokens.cslYellowSoftBg,
                          color: tokens.cslYellowSoftText,
                        }}
                      >
                        {unmatchedSections.length} new / unmatched section(s) need approval
                      </span>
                    )}
                  </div>

                  {previewResult.duplicate_section_variants && previewResult.duplicate_section_variants.length > 0 && (
                    <div style={{ padding: '8px 10px', borderRadius: '6px', backgroundColor: tokens.cslBlueSoftBg, color: tokens.cslBlueSoftText, fontSize: '11.5px' }}>
                      Normalized aliases detected:{' '}
                      {previewResult.duplicate_section_variants.map((v) => `${v.canonical_code} (${v.variants.join(', ')})`).join('; ')}
                    </div>
                  )}

                  {previewResult.detected_sections.map((sec) => {
                    const key = (sec.raw_section || sec.code || '').toUpperCase();
                    const rule = sectionMapping[key];
                    const searchQuery = (sectionSearchTerms[key] || '').trim().toLowerCase();
                    const filteredAvailable = (previewResult.available_sections || []).filter(
                      (a) =>
                        !searchQuery ||
                        a.name.toLowerCase().includes(searchQuery) ||
                        a.code.toLowerCase().includes(searchQuery)
                    );

                    return (
                      <div
                        key={key}
                        data-testid={`section-resolution-row-${key}`}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: `1px solid ${sec.matched ? tokens.border : tokens.cslYellow}`,
                          backgroundColor: tokens.surfaceCard,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                          <div>
                            <strong style={{ fontSize: '12.5px', color: tokens.textPrimary }}>
                              {sec.raw_section || sec.detected_name}
                            </strong>
                            <span style={{ marginLeft: '8px', fontSize: '11px', color: tokens.textMuted }}>
                              Code: {sec.code} • {sec.row_count} question(s)
                            </span>
                          </div>
                          {sec.matched ? (
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '9999px',
                                backgroundColor: tokens.successBg,
                                color: tokens.successText,
                              }}
                            >
                              ✓ Directory Match: {sec.matched_section_name} ({sec.matched_section_code || sec.code})
                            </span>
                          ) : (
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={() =>
                                  setSectionMapping((prev) => ({
                                    ...prev,
                                    [key]: {
                                      action: 'map',
                                      target_section_id: previewResult.available_sections?.[0]?.id,
                                      target_section_code: previewResult.available_sections?.[0]?.code,
                                    },
                                  }))
                                }
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  border: `1px solid ${rule?.action === 'map' ? tokens.cslBlue : tokens.borderStrong}`,
                                  backgroundColor: rule?.action === 'map' ? tokens.cslBlue : tokens.surfaceElevated,
                                  color: rule?.action === 'map' ? '#FFFFFF' : tokens.textPrimary,
                                  cursor: 'pointer',
                                }}
                              >
                                Map to Existing
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setSectionMapping((prev) => ({
                                    ...prev,
                                    [key]: {
                                      action: 'create',
                                      target_section_name: sec.detected_name,
                                      target_section_code: sec.code,
                                      description: '',
                                      display_order: (previewResult.available_sections?.length || 0) + 1,
                                    },
                                  }))
                                }
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  border: `1px solid ${rule?.action === 'create' ? tokens.cslBlue : tokens.borderStrong}`,
                                  backgroundColor: rule?.action === 'create' ? tokens.cslBlue : tokens.surfaceElevated,
                                  color: rule?.action === 'create' ? '#FFFFFF' : tokens.textPrimary,
                                  cursor: 'pointer',
                                }}
                              >
                                + Create Directory Entry
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setSectionMapping((prev) => ({
                                    ...prev,
                                    [key]: { action: 'skip' },
                                  }))
                                }
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  border: `1px solid ${rule?.action === 'skip' ? tokens.dangerText : tokens.borderStrong}`,
                                  backgroundColor: rule?.action === 'skip' ? tokens.dangerBg : tokens.surfaceElevated,
                                  color: rule?.action === 'skip' ? tokens.dangerText : tokens.textPrimary,
                                  cursor: 'pointer',
                                }}
                              >
                                Skip Questions
                              </button>
                            </div>
                          )}
                        </div>

                        {!sec.matched && rule?.action === 'map' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '8px' }}>
                            <input
                              type="text"
                              value={sectionSearchTerms[key] || ''}
                              onChange={(e) =>
                                setSectionSearchTerms((prev) => ({ ...prev, [key]: e.target.value }))
                              }
                              placeholder="Search directory sections..."
                              style={{
                                padding: '6px 10px',
                                borderRadius: '6px',
                                border: `1px solid ${tokens.borderStrong}`,
                                backgroundColor: tokens.inputBg,
                                color: tokens.textPrimary,
                                fontSize: '12px',
                              }}
                            />
                            <select
                              value={rule.target_section_id || ''}
                              onChange={(e) => {
                                const chosenId = Number(e.target.value);
                                const chosen = previewResult.available_sections?.find((a) => a.id === chosenId);
                                setSectionMapping((prev) => ({
                                  ...prev,
                                  [key]: {
                                    action: 'map',
                                    target_section_id: chosenId,
                                    target_section_code: chosen?.code,
                                  },
                                }));
                              }}
                              style={{
                                padding: '6px 10px',
                                borderRadius: '6px',
                                border: `1px solid ${tokens.borderStrong}`,
                                backgroundColor: tokens.inputBg,
                                color: tokens.textPrimary,
                                fontSize: '12px',
                              }}
                            >
                              <option value="">-- Select existing section --</option>
                              {filteredAvailable.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name} ({a.code})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {!sec.matched && rule?.action === 'create' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1.5fr 90px', gap: '8px' }}>
                            <input
                              type="text"
                              value={rule.target_section_name || ''}
                              onChange={(e) =>
                                setSectionMapping((prev) => ({
                                  ...prev,
                                  [key]: { ...rule, action: 'create', target_section_name: e.target.value },
                                }))
                              }
                              placeholder="Section Name *"
                              style={{
                                padding: '6px 10px',
                                borderRadius: '6px',
                                border: `1px solid ${tokens.borderStrong}`,
                                backgroundColor: tokens.inputBg,
                                color: tokens.textPrimary,
                                fontSize: '12px',
                              }}
                            />
                            <input
                              type="text"
                              value={rule.target_section_code || ''}
                              onChange={(e) =>
                                setSectionMapping((prev) => ({
                                  ...prev,
                                  [key]: {
                                    ...rule,
                                    action: 'create',
                                    target_section_code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
                                  },
                                }))
                              }
                              placeholder="UNIQUE_CODE *"
                              style={{
                                padding: '6px 10px',
                                borderRadius: '6px',
                                border: `1px solid ${tokens.borderStrong}`,
                                backgroundColor: tokens.inputBg,
                                color: tokens.textPrimary,
                                fontSize: '12px',
                              }}
                            />
                            <input
                              type="text"
                              value={rule.description || ''}
                              onChange={(e) =>
                                setSectionMapping((prev) => ({
                                  ...prev,
                                  [key]: { ...rule, action: 'create', description: e.target.value },
                                }))
                              }
                              placeholder="Description (optional)"
                              style={{
                                padding: '6px 10px',
                                borderRadius: '6px',
                                border: `1px solid ${tokens.borderStrong}`,
                                backgroundColor: tokens.inputBg,
                                color: tokens.textPrimary,
                                fontSize: '12px',
                              }}
                            />
                            <input
                              type="number"
                              min={0}
                              value={rule.display_order ?? 0}
                              onChange={(e) =>
                                setSectionMapping((prev) => ({
                                  ...prev,
                                  [key]: { ...rule, action: 'create', display_order: Math.max(0, Number(e.target.value) || 0) },
                                }))
                              }
                              title="Display Order"
                              placeholder="Order"
                              style={{
                                padding: '6px 8px',
                                borderRadius: '6px',
                                border: `1px solid ${tokens.borderStrong}`,
                                backgroundColor: tokens.inputBg,
                                color: tokens.textPrimary,
                                fontSize: '12px',
                              }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            backgroundColor: tokens.surfaceElevated,
            borderTop: `1px solid ${tokens.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '11.5px', color: tokens.textSecondary }}>
            {!previewResult
              ? 'Step 1: Validate & Preview JSON before committing.'
              : (previewResult.invalid_count || 0) > 0
              ? 'Resolve all invalid rows before importing.'
              : 'Ready to commit transactionally.'}
          </span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: `1px solid ${tokens.borderStrong}`,
                backgroundColor: tokens.surfaceCard,
                color: tokens.textPrimary,
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="coding-json-preview-btn"
              onClick={handlePreview}
              disabled={isProcessing || !jsonText.trim()}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: `1px solid ${tokens.cslBlueSoftBorder}`,
                backgroundColor: tokens.cslBlueSoftBg,
                color: tokens.cslBlueSoftText,
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: isProcessing || !jsonText.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {isProcessing ? 'Validating...' : 'Validate & Preview'}
            </button>
            <button
              type="button"
              data-testid="coding-json-commit-btn"
              onClick={handleCommit}
              disabled={!canCommit}
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: canCommit ? tokens.cslBlue : tokens.borderStrong,
                color: '#FFFFFF',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: canCommit ? 'pointer' : 'not-allowed',
              }}
            >
              {isProcessing ? 'Importing...' : 'Confirm & Import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
