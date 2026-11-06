import React, { useState } from 'react';
import {
  importCodingQuestionsJson,
  fetchCodingQuestionsJsonTemplate,
  type CodingJsonImportResult,
} from '../../api/admin';

interface ImportCodingJsonModalProps {
  onClose: () => void;
  onSuccess: () => void;
  poolId?: string;
}

export const ImportCodingJsonModal: React.FC<ImportCodingJsonModalProps> = ({
  onClose,
  onSuccess,
  poolId,
}) => {
  const [jsonText, setJsonText] = useState('');
  const [duplicatePolicy, setDuplicatePolicy] = useState<'CREATE_NEW' | 'SKIP' | 'OVERWRITE'>('CREATE_NEW');
  const [targetPoolId, setTargetPoolId] = useState(poolId || '');
  const [previewResult, setPreviewResult] = useState<CodingJsonImportResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

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
      alert('Failed to download sample JSON template.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setJsonText(evt.target?.result as string || '');
      setPreviewResult(null);
      setErrorMsg('');
    };
    reader.readAsText(file);
  };

  const parsePayload = () => {
    if (!jsonText.trim()) {
      throw new Error('Please paste JSON or upload a file.');
    }
    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e: any) {
      throw new Error(`Invalid JSON syntax: ${e.message}`);
    }
    return parsed;
  };

  const handlePreview = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const payload = parsePayload();
      setIsProcessing(true);
      const res = await importCodingQuestionsJson(payload, {
        preview: true,
        poolId: targetPoolId || undefined,
        duplicatePolicy,
      });
      setPreviewResult(res);
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || err.message || 'Validation failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCommit = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const payload = parsePayload();
      setIsProcessing(true);
      const res = await importCodingQuestionsJson(payload, {
        preview: false,
        poolId: targetPoolId || undefined,
        duplicatePolicy,
      });
      setSuccessMsg(res.message || 'Coding questions imported successfully.');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || err.message || 'Import failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
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
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '780px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
          overflow: 'hidden',
          fontFamily: "'Manrope', 'Plus Jakarta Sans', system-ui, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            backgroundColor: '#0B2E6F',
            color: '#FFFFFF',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
              Bulk Import Coding Questions (JSON)
            </h2>
            <p style={{ fontSize: '12px', opacity: 0.85, margin: '2px 0 0 0' }}>
              Import problem statements, boilerplate templates, and public/hidden test cases.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#FFFFFF',
              fontSize: '20px',
              cursor: 'pointer',
              fontWeight: 800,
            }}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {errorMsg && (
            <div
              style={{
                marginBottom: '16px',
                padding: '12px 16px',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: '8px',
                color: '#DC2626',
                fontSize: '12px',
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
                padding: '12px 16px',
                backgroundColor: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: '8px',
                color: '#16A34A',
                fontSize: '13px',
                fontWeight: 700,
              }}
            >
              ✓ {successMsg}
            </div>
          )}

          {/* Options Row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginBottom: '16px',
            }}
          >
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                Duplicate Question Policy
              </label>
              <select
                value={duplicatePolicy}
                onChange={(e) => setDuplicatePolicy(e.target.value as any)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                  backgroundColor: '#FFFFFF',
                }}
              >
                <option value="CREATE_NEW">Create as New Question (Always)</option>
                <option value="OVERWRITE">Overwrite Existing by Title</option>
                <option value="SKIP">Skip Duplicates</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                Target Question Pool UUID (Optional)
              </label>
              <input
                type="text"
                value={targetPoolId}
                onChange={(e) => setTargetPoolId(e.target.value)}
                placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Upload and Template Actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#F1F5F9',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#0B2E6F',
                  cursor: 'pointer',
                }}
              >
                📁 Choose JSON File
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </label>
              <span style={{ fontSize: '11px', color: '#64748B' }}>or paste JSON below</span>
            </div>

            <button
              type="button"
              onClick={handleDownloadTemplate}
              style={{
                background: 'none',
                border: 'none',
                color: '#1455B8',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              📥 Download Sample JSON Template
            </button>
          </div>

          {/* JSON Textarea */}
          <textarea
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setPreviewResult(null);
            }}
            placeholder="Paste your JSON content here...&#10;{&#10;  &quot;questions&quot;: [&#10;    {&#10;      &quot;title&quot;: &quot;Two Sum&quot;,&#10;      &quot;problem_statement&quot;: &quot;...&quot;,&#10;      &quot;test_cases&quot;: [...]&#10;    }&#10;  ]&#10;}"
            style={{
              width: '100%',
              height: '180px',
              padding: '10px 14px',
              fontFamily: 'Consolas, monospace',
              fontSize: '12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              boxSizing: 'border-box',
              backgroundColor: '#F8FAFC',
              resize: 'vertical',
            }}
          />

          {/* Validation Preview Card */}
          {previewResult && (
            <div
              style={{
                marginTop: '16px',
                border: '1px solid #CBD5E1',
                borderRadius: '10px',
                padding: '14px 18px',
                backgroundColor: '#F8FAFC',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '10px',
                }}
              >
                <strong style={{ fontSize: '13px', color: '#0B2E6F' }}>
                  Validation Summary: {previewResult.total_questions} question(s) analyzed
                </strong>
                <div style={{ display: 'flex', gap: '10px', fontSize: '12px' }}>
                  <span style={{ color: '#16A34A', fontWeight: 700 }}>
                    ✓ {previewResult.valid_count} Valid
                  </span>
                  {(previewResult.invalid_count || 0) > 0 && (
                    <span style={{ color: '#DC2626', fontWeight: 700 }}>
                      ✗ {previewResult.invalid_count} Invalid
                    </span>
                  )}
                  {(previewResult.duplicate_count || 0) > 0 && (
                    <span style={{ color: '#D97706', fontWeight: 700 }}>
                      ⚠ {previewResult.duplicate_count} Duplicate
                    </span>
                  )}
                </div>
              </div>

              {/* Items List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                {previewResult.items?.map((item) => (
                  <div
                    key={item.index}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      backgroundColor: item.status === 'ERROR' ? '#FEF2F2' : '#FFFFFF',
                      border: `1px solid ${item.status === 'ERROR' ? '#FECACA' : '#E2E8F0'}`,
                      fontSize: '11px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <strong style={{ color: '#0F172A' }}>#{item.index} {item.title}</strong>
                      <span style={{ marginLeft: '8px', color: '#64748B' }}>
                        ({item.difficulty} • {item.marks} marks) • {item.public_test_case_count} public, {item.hidden_test_case_count} hidden
                      </span>
                      {item.errors && item.errors.length > 0 && (
                        <div style={{ color: '#DC2626', marginTop: '2px' }}>
                          {item.errors.join('; ')}
                        </div>
                      )}
                    </div>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontWeight: 800,
                        fontSize: '10px',
                        backgroundColor: item.status === 'VALID' ? '#DCFCE7' : item.status === 'DUPLICATE' ? '#FEF3C7' : '#FEE2E2',
                        color: item.status === 'VALID' ? '#166534' : item.status === 'DUPLICATE' ? '#92400E' : '#991B1B',
                      }}
                    >
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '14px 24px',
            backgroundColor: '#F8FAFC',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#475569',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handlePreview}
            disabled={isProcessing || !jsonText.trim()}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#0B2E6F',
              fontSize: '12px',
              fontWeight: 700,
              cursor: isProcessing || !jsonText.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {isProcessing ? 'Validating...' : '🔍 Validate & Preview'}
          </button>

          <button
            type="button"
            onClick={handleCommit}
            disabled={isProcessing || !jsonText.trim() || (previewResult?.invalid_count || 0) > 0}
            style={{
              padding: '8px 22px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: isProcessing || !jsonText.trim() || (previewResult?.invalid_count || 0) > 0 ? '#94A3B8' : '#1455B8',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 800,
              cursor: isProcessing || !jsonText.trim() || (previewResult?.invalid_count || 0) > 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {isProcessing ? 'Importing...' : '✓ Confirm & Import Questions'}
          </button>
        </div>
      </div>
    </div>
  );
};
