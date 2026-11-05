import React, { useState, useEffect, useMemo } from 'react';
import {
  type AdminDrive,
  type AdminDriveDetail,
  type AdminDriveRegistration,
  type AdminDriveInvitation,
  type AdminCollege,
  type AdminAssessment,
  fetchAdminDrives,
  createAdminDrive,
  updateAdminDrive,
  fetchAdminDriveDetail,
  archiveAdminDrive,
  addAdminDriveAssessment,
  removeAdminDriveAssessment,
  fetchAdminDriveRegistrations,
  updateAdminDriveRegistrationStatus,
  fetchAdminDriveInvitations,
  createAdminDriveInvitation,
  revokeAdminDriveInvitation,
  fetchAdminDriveEligibility,
  updateAdminDriveEligibility,
  fetchAdminDriveReports,
} from '../../api/admin';
import { OdometerCard } from '../../components/admin/OdometerCard';
import { AccessibleModal } from '../../components/admin/AccessibleModal';
import { FoldedCardSkeleton, MetricCardSkeleton } from '../../components/admin/SkeletonLoaders';
import { generateCodeFromTitle } from '../../utils/codeGenerator';
import { SearchIcon, PlusIcon } from '../../components/common/Icons';

interface AdminDrivesViewProps {
  colleges?: AdminCollege[];
  assessments?: AdminAssessment[];
}

export function AdminDrivesView({ colleges = [], assessments = [] }: AdminDrivesViewProps) {
  const [drives, setDrives] = useState<AdminDrive[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Create Drive Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [useCustomCode, setUseCustomCode] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    code: '',
    description: '',
    visibility: 'PUBLIC' as 'PUBLIC' | 'INVITE_ONLY',
    status: 'ACTIVE' as 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'CLOSED',
    start_date: '',
    end_date: '',
    registration_start: '',
    registration_end: '',
    eligible_college_ids: [] as number[],
  });
  const [creating, setCreating] = useState(false);

  // Edit Drive Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingDrive, setEditingDrive] = useState<AdminDrive | AdminDriveDetail | null>(null);
  const [editUseCustomCode, setEditUseCustomCode] = useState(true);
  const [editForm, setEditForm] = useState({
    name: '',
    code: '',
    description: '',
    visibility: 'PUBLIC' as 'PUBLIC' | 'INVITE_ONLY',
    status: 'ACTIVE' as 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'CLOSED',
    start_date: '',
    end_date: '',
    registration_start: '',
    registration_end: '',
    eligible_college_ids: [] as number[],
  });
  const [updating, setUpdating] = useState(false);

  // Manage Drive Modal State
  const [selectedDriveId, setSelectedDriveId] = useState<string | null>(null);
  const [driveDetail, setDriveDetail] = useState<AdminDriveDetail | null>(null);
  const [manageTab, setManageTab] = useState<'overview' | 'assessments' | 'analytics' | 'settings' | 'registrations' | 'colleges' | 'invitations' | 'reports'>('overview');
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Subtab-specific states
  const [selectedAssessmentToAdd, setSelectedAssessmentToAdd] = useState('');
  const [isRequiredAssessment, setIsRequiredAssessment] = useState(true);
  const [registrations, setRegistrations] = useState<AdminDriveRegistration[]>([]);
  const [regStatusFilter, setRegStatusFilter] = useState('ALL');
  const [regSearch, setRegSearch] = useState('');
  const [invitations, setInvitations] = useState<AdminDriveInvitation[]>([]);
  const [reports, setReports] = useState<any>(null);

  // New Invitation form
  const [newInviteCode, setNewInviteCode] = useState('');
  const [newInviteLabel, setNewInviteLabel] = useState('');
  const [newInviteMaxUses, setNewInviteMaxUses] = useState<number | ''>('');
  const [newInviteExpiry, setNewInviteExpiry] = useState('');

  // Eligibility state
  const [selectedEligibleColleges, setSelectedEligibleColleges] = useState<number[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadDrives = async () => {
    setLoading(true);
    try {
      const data = await fetchAdminDrives();
      setDrives(data);
    } catch (err) {
      console.error('Failed to load drives', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDrives();
  }, []);

  const filteredDrives = useMemo(() => {
    return drives.filter((d) => {
      const matchSearch =
        d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.description && d.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchStatus = statusFilter === 'ALL' || d.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [drives, searchQuery, statusFilter]);

  // Statistics
  const totalDrives = drives.length;
  const activeDrives = drives.filter((d) => d.status === 'ACTIVE').length;
  const totalRegistrations = drives.reduce((acc, d) => acc + (d.registrations_count || 0), 0);
  const totalLinkedAssessments = drives.reduce((acc, d) => acc + (d.assessments_count || 0), 0);

  const handleOpenManage = async (driveId: string, initialTab: typeof manageTab = 'overview') => {
    setSelectedDriveId(driveId);
    setLoadingDetail(true);
    setManageTab(initialTab);
    try {
      const detail = await fetchAdminDriveDetail(driveId);
      setDriveDetail(detail);
      setSelectedEligibleColleges(detail.eligible_colleges.map((c) => c.id));
      setInvitations(detail.invitations || []);
      if (initialTab === 'analytics' || initialTab === 'reports') {
        fetchAdminDriveReports(driveId).then(setReports).catch(console.error);
      }
    } catch (err) {
      console.error('Failed to load drive detail', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleTabChange = async (tab: typeof manageTab) => {
    setManageTab(tab);
    if (!selectedDriveId) return;

    if (tab === 'registrations') {
      try {
        const regs = await fetchAdminDriveRegistrations(selectedDriveId, {
          status: regStatusFilter === 'ALL' ? undefined : regStatusFilter,
          search: regSearch || undefined,
        });
        setRegistrations(regs);
      } catch (err) {
        console.error(err);
      }
    } else if (tab === 'invitations') {
      try {
        const invs = await fetchAdminDriveInvitations(selectedDriveId);
        setInvitations(invs);
      } catch (err) {
        console.error(err);
      }
    } else if (tab === 'reports' || tab === 'analytics') {
      try {
        const rep = await fetchAdminDriveReports(selectedDriveId);
        setReports(rep);
      } catch (err) {
        console.error(err);
      }
    } else if (tab === 'colleges') {
      try {
        const elig = await fetchAdminDriveEligibility(selectedDriveId);
        setSelectedEligibleColleges(elig.eligible_colleges.map((c) => c.id));
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleCreateDrive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim() || !createForm.code.trim()) {
      showToast('Name and code are required.');
      return;
    }

    setCreating(true);
    try {
      const created = await createAdminDrive({
        ...createForm,
        start_date: createForm.start_date ? new Date(createForm.start_date).toISOString() : null,
        end_date: createForm.end_date ? new Date(createForm.end_date).toISOString() : null,
        registration_start: createForm.registration_start ? new Date(createForm.registration_start).toISOString() : null,
        registration_end: createForm.registration_end ? new Date(createForm.registration_end).toISOString() : null,
      });
      showToast('Drive created successfully. Opening drive workspace...');
      setIsCreateOpen(false);
      setCreateForm({
        name: '',
        code: '',
        description: '',
        visibility: 'PUBLIC',
        status: 'ACTIVE',
        start_date: '',
        end_date: '',
        registration_start: '',
        registration_end: '',
        eligible_college_ids: [],
      });
      await loadDrives();
      if (created && created.id) {
        handleOpenManage(created.id, 'assessments');
      }
    } catch (err: any) {
      showToast(err.response?.data?.error || err.response?.data?.code?.[0] || 'Failed to create drive.');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenEdit = (drive: AdminDrive | AdminDriveDetail) => {
    setEditingDrive(drive);
    setEditForm({
      name: drive.name,
      code: drive.code,
      description: drive.description || '',
      visibility: drive.visibility,
      status: drive.status,
      start_date: drive.start_date ? drive.start_date.slice(0, 16) : '',
      end_date: drive.end_date ? drive.end_date.slice(0, 16) : '',
      registration_start: drive.registration_start ? drive.registration_start.slice(0, 16) : '',
      registration_end: drive.registration_end ? drive.registration_end.slice(0, 16) : '',
      eligible_college_ids: [],
    });
    setEditUseCustomCode(true);
    setIsEditOpen(true);
  };

  const handleUpdateDrive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDrive) return;
    if (!editForm.name.trim() || !editForm.code.trim()) {
      showToast('Name and code are required.');
      return;
    }

    setUpdating(true);
    try {
      const updated = await updateAdminDrive(editingDrive.id, {
        ...editForm,
        start_date: editForm.start_date ? new Date(editForm.start_date).toISOString() : null,
        end_date: editForm.end_date ? new Date(editForm.end_date).toISOString() : null,
        registration_start: editForm.registration_start ? new Date(editForm.registration_start).toISOString() : null,
        registration_end: editForm.registration_end ? new Date(editForm.registration_end).toISOString() : null,
      });
      showToast(`Drive "${updated.name}" updated successfully.`);
      setIsEditOpen(false);
      setEditingDrive(null);
      loadDrives();
      if (selectedDriveId === editingDrive.id) {
        setDriveDetail(updated);
      }
    } catch (err: any) {
      showToast(err.response?.data?.error || err.response?.data?.detail || 'Failed to update drive.');
    } finally {
      setUpdating(false);
    }
  };

  const handleArchiveDrive = async (driveId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to archive Drive "${name}"?`)) return;
    try {
      await archiveAdminDrive(driveId);
      showToast(`Drive "${name}" archived.`);
      loadDrives();
      if (selectedDriveId === driveId) setSelectedDriveId(null);
    } catch (err: any) {
      showToast('Failed to archive drive.');
    }
  };

  const handleAddAssessmentToDrive = async () => {
    if (!selectedDriveId || !selectedAssessmentToAdd) return;
    try {
      await addAdminDriveAssessment(selectedDriveId, {
        assessment_id: selectedAssessmentToAdd,
        is_required: isRequiredAssessment,
      });
      showToast('Assessment attached to drive.');
      setSelectedAssessmentToAdd('');
      const detail = await fetchAdminDriveDetail(selectedDriveId);
      setDriveDetail(detail);
      loadDrives();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to add assessment.');
    }
  };

  const handleRemoveAssessmentFromDrive = async (assessmentId: string) => {
    if (!selectedDriveId) return;
    try {
      await removeAdminDriveAssessment(selectedDriveId, assessmentId);
      showToast('Assessment removed from drive.');
      const detail = await fetchAdminDriveDetail(selectedDriveId);
      setDriveDetail(detail);
      loadDrives();
    } catch (err: any) {
      showToast('Failed to remove assessment.');
    }
  };

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDriveId) return;
    try {
      await createAdminDriveInvitation(selectedDriveId, {
        access_code: newInviteCode.trim() || undefined,
        label: newInviteLabel.trim() || undefined,
        max_uses: newInviteMaxUses === '' ? null : Number(newInviteMaxUses),
        expires_at: newInviteExpiry ? new Date(newInviteExpiry).toISOString() : null,
      });
      showToast('Invitation created successfully.');
      setNewInviteCode('');
      setNewInviteLabel('');
      setNewInviteMaxUses('');
      setNewInviteExpiry('');
      const invs = await fetchAdminDriveInvitations(selectedDriveId);
      setInvitations(invs);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to create invitation.');
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!selectedDriveId) return;
    try {
      await revokeAdminDriveInvitation(selectedDriveId, invitationId);
      showToast('Invitation revoked.');
      const invs = await fetchAdminDriveInvitations(selectedDriveId);
      setInvitations(invs);
    } catch (err: any) {
      showToast('Failed to revoke invitation.');
    }
  };

  const handleSaveEligibility = async () => {
    if (!selectedDriveId) return;
    try {
      await updateAdminDriveEligibility(selectedDriveId, selectedEligibleColleges);
      showToast('Drive eligibility requirements saved.');
      const detail = await fetchAdminDriveDetail(selectedDriveId);
      setDriveDetail(detail);
    } catch (err: any) {
      showToast('Failed to save eligibility.');
    }
  };

  const handleUpdateRegStatus = async (regId: number, status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ATTENDED') => {
    if (!selectedDriveId) return;
    try {
      await updateAdminDriveRegistrationStatus(selectedDriveId, regId, status);
      showToast(`Registration status set to ${status}.`);
      const regs = await fetchAdminDriveRegistrations(selectedDriveId, {
        status: regStatusFilter === 'ALL' ? undefined : regStatusFilter,
        search: regSearch || undefined,
      });
      setRegistrations(regs);
    } catch (err: any) {
      showToast('Failed to update registration status.');
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`${label} copied to clipboard!`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            backgroundColor: '#0F172A',
            color: '#FFFFFF',
            padding: '12px 20px',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            zIndex: 10000,
            fontSize: '14px',
            fontWeight: 500,
            animation: 'slideIn 0.2s ease-out',
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* Top Header & Stat Odometer Cards */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.03em' }}>
            Drive Management
          </h1>
          <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: '14px' }}>
            Multi-college recruitment, campus placements, and pooled assessment drives.
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          style={{
            backgroundColor: '#0052CC',
            color: '#FFFFFF',
            borderRadius: '14px',
            padding: '12px 24px',
            fontWeight: 700,
            fontSize: '14px',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0, 82, 204, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <PlusIcon size={16} /> Create New Drive
        </button>
      </div>

      {/* Odometer Cards */}
      {loading ? (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <OdometerCard label="Total Drives" value={totalDrives} />
          <OdometerCard label="Active Drives" value={activeDrives} />
          <OdometerCard label="Registrations" value={totalRegistrations} />
          <OdometerCard label="Total Assessments" value={totalLinkedAssessments} />
        </div>
      )}

      {/* Pill Filter Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          backgroundColor: '#FFFFFF',
          borderRadius: '50px',
          padding: '6px 16px',
          border: '1.5px solid #E2E8F0',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <SearchIcon size={18} color="#0052CC" />
          <input
            type="text"
            placeholder="Search by Drive Name, Code or Description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              border: 'none',
              outline: 'none',
              fontSize: '14px',
              color: '#1E293B',
              backgroundColor: 'transparent',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>STATUS:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '20px',
              border: '1px solid #CBD5E1',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: '#F8FAFC',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="CLOSED">Closed</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
      </div>

      {/* Drive Cards Directory */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
          <FoldedCardSkeleton />
          <FoldedCardSkeleton />
          <FoldedCardSkeleton />
        </div>
      ) : filteredDrives.length === 0 ? (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            border: '1px dashed #CBD5E1',
            padding: '48px 24px',
            textAlign: 'center',
            color: '#64748B',
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>📁</div>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#334155', margin: '0 0 6px' }}>No Drives Found</h3>
          <p style={{ margin: 0, fontSize: '14px' }}>
            {searchQuery ? 'Try adjusting your search criteria.' : 'Create your first recruitment drive to get started.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
          {filteredDrives.map((drive) => {
            const isDraft = drive.status === 'DRAFT';
            const isActive = drive.status === 'ACTIVE';

            return (
              <div
                key={drive.id}
                style={{
                  position: 'relative',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '20px',
                  border: '1px solid #E2E8F0',
                  padding: '24px 22px 20px',
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  overflow: 'hidden',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                {/* Folded Blue Corner Ribbon */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: '54px',
                    height: '54px',
                    backgroundColor: '#0052CC',
                    clipPath: 'polygon(100% 0, 0 0, 100% 100%)',
                    zIndex: 1,
                  }}
                />

                {/* Card Top */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        backgroundColor: isActive ? '#DCFCE7' : isDraft ? '#FEF3C7' : '#F1F5F9',
                        color: isActive ? '#15803D' : isDraft ? '#B45309' : '#475569',
                      }}
                    >
                      {drive.status}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        backgroundColor: '#EFF6FF',
                        color: '#0052CC',
                      }}
                    >
                      {drive.visibility}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: '0 0 6px', paddingRight: '36px' }}>
                    {drive.name}
                  </h3>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', fontFamily: 'monospace' }}>
                    CODE: {drive.code}
                  </div>
                  {drive.description && (
                    <p style={{ fontSize: '13px', color: '#475569', margin: '8px 0 0', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {drive.description}
                    </p>
                  )}
                </div>

                {/* Mini Stats Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '10px',
                    margin: '16px 0',
                    padding: '12px',
                    backgroundColor: '#F8FAFC',
                    borderRadius: '12px',
                    border: '1px solid #EDF2F7',
                  }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
                      {String(drive.assessments_count || 0).padStart(2, '0')}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Assessments</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#0052CC' }}>
                      {String(drive.registrations_count || 0).padStart(2, '0')}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Candidates</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#059669' }}>
                      {String(drive.colleges_count || 0).padStart(2, '0')}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Colleges</div>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '12px',
                    borderTop: '1px solid #F1F5F9',
                  }}
                >
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleOpenEdit(drive)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        color: '#0F172A',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleArchiveDrive(drive.id, drive.name)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        color: '#64748B',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Archive
                    </button>
                    <button
                      onClick={() => {
                        const publicUrl = `${window.location.origin}/register?drive=${drive.code}`;
                        copyToClipboard(publicUrl, 'Public registration link');
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        color: '#0052CC',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Copy Link
                    </button>
                  </div>

                  <button
                    onClick={() => handleOpenManage(drive.id)}
                    style={{
                      backgroundColor: '#0052CC',
                      color: '#FFFFFF',
                      padding: '8px 18px',
                      borderRadius: '10px',
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(0, 82, 204, 0.2)',
                    }}
                  >
                    Manage Drive
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE DRIVE MODAL */}
      <AccessibleModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New Recruitment Drive"
        description="Establish a centralized pooled drive for campus drives, pooling multiple assessments and colleges."
        maxWidth="650px"
      >
        <form onSubmit={handleCreateDrive} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Drive Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Tamil Nadu State Mega Campus Drive 2026"
                value={createForm.name}
                onChange={(e) => {
                  const val = e.target.value;
                  setCreateForm((prev) => ({
                    ...prev,
                    name: val,
                    code: useCustomCode ? prev.code : generateCodeFromTitle(val),
                  }));
                }}
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
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                  Drive Code *
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#0052CC', cursor: 'pointer', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={useCustomCode}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setUseCustomCode(checked);
                      if (!checked) {
                        setCreateForm((prev) => ({ ...prev, code: generateCodeFromTitle(prev.name) }));
                      }
                    }}
                    style={{ accentColor: '#0052CC', cursor: 'pointer' }}
                  />
                  Custom
                </label>
              </div>
              <input
                type="text"
                required
                placeholder="TN-2026-MEGA"
                value={createForm.code}
                onChange={(e) => setCreateForm({ ...createForm, code: e.target.value.toUpperCase() })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                  backgroundColor: useCustomCode ? '#FFFFFF' : '#F8FAFC',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Description
            </label>
            <textarea
              rows={2}
              placeholder="Candidate instructions, target batch years, and job profiles..."
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '14px',
                boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Visibility
              </label>
              <select
                value={createForm.visibility}
                onChange={(e) => setCreateForm({ ...createForm, visibility: e.target.value as any })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              >
                <option value="PUBLIC">Public (Open for direct candidate link)</option>
                <option value="INVITE_ONLY">Invite Only (Requires access code / token)</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Initial Status
              </label>
              <select
                value={createForm.status}
                onChange={(e) => setCreateForm({ ...createForm, status: e.target.value as any })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              >
                <option value="ACTIVE">Active</option>
                <option value="DRAFT">Draft</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Drive Start Date
              </label>
              <input
                type="datetime-local"
                value={createForm.start_date}
                onChange={(e) => setCreateForm({ ...createForm, start_date: e.target.value })}
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
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Drive End Date
              </label>
              <input
                type="datetime-local"
                value={createForm.end_date}
                onChange={(e) => setCreateForm({ ...createForm, end_date: e.target.value })}
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
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
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
              disabled={creating}
              style={{
                padding: '10px 22px',
                borderRadius: '10px',
                backgroundColor: '#0052CC',
                color: '#FFFFFF',
                fontWeight: 600,
                fontSize: '14px',
                border: 'none',
                cursor: creating ? 'not-allowed' : 'pointer',
              }}
            >
              {creating ? 'Creating...' : 'Create Drive'}
            </button>
          </div>
        </form>
      </AccessibleModal>

      {/* EDIT DRIVE MODAL */}
      <AccessibleModal
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          setEditingDrive(null);
        }}
        title={editingDrive ? `Edit Drive: ${editingDrive.name}` : 'Edit Drive'}
        description="Update drive name, code, status, operational dates, and visibility configuration."
        maxWidth="650px"
      >
        <form onSubmit={handleUpdateDrive} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Drive Name *
              </label>
              <input
                type="text"
                required
                value={editForm.name}
                onChange={(e) => {
                  const val = e.target.value;
                  setEditForm((prev) => ({
                    ...prev,
                    name: val,
                    code: editUseCustomCode ? prev.code : generateCodeFromTitle(val),
                  }));
                }}
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
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                  Drive Code *
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#0052CC', cursor: 'pointer', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={editUseCustomCode}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setEditUseCustomCode(checked);
                      if (!checked) {
                        setEditForm((prev) => ({ ...prev, code: generateCodeFromTitle(prev.name) }));
                      }
                    }}
                    style={{ accentColor: '#0052CC', cursor: 'pointer' }}
                  />
                  Custom
                </label>
              </div>
              <input
                type="text"
                required
                value={editForm.code}
                onChange={(e) => setEditForm({ ...editForm, code: e.target.value.toUpperCase() })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                  backgroundColor: editUseCustomCode ? '#FFFFFF' : '#F8FAFC',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Description
            </label>
            <textarea
              rows={2}
              placeholder="Candidate instructions, target batch years, and job profiles..."
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '14px',
                boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Visibility
              </label>
              <select
                value={editForm.visibility}
                onChange={(e) => setEditForm({ ...editForm, visibility: e.target.value as any })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              >
                <option value="PUBLIC">Public (Open for direct candidate link)</option>
                <option value="INVITE_ONLY">Invite Only (Requires access code / token)</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Status
              </label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              >
                <option value="ACTIVE">Active</option>
                <option value="DRAFT">Draft</option>
                <option value="CLOSED">Closed</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Drive Start Date
              </label>
              <input
                type="datetime-local"
                value={editForm.start_date}
                onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
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
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Drive End Date
              </label>
              <input
                type="datetime-local"
                value={editForm.end_date}
                onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
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
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Registration Opens
              </label>
              <input
                type="datetime-local"
                value={editForm.registration_start}
                onChange={(e) => setEditForm({ ...editForm, registration_start: e.target.value })}
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
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Registration Closes
              </label>
              <input
                type="datetime-local"
                value={editForm.registration_end}
                onChange={(e) => setEditForm({ ...editForm, registration_end: e.target.value })}
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
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button
              type="button"
              onClick={() => {
                setIsEditOpen(false);
                setEditingDrive(null);
              }}
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
              disabled={updating}
              style={{
                padding: '10px 22px',
                borderRadius: '10px',
                backgroundColor: '#0052CC',
                color: '#FFFFFF',
                fontWeight: 600,
                fontSize: '14px',
                border: 'none',
                cursor: updating ? 'not-allowed' : 'pointer',
              }}
            >
              {updating ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </AccessibleModal>

      {/* MANAGE DRIVE MODAL (WITH 6 SUBTABS) */}
      <AccessibleModal
        isOpen={!!selectedDriveId}
        onClose={() => setSelectedDriveId(null)}
        title={driveDetail ? `${driveDetail.name} (${driveDetail.code})` : 'Manage Drive'}
        description="Configure linked assessments, candidate registrations, institutional eligibility, invitations, and analytics."
        maxWidth="920px"
      >
        {loadingDetail || !driveDetail ? (
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <div className="animate-spin" style={{ display: 'inline-block', fontSize: '24px', marginBottom: '12px' }}>
              ⚙️
            </div>
            <p style={{ margin: 0, color: '#64748B' }}>Loading drive configurations...</p>
          </div>
        ) : (
          <div>
            {/* 6 Subtabs Navigation Bar */}
            <div
              style={{
                display: 'flex',
                gap: '8px',
                borderBottom: '2px solid #E2E8F0',
                paddingBottom: '8px',
                marginBottom: '20px',
                overflowX: 'auto',
              }}
            >
              {[
                { key: 'overview', label: 'Overview' },
                { key: 'assessments', label: `Assessments (${driveDetail.drive_assessments?.length || 0})` },
                { key: 'analytics', label: 'Analytics' },
                { key: 'registrations', label: `Registrations (${driveDetail.registrations_count || 0})` },
                { key: 'settings', label: 'Settings & Eligibility' },
                { key: 'invitations', label: `Invitations (${driveDetail.invitations?.length || 0})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key as any)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '10px',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    backgroundColor: manageTab === tab.key ? '#0052CC' : '#F1F5F9',
                    color: manageTab === tab.key ? '#FFFFFF' : '#475569',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* TAB 1: OVERVIEW */}
            {manageTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '12px',
                    padding: '16px',
                    backgroundColor: '#F8FAFC',
                    borderRadius: '16px',
                    border: '1px solid #EDF2F7',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>STATUS</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                      {driveDetail.status}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>VISIBILITY</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                      {driveDetail.visibility}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>REGISTERED</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#0052CC', marginTop: '2px' }}>
                      {driveDetail.registrations_count}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>ASSESSMENTS</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#059669', marginTop: '2px' }}>
                      {driveDetail.drive_assessments?.length || 0}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: '16px 20px',
                    borderRadius: '16px',
                    backgroundColor: '#EFF6FF',
                    border: '1px solid #BFDBFE',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E40AF', marginBottom: '6px' }}>
                    Candidate Registration Link
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/drive/${driveDetail.code}`}
                      style={{
                        flex: 1,
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: '1px solid #93C5FD',
                        backgroundColor: '#FFFFFF',
                        fontFamily: 'monospace',
                        fontSize: '13px',
                      }}
                    />
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/register?drive=${driveDetail.code}`;
                        copyToClipboard(url, 'Registration Link');
                      }}
                      style={{
                        backgroundColor: '#0052CC',
                        color: '#FFFFFF',
                        padding: '10px 18px',
                        borderRadius: '10px',
                        border: 'none',
                        fontWeight: 600,
                        fontSize: '13px',
                        cursor: 'pointer',
                      }}
                    >
                      Copy Link
                    </button>
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#3B82F6' }}>
                    Students can visit this link directly or enter access code{' '}
                    <strong style={{ fontFamily: 'monospace' }}>{driveDetail.code}</strong> on the registration portal.
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(driveDetail)}
                    style={{
                      padding: '8px 18px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      backgroundColor: '#FFFFFF',
                      color: '#0F172A',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    Edit Drive Details
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: ASSESSMENTS */}
            {manageTab === 'assessments' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '14px',
                    backgroundColor: '#F8FAFC',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                  }}
                >
                  <select
                    value={selectedAssessmentToAdd}
                    onChange={(e) => setSelectedAssessmentToAdd(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '14px',
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    <option value="">Select an Assessment to attach...</option>
                    {assessments
                      .filter((a) => !driveDetail.drive_assessments?.some((da) => da.assessment === a.id))
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.title} ({a.code}) - {a.duration_minutes}m, {a.total_marks} marks
                        </option>
                      ))}
                  </select>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                    <input
                      type="checkbox"
                      checked={isRequiredAssessment}
                      onChange={(e) => setIsRequiredAssessment(e.target.checked)}
                    />
                    Mandatory
                  </label>

                  <button
                    onClick={handleAddAssessmentToDrive}
                    disabled={!selectedAssessmentToAdd}
                    style={{
                      backgroundColor: '#0052CC',
                      color: '#FFFFFF',
                      padding: '10px 20px',
                      borderRadius: '10px',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: !selectedAssessmentToAdd ? 'not-allowed' : 'pointer',
                      opacity: !selectedAssessmentToAdd ? 0.6 : 1,
                    }}
                  >
                    Attach Assessment
                  </button>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #E2E8F0', color: '#64748B', fontWeight: 700 }}>
                      <th style={{ padding: '10px 12px' }}>Order</th>
                      <th style={{ padding: '10px 12px' }}>Assessment</th>
                      <th style={{ padding: '10px 12px' }}>Code</th>
                      <th style={{ padding: '10px 12px' }}>Duration</th>
                      <th style={{ padding: '10px 12px' }}>Marks</th>
                      <th style={{ padding: '10px 12px' }}>Required</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {driveDetail.drive_assessments?.map((da) => (
                      <tr key={da.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '12px', fontWeight: 700 }}>{da.display_order}</td>
                        <td style={{ padding: '12px', fontWeight: 600, color: '#0F172A' }}>{da.assessment_title}</td>
                        <td style={{ padding: '12px', fontFamily: 'monospace', color: '#64748B' }}>{da.assessment_code}</td>
                        <td style={{ padding: '12px' }}>{da.assessment_duration} mins</td>
                        <td style={{ padding: '12px' }}>{da.assessment_total_marks}</td>
                        <td style={{ padding: '12px' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '6px',
                              backgroundColor: da.is_required ? '#DCFCE7' : '#F1F5F9',
                              color: da.is_required ? '#15803D' : '#64748B',
                              fontSize: '11px',
                              fontWeight: 700,
                            }}
                          >
                            {da.is_required ? 'REQUIRED' : 'OPTIONAL'}
                          </span>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <button
                            onClick={() => handleRemoveAssessmentFromDrive(da.assessment)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              border: '1px solid #FECACA',
                              backgroundColor: '#FEF2F2',
                              color: '#991B1B',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 3: REGISTRATIONS */}
            {manageTab === 'registrations' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="Search candidate name, reg no, or email..."
                    value={regSearch}
                    onChange={(e) => setRegSearch(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                    }}
                  />
                  <select
                    value={regStatusFilter}
                    onChange={(e) => {
                      setRegStatusFilter(e.target.value);
                      handleTabChange('registrations');
                    }}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="ATTENDED">Attended</option>
                  </select>
                </div>

                <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #E2E8F0', color: '#64748B', fontWeight: 700 }}>
                        <th style={{ padding: '8px 10px' }}>Candidate</th>
                        <th style={{ padding: '8px 10px' }}>Register No</th>
                        <th style={{ padding: '8px 10px' }}>College</th>
                        <th style={{ padding: '8px 10px' }}>Status</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registrations.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#64748B' }}>
                            No candidate registrations matching this filter.
                          </td>
                        </tr>
                      ) : (
                        registrations.map((r) => (
                          <tr key={r.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '10px', fontWeight: 600, color: '#0F172A' }}>
                              <div>{r.candidate_name}</div>
                              <div style={{ fontSize: '11px', color: '#64748B' }}>{r.candidate_email}</div>
                            </td>
                            <td style={{ padding: '10px', fontFamily: 'monospace' }}>{r.candidate_register_number}</td>
                            <td style={{ padding: '10px', color: '#475569' }}>{r.candidate_college_name || 'N/A'}</td>
                            <td style={{ padding: '10px' }}>
                              <span
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  backgroundColor:
                                    r.registration_status === 'APPROVED'
                                      ? '#DCFCE7'
                                      : r.registration_status === 'ATTENDED'
                                      ? '#EFF6FF'
                                      : r.registration_status === 'REJECTED'
                                      ? '#FEF2F2'
                                      : '#FEF3C7',
                                  color:
                                    r.registration_status === 'APPROVED'
                                      ? '#15803D'
                                      : r.registration_status === 'ATTENDED'
                                      ? '#1E40AF'
                                      : r.registration_status === 'REJECTED'
                                      ? '#991B1B'
                                      : '#B45309',
                                }}
                              >
                                {r.registration_status}
                              </span>
                            </td>
                            <td style={{ padding: '10px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                <button
                                  onClick={() => handleUpdateRegStatus(r.id, 'APPROVED')}
                                  style={{
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    backgroundColor: '#DCFCE7',
                                    color: '#15803D',
                                    border: 'none',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleUpdateRegStatus(r.id, 'REJECTED')}
                                  style={{
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    backgroundColor: '#FEF2F2',
                                    color: '#991B1B',
                                    border: 'none',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Reject
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 4: COLLEGES & ELIGIBILITY */}
            {manageTab === 'colleges' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ margin: 0, fontSize: '13px', color: '#475569' }}>
                  Restrict this drive to specific institutions. If no colleges are selected, the drive is open to all colleges.
                </p>

                <div
                  style={{
                    maxHeight: '260px',
                    overflowY: 'auto',
                    border: '1px solid #CBD5E1',
                    borderRadius: '12px',
                    padding: '8px 12px',
                  }}
                >
                  {colleges.map((c) => {
                    const isSelected = selectedEligibleColleges.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '6px 8px',
                          borderRadius: '8px',
                          backgroundColor: isSelected ? '#EFF6FF' : 'transparent',
                          cursor: 'pointer',
                          fontSize: '13px',
                          marginBottom: '2px',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedEligibleColleges([...selectedEligibleColleges, c.id]);
                            } else {
                              setSelectedEligibleColleges(selectedEligibleColleges.filter((id) => id !== c.id));
                            }
                          }}
                        />
                        <span style={{ fontWeight: 600, color: '#0F172A' }}>{c.name}</span>
                        <span style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace' }}>({c.code})</span>
                      </label>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#64748B' }}>
                    {selectedEligibleColleges.length} colleges restricted
                  </span>
                  <button
                    onClick={handleSaveEligibility}
                    style={{
                      backgroundColor: '#0052CC',
                      color: '#FFFFFF',
                      padding: '10px 20px',
                      borderRadius: '10px',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    Save Eligibility
                  </button>
                </div>
              </div>
            )}

            {/* TAB 5: INVITATIONS */}
            {manageTab === 'invitations' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <form
                  onSubmit={handleCreateInvitation}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr) auto',
                    gap: '10px',
                    alignItems: 'flex-end',
                    padding: '14px',
                    backgroundColor: '#F8FAFC',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                  }}
                >
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Access Code (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. VIP-2026"
                      value={newInviteCode}
                      onChange={(e) => setNewInviteCode(e.target.value.toUpperCase())}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Label
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Phase 1 Cohort"
                      value={newInviteLabel}
                      onChange={(e) => setNewInviteLabel(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Max Uses
                    </label>
                    <input
                      type="number"
                      placeholder="Unlimited"
                      min="1"
                      value={newInviteMaxUses}
                      onChange={(e) => setNewInviteMaxUses(e.target.value === '' ? '' : Number(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Expiry Date
                    </label>
                    <input
                      type="date"
                      value={newInviteExpiry}
                      onChange={(e) => setNewInviteExpiry(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    style={{
                      backgroundColor: '#0052CC',
                      color: '#FFFFFF',
                      padding: '9px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Generate Invite
                  </button>
                </form>

                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #E2E8F0', color: '#64748B', fontWeight: 700 }}>
                      <th style={{ padding: '8px 10px' }}>Access Code</th>
                      <th style={{ padding: '8px 10px' }}>Label</th>
                      <th style={{ padding: '8px 10px' }}>Usage</th>
                      <th style={{ padding: '8px 10px' }}>Expires</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#64748B' }}>
                          No invitation access codes generated yet.
                        </td>
                      </tr>
                    ) : (
                      invitations.map((inv) => (
                        <tr key={inv.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 700, color: '#0052CC' }}>
                            {inv.access_code}
                          </td>
                          <td style={{ padding: '10px', color: '#334155' }}>{inv.label || 'Default'}</td>
                          <td style={{ padding: '10px' }}>
                            {inv.usage_count} {inv.max_uses ? `/ ${inv.max_uses}` : 'uses'}
                          </td>
                          <td style={{ padding: '10px', color: '#64748B' }}>
                            {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : 'Never'}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => {
                                  const url = `${window.location.origin}/register?code=${inv.access_code}`;
                                  copyToClipboard(url, 'Invite Link');
                                }}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  border: '1px solid #CBD5E1',
                                  backgroundColor: '#FFFFFF',
                                  color: '#0052CC',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                Copy URL
                              </button>
                              <button
                                onClick={() => handleRevokeInvitation(inv.id)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  border: '1px solid #FECACA',
                                  backgroundColor: '#FEF2F2',
                                  color: '#991B1B',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                Revoke
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB: ANALYTICS & REPORTS (Candidate Deduplicated) */}
            {(manageTab === 'reports' || manageTab === 'analytics') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {reports ? (
                  <div>
                    {/* Deduplicated Analytics KPI Grid */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: '12px',
                        marginBottom: '20px',
                      }}
                    >
                      <div style={{ padding: '16px', backgroundColor: '#F8FAFC', borderRadius: '14px', textAlign: 'center', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>
                          {reports.total_unique_candidates ?? reports.attended_count ?? reports.total_registered ?? 0}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', marginTop: '2px' }}>
                          Unique Candidates
                        </div>
                      </div>
                      <div style={{ padding: '16px', backgroundColor: '#F8FAFC', borderRadius: '14px', textAlign: 'center', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '24px', fontWeight: 800, color: '#0052CC' }}>
                          {reports.total_attempts ?? reports.attended_count ?? 0}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', marginTop: '2px' }}>
                          Total Attempts
                        </div>
                      </div>
                      <div style={{ padding: '16px', backgroundColor: '#F8FAFC', borderRadius: '14px', textAlign: 'center', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '24px', fontWeight: 800, color: '#059669' }}>
                          {reports.completed_attempts ?? reports.completed_count ?? 0}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', marginTop: '2px' }}>
                          Completed
                        </div>
                      </div>
                      <div style={{ padding: '16px', backgroundColor: '#F8FAFC', borderRadius: '14px', textAlign: 'center', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '24px', fontWeight: 800, color: '#D97706' }}>
                          {reports.in_progress_attempts ?? reports.in_progress_count ?? 0}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', marginTop: '2px' }}>
                          In Progress
                        </div>
                      </div>
                      <div style={{ padding: '16px', backgroundColor: '#F8FAFC', borderRadius: '14px', textAlign: 'center', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '24px', fontWeight: 800, color: '#DC2626' }}>
                          {reports.flagged_attempts ?? 0}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', marginTop: '2px' }}>
                          Flagged
                        </div>
                      </div>
                      <div style={{ padding: '16px', backgroundColor: '#F8FAFC', borderRadius: '14px', textAlign: 'center', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '24px', fontWeight: 800, color: '#4F46E5' }}>
                          {reports.average_score !== undefined ? `${reports.average_score} pts` : 'N/A'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', marginTop: '2px' }}>
                          Avg Score
                        </div>
                      </div>
                    </div>

                    {/* Detailed Per-Assessment Breakdown */}
                    <div style={{ marginBottom: '24px' }}>
                      <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>Associated Assessments Performance</span>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>
                          Completion Rate: {reports.completion_rate ? `${reports.completion_rate}%` : '0%'}
                        </span>
                      </h4>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>
                            <th style={{ padding: '10px 12px' }}>Assessment Title & Code</th>
                            <th style={{ padding: '10px 12px' }}>Delivery Mode</th>
                            <th style={{ padding: '10px 12px' }}>Attempts</th>
                            <th style={{ padding: '10px 12px' }}>Completed</th>
                            <th style={{ padding: '10px 12px' }}>In Progress</th>
                            <th style={{ padding: '10px 12px' }}>Avg Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reports.assessments_breakdown && reports.assessments_breakdown.length > 0 ? (
                            reports.assessments_breakdown.map((ab: any) => (
                              <tr key={ab.assessment_id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                <td style={{ padding: '12px', fontWeight: 700, color: '#0F172A' }}>
                                  <div>{ab.title || ab.assessment_title}</div>
                                  <div style={{ fontSize: '11px', color: '#0052CC', fontWeight: 600 }}>{ab.code || ab.assessment_code}</div>
                                </td>
                                <td style={{ padding: '12px', color: '#64748B' }}>
                                  <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, backgroundColor: '#F1F5F9' }}>
                                    {ab.delivery_mode || 'MCQ'}
                                  </span>
                                </td>
                                <td style={{ padding: '12px', fontWeight: 700 }}>{ab.total_attempts ?? ab.attempts_count ?? 0}</td>
                                <td style={{ padding: '12px', color: '#059669', fontWeight: 700 }}>{ab.completed_attempts ?? ab.completed_count ?? 0}</td>
                                <td style={{ padding: '12px', color: '#D97706', fontWeight: 700 }}>{ab.in_progress_attempts ?? ab.in_progress_count ?? 0}</td>
                                <td style={{ padding: '12px', color: '#4F46E5', fontWeight: 700 }}>
                                  {ab.average_score !== undefined ? `${ab.average_score} pts` : '-'}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#94A3B8' }}>
                                No assessment attempt data recorded yet for this drive.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Participating Colleges Breakdown */}
                    {reports.college_participation && reports.college_participation.length > 0 && (
                      <div>
                        <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 800, color: '#1E293B' }}>
                          Institutional Participation
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                          {reports.college_participation.map((cp: any, idx: number) => (
                            <div key={idx} style={{ padding: '12px 14px', backgroundColor: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {cp.college_name}
                              </span>
                              <span style={{ fontSize: '12px', fontWeight: 800, color: '#0052CC', backgroundColor: '#EFF6FF', padding: '2px 8px', borderRadius: '6px' }}>
                                {cp.candidate_count}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p style={{ color: '#64748B', textAlign: 'center', padding: '24px' }}>Loading analytics report...</p>
                )}
              </div>
            )}

            {/* TAB: SETTINGS & ELIGIBILITY */}
            {manageTab === 'settings' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ padding: '20px', backgroundColor: '#F8FAFC', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                  <h4 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                    Drive Settings & Operational Parameters
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Drive Name</label>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Drive Code</label>
                        <input
                          type="text"
                          value={editForm.code}
                          onChange={(e) => setEditForm({ ...editForm, code: e.target.value.toUpperCase() })}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', fontFamily: 'monospace' }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Description</label>
                      <textarea
                        rows={3}
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Status</label>
                        <select
                          value={editForm.status}
                          onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', backgroundColor: '#FFFFFF' }}
                        >
                          <option value="DRAFT">Draft</option>
                          <option value="UPCOMING">Upcoming</option>
                          <option value="ACTIVE">Active</option>
                          <option value="COMPLETED">Completed</option>
                          <option value="ARCHIVED">Archived</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Visibility</label>
                        <select
                          value={editForm.visibility}
                          onChange={(e) => setEditForm({ ...editForm, visibility: e.target.value as any })}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', backgroundColor: '#FFFFFF' }}
                        >
                          <option value="PUBLIC">Public</option>
                          <option value="INVITE_ONLY">Invite Only</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                      <button
                        type="button"
                        onClick={handleUpdateDrive}
                        disabled={updating}
                        style={{
                          padding: '10px 20px',
                          borderRadius: '10px',
                          border: 'none',
                          backgroundColor: '#0052CC',
                          color: '#FFFFFF',
                          fontWeight: 700,
                          fontSize: '13px',
                          cursor: 'pointer',
                        }}
                      >
                        {updating ? 'Saving Changes...' : 'Save Drive Settings'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Institutional Eligibility Embedded in Settings */}
                <div style={{ padding: '20px', backgroundColor: '#F8FAFC', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                    Eligible Colleges & Institutions
                  </h4>
                  <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#64748B' }}>
                    Leave unselected to make this Drive open to all verified institutions.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px', maxHeight: '180px', overflowY: 'auto', padding: '8px', backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', marginBottom: '14px' }}>
                    {colleges.map((c) => {
                      const isChecked = selectedEligibleColleges.includes(c.id);
                      return (
                        <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0F172A', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedEligibleColleges([...selectedEligibleColleges, c.id]);
                              } else {
                                setSelectedEligibleColleges(selectedEligibleColleges.filter((id) => id !== c.id));
                              }
                            }}
                          />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name} ({c.code})</span>
                        </label>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={handleSaveEligibility}
                      style={{
                        padding: '8px 18px',
                        borderRadius: '10px',
                        border: 'none',
                        backgroundColor: '#0F172A',
                        color: '#FFFFFF',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                      }}
                    >
                      Update Eligible Colleges
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </AccessibleModal>
    </div>
  );
}
