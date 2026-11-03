import React, { useState } from 'react';
import { AccessibleModal } from './AccessibleModal';
import {
  reassessAdminStudentAccess,
  exportCandidateDataCsv,
  type AdminCollege,
  type AdminAssessment,
  type AdminDrive,
  type AdminQuestionPool,
  importAdminQuestionsCSV,
} from '../../api/admin';

// ─── REASSESS STUDENT ACCESS MODAL ──────────────────────────────────────────

interface ReassessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  assessments?: AdminAssessment[];
}

export function ReassessStudentAccessModal({
  isOpen,
  onClose,
  onSuccess,
  assessments = [],
}: ReassessModalProps) {
  const [registerNumber, setRegisterNumber] = useState('');
  const [assessmentId, setAssessmentId] = useState('');
  const [action, setAction] = useState<'RETRIEVE_ACCESS' | 'REASSIGN_NEW_ATTEMPT' | 'EXTRA_RECOVERY' | 'UNLOCK_FLAGGED'>('RETRIEVE_ACCESS');
  const [reason, setReason] = useState('');
  const [extraTime, setExtraTime] = useState<number>(15);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string; accessUrl?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerNumber.trim()) {
      setFeedback({ type: 'error', message: 'Candidate register number or ID is required.' });
      return;
    }
    if (!reason.trim()) {
      setFeedback({ type: 'error', message: 'A justification reason is required for administrative audit logs.' });
      return;
    }

    setLoading(true);
    setFeedback(null);
    try {
      const res = await reassessAdminStudentAccess({
        register_number: registerNumber.trim(),
        assessment_id: assessmentId || undefined,
        action,
        reason: reason.trim(),
        extra_time_minutes: extraTime,
      });

      setFeedback({
        type: 'success',
        message: res.message,
        accessUrl: res.access_url,
      });
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.error || err.response?.data?.detail || 'Failed to process student reassessment.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setRegisterNumber('');
    setAssessmentId('');
    setAction('RETRIEVE_ACCESS');
    setReason('');
    setFeedback(null);
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={() => {
        handleReset();
        onClose();
      }}
      title="Reassess Student Access"
      description="Authorize emergency candidate access, grant recovery sessions, or reassign a brand-new attempt."
      maxWidth="580px"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {feedback && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '12px',
              backgroundColor: feedback.type === 'success' ? '#F0FDF4' : '#FEF2F2',
              border: `1px solid ${feedback.type === 'success' ? '#86EFAC' : '#FECACA'}`,
              color: feedback.type === 'success' ? '#166534' : '#991B1B',
              fontSize: '13px',
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>
              {feedback.type === 'success' ? 'Operation Completed' : 'Operation Failed'}
            </div>
            <div>{feedback.message}</div>
            {feedback.accessUrl && (
              <div style={{ marginTop: '8px' }}>
                <a
                  href={feedback.accessUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#0052CC', fontWeight: 600, textDecoration: 'underline' }}
                >
                  Open Candidate Direct Link
                </a>
              </div>
            )}
          </div>
        )}

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
            Candidate Register Number or ID *
          </label>
          <input
            type="text"
            value={registerNumber}
            onChange={(e) => setRegisterNumber(e.target.value)}
            placeholder="e.g. 71762105001 or UUID"
            required
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              fontSize: '14px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
            Action Type *
          </label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as any)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              fontSize: '14px',
              outline: 'none',
              backgroundColor: '#FFFFFF',
              boxSizing: 'border-box',
            }}
          >
            <option value="RETRIEVE_ACCESS">Retrieve Direct Assessment Access / Bypass Token</option>
            <option value="REASSIGN_NEW_ATTEMPT">Reassign Brand-New Assessment Attempt</option>
            <option value="EXTRA_RECOVERY">Grant Additional Recovery Slot</option>
            <option value="UNLOCK_FLAGGED">Unlock Flagged Assessment Session</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
            Assessment (Optional if student has active session)
          </label>
          <select
            value={assessmentId}
            onChange={(e) => setAssessmentId(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              fontSize: '14px',
              outline: 'none',
              backgroundColor: '#FFFFFF',
              boxSizing: 'border-box',
            }}
          >
            <option value="">Auto-detect from candidate active record</option>
            {assessments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} ({a.code})
              </option>
            ))}
          </select>
        </div>

        {action === 'EXTRA_RECOVERY' && (
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Extra Time Allowed (Minutes)
            </label>
            <input
              type="number"
              min="5"
              max="120"
              value={extraTime}
              onChange={(e) => setExtraTime(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
            Reason for Administrative Action *
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Lab power interruption verified by college coordinator."
            required
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              fontSize: '14px',
              outline: 'none',
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '10px 18px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#475569',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '10px 22px',
              borderRadius: '10px',
              backgroundColor: '#0052CC',
              color: '#FFFFFF',
              fontWeight: 600,
              fontSize: '14px',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Processing...' : 'Authorize Action'}
          </button>
        </div>
      </form>
    </AccessibleModal>
  );
}

// ─── EXPORT STUDENT DATA CSV MODAL ──────────────────────────────────────────

interface ExportStudentDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  colleges?: AdminCollege[];
  assessments?: AdminAssessment[];
  drives?: AdminDrive[];
}

export function ExportStudentDataModal({
  isOpen,
  onClose,
  colleges = [],
  assessments = [],
  drives = [],
}: ExportStudentDataModalProps) {
  const [collegeId, setCollegeId] = useState('');
  const [assessmentId, setAssessmentId] = useState('');
  const [driveId, setDriveId] = useState('');
  const [attemptState, setAttemptState] = useState('');
  const [exporting, setExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    setExporting(true);
    setErrorMsg(null);
    try {
      const blob = await exportCandidateDataCsv({
        college_id: collegeId || undefined,
        assessment_id: assessmentId || undefined,
        drive_id: driveId || undefined,
        state: attemptState || undefined,
      });

      // Trigger browser file download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `csl_candidates_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      onClose();
    } catch (err: any) {
      setErrorMsg('Failed to export candidate CSV data.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Export Student Data CSV"
      description="Download complete candidate registration, attendance, scores, and integrity records."
      maxWidth="540px"
    >
      <form onSubmit={handleExport} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {errorMsg && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: '#FEF2F2',
              color: '#991B1B',
              fontSize: '13px',
            }}
          >
            {errorMsg}
          </div>
        )}

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
            Filter by College
          </label>
          <select
            value={collegeId}
            onChange={(e) => setCollegeId(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              fontSize: '14px',
              backgroundColor: '#FFFFFF',
              boxSizing: 'border-box',
            }}
          >
            <option value="">All Institutions</option>
            {colleges.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
            Filter by Drive
          </label>
          <select
            value={driveId}
            onChange={(e) => setDriveId(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              fontSize: '14px',
              backgroundColor: '#FFFFFF',
              boxSizing: 'border-box',
            }}
          >
            <option value="">All Drives</option>
            {drives.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
            Filter by Assessment
          </label>
          <select
            value={assessmentId}
            onChange={(e) => setAssessmentId(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              fontSize: '14px',
              backgroundColor: '#FFFFFF',
              boxSizing: 'border-box',
            }}
          >
            <option value="">All Assessments</option>
            {assessments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} ({a.code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
            Attempt Status
          </label>
          <select
            value={attemptState}
            onChange={(e) => setAttemptState(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              fontSize: '14px',
              backgroundColor: '#FFFFFF',
              boxSizing: 'border-box',
            }}
          >
            <option value="">All Statuses (Registered, In Progress, Submitted)</option>
            <option value="SUBMITTED">Submitted Only</option>
            <option value="IN_PROGRESS">Active / In Progress</option>
            <option value="TIMED_OUT">Timed Out</option>
            <option value="FLAGGED">Flagged / Terminated</option>
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 18px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#475569',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={exporting}
            style={{
              padding: '10px 22px',
              borderRadius: '10px',
              backgroundColor: '#0052CC',
              color: '#FFFFFF',
              fontWeight: 600,
              fontSize: '14px',
              border: 'none',
              cursor: exporting ? 'not-allowed' : 'pointer',
            }}
          >
            {exporting ? 'Generating CSV...' : 'Download CSV'}
          </button>
        </div>
      </form>
    </AccessibleModal>
  );
}

// ─── IMPORT QUESTIONS CSV MODAL (WITH DESTINATION POOL SELECTION) ───────────

interface ImportQuestionsCSVModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  pools?: AdminQuestionPool[];
}

export function ImportQuestionsCSVModal({
  isOpen,
  onClose,
  onSuccess,
  pools = [],
}: ImportQuestionsCSVModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [destinationMode, setDestinationMode] = useState<'GLOBAL_ONLY' | 'EXISTING_POOLS' | 'NEW_POOL'>('GLOBAL_ONLY');
  const [selectedPoolIds, setSelectedPoolIds] = useState<string[]>([]);
  const [newPoolName, setNewPoolName] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success_count: number; skipped_count: number; error_count: number; errors: string[] } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('destination_mode', destinationMode);
      if (destinationMode === 'EXISTING_POOLS') {
        formData.append('pool_ids', JSON.stringify(selectedPoolIds));
      } else if (destinationMode === 'NEW_POOL') {
        formData.append('new_pool_name', newPoolName.trim());
      }

      // We call the API endpoint with FormData
      const res = await importAdminQuestionsCSV(undefined, undefined, undefined, {
        file,
        destination_mode: destinationMode,
        pool_ids: selectedPoolIds,
        new_pool_name: newPoolName.trim(),
      } as any);

      setResult({
        success_count: res.success_count || 0,
        skipped_count: (res as any).skipped_count || 0,
        error_count: res.error_count || 0,
        errors: res.errors || [],
      });
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setResult({
        success_count: 0,
        skipped_count: 0,
        error_count: 1,
        errors: [err.response?.data?.error || err.response?.data?.detail || 'CSV Import failed.'],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={() => {
        setFile(null);
        setResult(null);
        onClose();
      }}
      title="Import Questions CSV"
      description="Ingest questions into the central Question Bank and optionally attach them to Question Pools."
      maxWidth="600px"
    >
      <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {result && (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '12px',
              backgroundColor: result.error_count === 0 ? '#F0FDF4' : '#FEF2F2',
              border: `1px solid ${result.error_count === 0 ? '#86EFAC' : '#FECACA'}`,
              fontSize: '13px',
              color: result.error_count === 0 ? '#166534' : '#991B1B',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: '6px' }}>
              Import Results: {result.success_count} Created, {result.skipped_count} Skipped, {result.error_count} Errors
            </div>
            {result.errors.length > 0 && (
              <ul style={{ margin: '4px 0 0', paddingLeft: '18px' }}>
                {result.errors.slice(0, 5).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
            Select CSV File *
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            required
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px dashed #CBD5E1',
              backgroundColor: '#F8FAFC',
              cursor: 'pointer',
              boxSizing: 'border-box',
            }}
          />
          <span style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', display: 'block' }}>
            Headers: prompt, option_a, option_b, option_c, option_d, correct_option, section_type, difficulty, marks
          </span>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
            Destination Mode *
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="destMode"
                value="GLOBAL_ONLY"
                checked={destinationMode === 'GLOBAL_ONLY'}
                onChange={() => setDestinationMode('GLOBAL_ONLY')}
              />
              Global Bank Only
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="destMode"
                value="EXISTING_POOLS"
                checked={destinationMode === 'EXISTING_POOLS'}
                onChange={() => setDestinationMode('EXISTING_POOLS')}
              />
              Assign to Existing Pools
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="destMode"
                value="NEW_POOL"
                checked={destinationMode === 'NEW_POOL'}
                onChange={() => setDestinationMode('NEW_POOL')}
              />
              Create New Pool
            </label>
          </div>
        </div>

        {destinationMode === 'EXISTING_POOLS' && (
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Choose Destination Pools
            </label>
            <select
              multiple
              value={selectedPoolIds}
              onChange={(e) => {
                const opts = Array.from(e.target.selectedOptions).map((o) => o.value);
                setSelectedPoolIds(opts);
              }}
              style={{
                width: '100%',
                height: '100px',
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '13px',
                boxSizing: 'border-box',
              }}
            >
              {pools.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.questions_count} questions)
                </option>
              ))}
            </select>
            <span style={{ fontSize: '11px', color: '#64748B', marginTop: '2px', display: 'block' }}>
              Hold Ctrl / Cmd to select multiple pools
            </span>
          </div>
        )}

        {destinationMode === 'NEW_POOL' && (
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              New Pool Name *
            </label>
            <input
              type="text"
              value={newPoolName}
              onChange={(e) => setNewPoolName(e.target.value)}
              placeholder="e.g. Cognitive Ability Pool 2026"
              required
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '10px 18px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#475569',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !file}
            style={{
              padding: '10px 22px',
              borderRadius: '10px',
              backgroundColor: '#0052CC',
              color: '#FFFFFF',
              fontWeight: 600,
              fontSize: '14px',
              border: 'none',
              cursor: loading || !file ? 'not-allowed' : 'pointer',
              opacity: loading || !file ? 0.6 : 1,
            }}
          >
            {loading ? 'Importing Questions...' : 'Import to Bank'}
          </button>
        </div>
      </form>
    </AccessibleModal>
  );
}
