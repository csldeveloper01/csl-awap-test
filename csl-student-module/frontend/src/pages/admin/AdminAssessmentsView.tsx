import React, { useState, useEffect } from 'react';
import { formatApiError } from '../../utils/errorFormatter';
import {
  getAdminAssessments,
  getAdminAssessmentDetail,
  createAdminAssessment,
  updateAdminAssessment,
  deleteAdminAssessment,
  bulkDeleteAdminAssessments,
  prepareAdminAssessment,
  openAdminAssessment,
  closeAdminAssessment,
  archiveAdminAssessment,
  assignAdminAssessmentColleges,
  getAdminColleges,
  getAdminQuestions,
  removeAdminAssessmentQuestion,
  addAdminAssessmentQuestions,
  replaceAdminAssessmentQuestion,
  type AdminQuestion,
  type AdminAssessmentSectionAllocation,
  getAdminSections,
  createAdminSection,
  uploadAdminAssessmentPdf,
  fetchAdminAssessmentPdfBlob,
  getAdminAssessmentCandidates,
  assignAdminAssessmentCandidates,
  getAdminCandidates,
  type AdminAssessment,
  type AdminAssessmentDetail,
  type AdminCollege,
  type AdminSection,
} from '../../api/admin';

interface AdminAssessmentsViewProps {
  onNavigateToQuestions?: (assessmentId?: string) => void;
  initialAssessmentId?: string;
  onClearAssessmentId?: () => void;
}

interface AssessmentSectionDraft {
  section_id: number;
  name: string;
  code: string;
  question_count: number;
  marks_per_question: number;
}

export function AdminAssessmentsView({
  onNavigateToQuestions,
  initialAssessmentId,
  onClearAssessmentId,
}: AdminAssessmentsViewProps) {
  const [assessments, setAssessments] = useState<AdminAssessment[]>([]);
  const [colleges, setColleges] = useState<AdminCollege[]>([]);
  const [availableSections, setAvailableSections] = useState<AdminSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Bulk Selection & Deletion State
  const [selectedAssessmentIds, setSelectedAssessmentIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);

  // Inline Section Creation Modal
  const [showInlineSectionModal, setShowInlineSectionModal] = useState(false);
  const [inlineSectionForm, setInlineSectionForm] = useState({ name: '', code: '', description: '' });
  const [inlineSectionSaving, setInlineSectionSaving] = useState(false);
  const [inlineSectionError, setInlineSectionError] = useState('');
  const [inlineSectionTarget, setInlineSectionTarget] = useState<'create' | 'edit'>('create');

  // Selected assessment for actions
  const [selectedAssessment, setSelectedAssessment] = useState<AdminAssessment | null>(null);
  const [assessmentDetail, setAssessmentDetail] = useState<AdminAssessmentDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Close Assessment policy selection
  const [closePolicy, setClosePolicy] = useState<'ALLOW_FINISH' | 'STRICT_CUTOFF'>('ALLOW_FINISH');
  const [closing, setClosing] = useState(false);

  // Detail tab state
  const [detailTab, setDetailTab] = useState<'overview' | 'colleges' | 'candidates' | 'audit'>('overview');
    const [allCandidates, setAllCandidates] = useState<any[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [savingCandidates, setSavingCandidates] = useState(false);
  const [candidateSearchQuery, setCandidateSearchQuery] = useState('');
  const [selectedCandidateIdsForAssign, setSelectedCandidateIdsForAssign] = useState<string[]>([]);
  const [selectedCollegeIdsForAssign, setSelectedCollegeIdsForAssign] = useState<number[]>([]);
  const [savingColleges, setSavingColleges] = useState(false);
  const [collegeAssignError, setCollegeAssignError] = useState<string | null>(null);
  const [collegeSearchQuery, setCollegeSearchQuery] = useState('');

  // Dynamic Section Pool Questions Management State (Phase 2.1)
  const [expandedSectionId, setExpandedSectionId] = useState<number | null>(null);
  const [sectionQuestions, setSectionQuestions] = useState<Record<number, AdminQuestion[]>>({});
  const [loadingSectionQuestions, setLoadingSectionQuestions] = useState<Record<number, boolean>>({});
  const [previewQuestion, setPreviewQuestion] = useState<AdminQuestion | null>(null);

  // Add questions to section modal state
  const [showAddQuestionsModal, setShowAddQuestionsModal] = useState(false);
  const [targetSectionForAdd, setTargetSectionForAdd] = useState<AdminAssessmentSectionAllocation | null>(null);
  const [bankQuestionsForAdd, setBankQuestionsForAdd] = useState<AdminQuestion[]>([]);
  const [selectedBankQuestionIds, setSelectedBankQuestionIds] = useState<number[]>([]);
  const [loadingBankQuestions, setLoadingBankQuestions] = useState(false);
  const [addingBankQuestions, setAddingBankQuestions] = useState(false);

  // Replace question modal state
  const [showReplaceQuestionModal, setShowReplaceQuestionModal] = useState(false);
  const [replacingQuestion, setReplacingQuestion] = useState<AdminQuestion | null>(null);
  const [targetSectionForReplace, setTargetSectionForReplace] = useState<AdminAssessmentSectionAllocation | null>(null);
  const [replacementOptions, setReplacementOptions] = useState<AdminQuestion[]>([]);
  const [selectedReplacementId, setSelectedReplacementId] = useState<number | null>(null);
  const [replacingAction, setReplacingAction] = useState(false);

  // Dynamic Section Allocation states for Create & Edit
  const [createSections, setCreateSections] = useState<AssessmentSectionDraft[]>([]);
  const [editSections, setEditSections] = useState<AssessmentSectionDraft[]>([]);

  // Create Form State
  const [createForm, setCreateForm] = useState({
    code: '',
    title: '',
    description: '',
    duration_minutes: 60,
    max_attempts: 1,
    max_tab_switches_warning: 2,
    auto_submit_on_tab_limit: true,
    close_policy: 'ALLOW_FINISH' as 'ALLOW_FINISH' | 'STRICT_CUTOFF',
    eligible_college_ids: [] as number[],
  });
  const [createError, setCreateError] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Edit Form State
  const [editForm, setEditForm] = useState({
    id: '',
    code: '',
    title: '',
    description: '',
    duration_minutes: 60,
    max_attempts: 1,
    max_tab_switches_warning: 2,
    auto_submit_on_tab_limit: true,
    close_policy: 'ALLOW_FINISH' as 'ALLOW_FINISH' | 'STRICT_CUTOFF',
  });
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  // PDF Assessment Mode State
  const [createDeliveryMode, setCreateDeliveryMode] = useState<'MCQ' | 'PDF_CODING'>('MCQ');
  const [createPdfFile, setCreatePdfFile] = useState<File | null>(null);

  const [editDeliveryMode, setEditDeliveryMode] = useState<'MCQ' | 'PDF_CODING'>('MCQ');
  const [editPdfFile, setEditPdfFile] = useState<File | null>(null);
  const [editPdfFilename, setEditPdfFilename] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handleDownloadPdf = async (assessmentId: string, filename?: string) => {
    try {
      setDownloadingPdf(true);
      const blob = await fetchAdminAssessmentPdfBlob(assessmentId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'question_paper.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      alert(formatApiError(err, 'Failed to download question paper PDF.'));
    } finally {
      setDownloadingPdf(false);
    }
  };
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchAssessments = async () => {
    setLoading(true);
    try {
      const data = await getAdminAssessments({
        search: search.trim() || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
      });
      setAssessments(data);
    } catch (err) {
      console.error('Failed to fetch assessments:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchColleges = async () => {
    try {
      const data = await getAdminColleges({ is_active: 'true' });
      setColleges(data);
    } catch (err) {
      console.error('Failed to fetch colleges list:', err);
    }
  };

  const fetchSections = async () => {
    try {
      const data = await getAdminSections();
      setAvailableSections(data);
    } catch (err) {
      console.error('Failed to fetch reusable sections:', err);
    }
  };

  useEffect(() => {
    fetchAssessments();
    fetchColleges();
    fetchSections();
  }, [search, statusFilter]);

  const handleOpenDetail = async (
    assessmentOrId: AdminAssessment | string,
    initialTab: 'overview' | 'colleges' | 'audit' = 'overview'
  ) => {
    const assessmentId = typeof assessmentOrId === 'string' ? assessmentOrId : assessmentOrId.id;
    if (!assessmentId) return;

    // Strict UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(assessmentId)) {
      setDetailError(`Invalid assessment ID "${assessmentId}". A valid UUID is required.`);
      setSelectedAssessment(null);
      setAssessmentDetail(null);
      setShowDetailModal(true);
      return;
    }

    if (typeof assessmentOrId !== 'string') {
      setSelectedAssessment(assessmentOrId);
    } else {
      const match = assessments.find((a) => a.id === assessmentId);
      if (match) setSelectedAssessment(match);
    }

    setDetailTab(initialTab);
    setCollegeAssignError(null);
    setCollegeSearchQuery('');
    setShowDetailModal(true);
    setLoadingDetail(true);
    setDetailError(null);

    try {
      const detail = await getAdminAssessmentDetail(assessmentId);
      setAssessmentDetail(detail);
      setSelectedAssessment(detail);
      const colIds = Array.isArray(detail.eligible_colleges)
        ? detail.eligible_colleges.map((c) => c.id)
        : [];
      setSelectedCollegeIdsForAssign(colIds);
      fetchCandidatesForAssessment(assessmentId);
    } catch (err: any) {
      console.error('Failed to fetch assessment detail:', err);
      const status = err?.response?.status;
      if (status === 404) {
        setDetailError('Assessment not found. It may have been archived or deleted.');
      } else if (status === 401 || status === 403) {
        setDetailError('Access denied: Administrator permissions required.');
      } else {
        setDetailError(
          formatApiError(err, 'Failed to load assessment details from server. Please check your connection and retry.')
        );
      }
    } finally {
      setLoadingDetail(false);
    }
  };

  // Auto-open assessment detail if initialAssessmentId was provided via route/query
  useEffect(() => {
    if (initialAssessmentId) {
      handleOpenDetail(initialAssessmentId);
    }
  }, [initialAssessmentId]);

  const handleCloseDetail = () => {
    setShowDetailModal(false);
    setSelectedAssessment(null);
    setAssessmentDetail(null);
    setDetailError(null);
    setCollegeAssignError(null);
    setCollegeSearchQuery('');
    if (onClearAssessmentId) {
      onClearAssessmentId();
    }
  };

  const handlePrepare = async (assessment: AdminAssessment) => {
    setActionMessage(null);
    try {
      const res = await prepareAdminAssessment(assessment.id);
      setActionMessage({ text: res.message, type: 'success' });
      fetchAssessments();
      if (assessmentDetail && assessmentDetail.id === assessment.id) {
        handleOpenDetail(assessment);
      }
    } catch (err: any) {
      setActionMessage({ text: formatApiError(err, 'Failed to prepare assessment.'), type: 'error' });
    }
  };

  const handleOpen = async (assessment: AdminAssessment) => {
    setActionMessage(null);
    try {
      const res = await openAdminAssessment(assessment.id);
      setActionMessage({ text: res.message, type: 'success' });
      fetchAssessments();
      if (assessmentDetail && assessmentDetail.id === assessment.id) {
        handleOpenDetail(assessment);
      }
    } catch (err: any) {
      setActionMessage({ text: formatApiError(err, 'Failed to open assessment.'), type: 'error' });
    }
  };

  const handleOpenCloseModal = (assessment: AdminAssessment) => {
    setSelectedAssessment(assessment);
    setClosePolicy(assessment.close_policy || 'ALLOW_FINISH');
    setShowCloseModal(true);
  };

  const handleConfirmClose = async () => {
    if (!selectedAssessment) return;
    setClosing(true);
    setActionMessage(null);
    try {
      const res = await closeAdminAssessment(selectedAssessment.id, closePolicy);
      setActionMessage({ text: res.message, type: 'success' });
      setShowCloseModal(false);
      fetchAssessments();
      if (assessmentDetail && assessmentDetail.id === selectedAssessment.id) {
        handleOpenDetail(selectedAssessment);
      }
    } catch (err: any) {
      setActionMessage({ text: formatApiError(err, 'Failed to close assessment.'), type: 'error' });
    } finally {
      setClosing(false);
    }
  };

  const handleDeleteAssessment = async (assessment: AdminAssessment) => {
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete '${assessment.title}' (${assessment.code})?\n\nThis action cannot be undone.`
    );
    if (!confirmed) return;

    setActionMessage(null);
    try {
      const res = await deleteAdminAssessment(assessment.id);
      setActionMessage({ text: res.message, type: 'success' });
      setAssessments((prev) => prev.filter((a) => a.id !== assessment.id));
      setSelectedAssessmentIds((prev) => prev.filter((id) => id !== assessment.id));
      if (selectedAssessment?.id === assessment.id) {
        setShowDetailModal(false);
        setSelectedAssessment(null);
      }
    } catch (err: any) {
      const msg = formatApiError(err, 'Failed to delete assessment.');
      setActionMessage({ text: msg, type: 'error' });
      alert(`Delete Error: ${msg}`);
    }
  };

  const handleToggleSelectAllAssessments = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedAssessmentIds(assessments.map((a) => a.id));
    } else {
      setSelectedAssessmentIds([]);
    }
  };

  const handleToggleSelectAssessment = (id: string) => {
    setSelectedAssessmentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkDeleteAssessments = async () => {
    if (selectedAssessmentIds.length === 0) return;
    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedAssessmentIds.length} selected assessment(s)?\n\nAssessments with existing candidate attempts will be safely archived instead of permanently deleted to protect candidate records.`
    );
    if (!confirmed) return;

    try {
      setBulkDeleting(true);
      const res = await bulkDeleteAdminAssessments(selectedAssessmentIds);
      setActionMessage({ text: res.message, type: 'success' });
      setSelectedAssessmentIds([]);
      fetchAssessments();
    } catch (err: any) {
      const msg = formatApiError(err, 'Failed to delete assessments.');
      setActionMessage({ text: msg, type: 'error' });
      alert(`Delete Error: ${msg}`);
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleArchive = async (assessment: AdminAssessment) => {
    if (!window.confirm(`Archive assessment "${assessment.title}"?`)) return;
    setActionMessage(null);
    try {
      const res = await archiveAdminAssessment(assessment.id);
      setActionMessage({ text: res.message, type: 'success' });
      fetchAssessments();
    } catch (err: any) {
      setActionMessage({ text: formatApiError(err, 'Failed to archive assessment.'), type: 'error' });
    }
  };

  const fetchCandidatesForAssessment = async (assessmentId: string) => {
    try {
      setLoadingCandidates(true);
      const [assignedRes, candidatesRes] = await Promise.all([
        getAdminAssessmentCandidates(assessmentId),
        getAdminCandidates(),
      ]);
            setSelectedCandidateIdsForAssign((assignedRes.candidates || []).map((c: any) => c.id));
      setAllCandidates(candidatesRes || []);
    } catch (err) {
      console.error('Failed to load candidate assignments:', err);
    } finally {
      setLoadingCandidates(false);
    }
  };

  const handleSaveCandidates = async () => {
    if (!assessmentDetail) return;
    setSavingCandidates(true);
    try {
      const res = await assignAdminAssessmentCandidates(assessmentDetail.id, selectedCandidateIdsForAssign);
      setActionMessage({ text: res.message || 'Direct candidate eligibility updated successfully.', type: 'success' });
      fetchCandidatesForAssessment(assessmentDetail.id);
    } catch (err: any) {
      setActionMessage({ text: formatApiError(err, 'Failed to update candidate assignments.'), type: 'error' });
    } finally {
      setSavingCandidates(false);
    }
  };

  const handleSaveColleges = async () => {
    if (!assessmentDetail) return;
    setSavingColleges(true);
    setCollegeAssignError(null);
    try {
      const res = await assignAdminAssessmentColleges(assessmentDetail.id, selectedCollegeIdsForAssign);
      setActionMessage({ text: res.message || 'College assignments saved successfully.', type: 'success' });
      if (res.assessment) {
        setAssessmentDetail(res.assessment);
        setSelectedAssessment(res.assessment);
      } else {
        const freshDetail = await getAdminAssessmentDetail(assessmentDetail.id);
        setAssessmentDetail(freshDetail);
        setSelectedAssessment(freshDetail);
      }
      const updatedColleges = res.eligible_colleges || [];
      setSelectedCollegeIdsForAssign(updatedColleges.map((c) => c.id));
      fetchAssessments();
    } catch (err: any) {
      const errFormatted = formatApiError(err, 'Failed to assign colleges.');
      setCollegeAssignError(errFormatted);
      setActionMessage({ text: errFormatted, type: 'error' });
    } finally {
      setSavingColleges(false);
    }
  };

  // Section Pool Questions Handlers
  const handleToggleExpandSection = async (sec: AdminAssessmentSectionAllocation) => {
    if (expandedSectionId === sec.section_id) {
      setExpandedSectionId(null);
      return;
    }
    setExpandedSectionId(sec.section_id);
    if (!sectionQuestions[sec.section_id] && assessmentDetail) {
      setLoadingSectionQuestions((prev) => ({ ...prev, [sec.section_id]: true }));
      try {
        const qs = await getAdminQuestions({ assessment_id: assessmentDetail.id, section_id: sec.section_id });
        setSectionQuestions((prev) => ({ ...prev, [sec.section_id]: qs }));
      } catch (err) {
        console.error('Failed to load section questions:', err);
      } finally {
        setLoadingSectionQuestions((prev) => ({ ...prev, [sec.section_id]: false }));
      }
    }
  };

  const handleRemoveQuestionFromSection = async (sec: AdminAssessmentSectionAllocation, questionId: number) => {
    if (!assessmentDetail) return;
    if (!window.confirm(`Remove question #${questionId} from this assessment pool?\n\nThe question will remain safely in the Question Bank.`)) return;
    try {
      await removeAdminAssessmentQuestion(assessmentDetail.id, questionId);
      const freshDetail = await getAdminAssessmentDetail(assessmentDetail.id);
      setAssessmentDetail(freshDetail);
      setSelectedAssessment(freshDetail);
      const qs = await getAdminQuestions({ assessment_id: assessmentDetail.id, section_id: sec.section_id });
      setSectionQuestions((prev) => ({ ...prev, [sec.section_id]: qs }));
    } catch (err: any) {
      alert(formatApiError(err, 'Failed to remove question from assessment pool.'));
    }
  };

  const handleOpenAddQuestions = async (sec: AdminAssessmentSectionAllocation) => {
    if (!assessmentDetail) return;
    setTargetSectionForAdd(sec);
    setSelectedBankQuestionIds([]);
    setShowAddQuestionsModal(true);
    setLoadingBankQuestions(true);
    try {
      const allSecQuestions = await getAdminQuestions({ section_id: sec.section_id, is_active: 'true' });
      const currentAssignedIds = (sectionQuestions[sec.section_id] || []).map((q) => q.id);
      const available = allSecQuestions.filter((q) => !currentAssignedIds.includes(q.id));
      setBankQuestionsForAdd(available);
    } catch (err) {
      console.error('Failed to load bank questions for add:', err);
    } finally {
      setLoadingBankQuestions(false);
    }
  };

  const handleAddQuestionsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assessmentDetail || !targetSectionForAdd || selectedBankQuestionIds.length === 0) return;
    setAddingBankQuestions(true);
    try {
      await addAdminAssessmentQuestions(assessmentDetail.id, selectedBankQuestionIds);
      const freshDetail = await getAdminAssessmentDetail(assessmentDetail.id);
      setAssessmentDetail(freshDetail);
      setSelectedAssessment(freshDetail);
      const qs = await getAdminQuestions({ assessment_id: assessmentDetail.id, section_id: targetSectionForAdd.section_id });
      setSectionQuestions((prev) => ({ ...prev, [targetSectionForAdd.section_id]: qs }));
      setShowAddQuestionsModal(false);
      setTargetSectionForAdd(null);
    } catch (err: any) {
      alert(formatApiError(err, 'Failed to add questions to pool.'));
    } finally {
      setAddingBankQuestions(false);
    }
  };

  const handleOpenReplaceQuestion = async (sec: AdminAssessmentSectionAllocation, q: AdminQuestion) => {
    if (!assessmentDetail) return;
    setTargetSectionForReplace(sec);
    setReplacingQuestion(q);
    setSelectedReplacementId(null);
    setShowReplaceQuestionModal(true);
    try {
      const allSecQuestions = await getAdminQuestions({ section_id: sec.section_id, is_active: 'true' });
      const currentAssignedIds = (sectionQuestions[sec.section_id] || []).map((item) => item.id);
      const available = allSecQuestions.filter((item) => !currentAssignedIds.includes(item.id) && item.id !== q.id);
      setReplacementOptions(available);
    } catch (err) {
      console.error('Failed to load replacement options:', err);
    }
  };

  const handleReplaceQuestionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assessmentDetail || !replacingQuestion || !selectedReplacementId) return;
    setReplacingAction(true);
    try {
      await replaceAdminAssessmentQuestion(assessmentDetail.id, replacingQuestion.id, selectedReplacementId);
      const freshDetail = await getAdminAssessmentDetail(assessmentDetail.id);
      setAssessmentDetail(freshDetail);
      setSelectedAssessment(freshDetail);
      if (targetSectionForReplace) {
        const qs = await getAdminQuestions({ assessment_id: assessmentDetail.id, section_id: targetSectionForReplace.section_id });
        setSectionQuestions((prev) => ({ ...prev, [targetSectionForReplace.section_id]: qs }));
      }
      setShowReplaceQuestionModal(false);
      setReplacingQuestion(null);
    } catch (err: any) {
      alert(formatApiError(err, 'Failed to replace question.'));
    } finally {
      setReplacingAction(false);
    }
  };

  // Section Allocation Helpers
  const handleOpenCreateModal = () => {
    setCreateError('');
    setCreateDeliveryMode('MCQ');
    setCreatePdfFile(null);
    setCreateForm({
      code: '',
      title: '',
      description: '',
      duration_minutes: 60,
      max_attempts: 1,
      max_tab_switches_warning: 2,
      auto_submit_on_tab_limit: true,
      close_policy: 'ALLOW_FINISH',
      eligible_college_ids: [],
    });

    // Phase 2.1: Start with empty sections - require explicit admin configuration
    setCreateSections([]);
    setShowCreateModal(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    if (!createForm.code.trim()) {
      setCreateError('Assessment code is required.');
      return;
    }
    if (!createForm.title.trim()) {
      setCreateError('Assessment title is required.');
      return;
    }
    if (createDeliveryMode === 'PDF_CODING') {
      if (!createPdfFile) {
        setCreateError('Please select a valid PDF question paper to create a PDF Assessment Mode round.');
        return;
      }
    } else {
      if (createSections.length === 0) {
        setCreateError('Please configure at least one section for this assessment.');
        return;
      }
    }

    const totalQuestions = createDeliveryMode === 'PDF_CODING'
      ? 0
      : createSections.reduce((sum, s) => sum + Number(s.question_count || 0), 0);
    const totalMarks = createDeliveryMode === 'PDF_CODING'
      ? 100
      : createSections.reduce(
          (sum, s) => sum + Number(s.question_count || 0) * Number(s.marks_per_question || 1),
          0
        );

    if (createDeliveryMode !== 'PDF_CODING' && totalQuestions <= 0) {
      setCreateError('Total questions must be greater than 0.');
      return;
    }

    const payloadSections = createDeliveryMode === 'PDF_CODING'
      ? []
      : createSections.map((s, idx) => ({
          section_id: s.section_id,
          question_count: Number(s.question_count),
          marks_per_question: Number(s.marks_per_question || 1),
          order: idx,
        }));

    // Find aptitude and coding counts for legacy fallback
    const aptSec = createSections.find((s) => s.code.toUpperCase() === 'APTITUDE');
    const codSec = createSections.find((s) => s.code.toUpperCase() === 'CODING');

    setCreateSubmitting(true);
    try {
      if (createDeliveryMode === 'PDF_CODING') {
        const formData = new FormData();
        formData.append('code', createForm.code.trim().toUpperCase());
        formData.append('title', createForm.title.trim());
        formData.append('description', createForm.description || '');
        formData.append('delivery_mode', 'PDF_CODING');
        formData.append('duration_minutes', String(createForm.duration_minutes));
        formData.append('total_marks', String(totalMarks));
        formData.append('aptitude_count', '0');
        formData.append('coding_count', '0');
        formData.append('max_attempts', String(createForm.max_attempts));
        formData.append('max_tab_switches_warning', String(createForm.max_tab_switches_warning));
        formData.append('auto_submit_on_tab_limit', String(createForm.auto_submit_on_tab_limit));
        formData.append('close_policy', createForm.close_policy);
        if (createPdfFile) {
          formData.append('pdf_file', createPdfFile);
        }
        createForm.eligible_college_ids.forEach((cid) => {
          formData.append('eligible_college_ids', String(cid));
        });

        await createAdminAssessment(formData);
      } else {
        await createAdminAssessment({
          ...createForm,
          code: createForm.code.trim().toUpperCase(),
          delivery_mode: createDeliveryMode,
          total_marks: totalMarks,
          aptitude_count: aptSec ? Number(aptSec.question_count) : (payloadSections.length > 0 ? 0 : Math.floor(totalQuestions / 2)),
          coding_count: codSec ? Number(codSec.question_count) : (payloadSections.length > 0 ? 0 : Math.ceil(totalQuestions / 2)),
          sections: payloadSections,
        });
      }

      setShowCreateModal(false);
      fetchAssessments();
      setActionMessage({ text: `Assessment "${createForm.title}" created successfully in DRAFT state.`, type: 'success' });
    } catch (err: any) {
      setCreateError(formatApiError(err, 'Failed to create assessment.'));
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleOpenEdit = (assessment: AdminAssessment) => {
    setEditError('');
    setEditDeliveryMode(assessment.delivery_mode || 'MCQ');
    setEditPdfFile(null);
    setEditPdfFilename(assessment.pdf_filename || null);
    setEditForm({
      id: assessment.id,
      code: assessment.code,
      title: assessment.title,
      description: assessment.description || '',
      duration_minutes: assessment.duration_minutes,
      max_attempts: assessment.max_attempts,
      max_tab_switches_warning: assessment.max_tab_switches_warning,
      auto_submit_on_tab_limit: assessment.auto_submit_on_tab_limit,
      close_policy: (assessment.close_policy as any) || 'ALLOW_FINISH',
    });

    if (assessment.sections && assessment.sections.length > 0) {
      setEditSections(
        assessment.sections.map((s) => ({
          section_id: s.section_id ?? s.section ?? 0,
          name: s.section_name || s.section_code || `Section #${s.section_id ?? s.section}`,
          code: s.section_code || '',
          question_count: s.question_count,
          marks_per_question: s.marks_per_question || 1,
        }))
      );
    } else {
      // Fallback for legacy assessments without sections: look for active sections or Aptitude/Coding
      const fallbackList: AssessmentSectionDraft[] = [];
      const aptLib = availableSections.find((s) => s.code.toUpperCase() === 'APTITUDE');
      const codLib = availableSections.find((s) => s.code.toUpperCase() === 'CODING');
      if (aptLib) {
        fallbackList.push({
          section_id: aptLib.id,
          name: aptLib.name,
          code: aptLib.code,
          question_count: assessment.aptitude_count || 25,
          marks_per_question: 1,
        });
      }
      if (codLib) {
        fallbackList.push({
          section_id: codLib.id,
          name: codLib.name,
          code: codLib.code,
          question_count: assessment.coding_count || 25,
          marks_per_question: 1,
        });
      }
      if (fallbackList.length === 0 && availableSections.length > 0) {
        fallbackList.push({
          section_id: availableSections[0].id,
          name: availableSections[0].name,
          code: availableSections[0].code,
          question_count: 25,
          marks_per_question: 1,
        });
      }
      setEditSections(fallbackList);
    }
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError('');
    if (!editForm.title.trim()) {
      setEditError('Assessment title is required.');
      return;
    }
    if (editForm.duration_minutes < 1) {
      setEditError('Duration must be at least 1 minute.');
      return;
    }
    if (editDeliveryMode === 'PDF_CODING') {
      if (!editPdfFilename && !editPdfFile) {
        setEditError('A valid PDF question paper is required for PDF Assessment Mode.');
        return;
      }
    } else {
      if (editSections.length === 0) {
        setEditError('Assessment must include at least 1 section.');
        return;
      }
    }

    const totalQuestions = editDeliveryMode === 'PDF_CODING'
      ? 0
      : editSections.reduce((sum, s) => sum + Number(s.question_count || 0), 0);
    const totalMarks = editDeliveryMode === 'PDF_CODING'
      ? 100
      : editSections.reduce(
          (sum, s) => sum + Number(s.question_count || 0) * Number(s.marks_per_question || 1),
          0
        );

    if (editDeliveryMode !== 'PDF_CODING' && totalQuestions <= 0) {
      setEditError('Total question count across sections must be greater than 0.');
      return;
    }

    const payloadSections = editDeliveryMode === 'PDF_CODING'
      ? []
      : editSections.map((s, idx) => ({
          section_id: s.section_id,
          question_count: Number(s.question_count),
          marks_per_question: Number(s.marks_per_question || 1),
          order: idx,
        }));

    const aptSec = editSections.find((s) => s.code.toUpperCase() === 'APTITUDE');
    const codSec = editSections.find((s) => s.code.toUpperCase() === 'CODING');

    setEditSubmitting(true);
    try {
      const updated = await updateAdminAssessment(editForm.id, {
        code: editForm.code.trim().toUpperCase(),
        title: editForm.title.trim(),
        description: editForm.description,
        duration_minutes: Number(editForm.duration_minutes),
        total_marks: totalMarks,
        delivery_mode: editDeliveryMode,
        aptitude_count: editDeliveryMode === 'PDF_CODING' ? 0 : (aptSec ? Number(aptSec.question_count) : (payloadSections.length > 0 ? 0 : Math.floor(totalQuestions / 2))),
        coding_count: editDeliveryMode === 'PDF_CODING' ? 0 : (codSec ? Number(codSec.question_count) : (payloadSections.length > 0 ? 0 : Math.ceil(totalQuestions / 2))),
        max_attempts: Number(editForm.max_attempts),
        max_tab_switches_warning: Number(editForm.max_tab_switches_warning),
        auto_submit_on_tab_limit: editForm.auto_submit_on_tab_limit,
        close_policy: editForm.close_policy,
        sections: payloadSections,
      });

      if (editDeliveryMode === 'PDF_CODING' && editPdfFile) {
        await uploadAdminAssessmentPdf(editForm.id, editPdfFile);
      }
      setShowEditModal(false);
      fetchAssessments();
      if (selectedAssessment?.id === editForm.id) {
        setSelectedAssessment((prev) => (prev ? { ...prev, ...updated } : null));
        if (assessmentDetail?.id === editForm.id) {
          handleOpenDetail(updated);
        }
      }
      setActionMessage({ text: `Assessment "${editForm.title}" updated successfully.`, type: 'success' });
    } catch (err: any) {
      setEditError(formatApiError(err, 'Failed to update assessment.'));
    } finally {
      setEditSubmitting(false);
    }
  };

  // Inline Section Creation Submit (without losing assessment form state)
  const handleInlineSectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineSectionForm.name.trim() || !inlineSectionForm.code.trim()) {
      setInlineSectionError('Name and unique code are required.');
      return;
    }

    setInlineSectionSaving(true);
    setInlineSectionError('');
    try {
      const newSec = await createAdminSection({
        name: inlineSectionForm.name.trim(),
        code: inlineSectionForm.code.trim().toUpperCase(),
        description: inlineSectionForm.description.trim(),
        is_active: true,
      });

      // Refresh available sections
      await fetchSections();

      // Automatically add new section to the active modal's draft allocations
      const draftItem: AssessmentSectionDraft = {
        section_id: newSec.id,
        name: newSec.name,
        code: newSec.code,
        question_count: 10,
        marks_per_question: 1,
      };

      if (inlineSectionTarget === 'create') {
        setCreateSections((prev) => [...prev, draftItem]);
      } else {
        setEditSections((prev) => [...prev, draftItem]);
      }

      setShowInlineSectionModal(false);
      setInlineSectionForm({ name: '', code: '', description: '' });
    } catch (err: any) {
      setInlineSectionError(formatApiError(err, 'Failed to create reusable section.'));
    } finally {
      setInlineSectionSaving(false);
    }
  };

  // Metrics
  const totalCount = assessments.length;
  const openCount = assessments.filter((a) => a.is_open).length;
  const totalAttempts = assessments.reduce((acc, a) => acc + (a.attempts_count || 0), 0);

  const getStatusBadge = (status: string, isOpen: boolean) => {
    let bg = '#F1F5F9';
    let color = '#475569';
    if (isOpen || status === 'OPEN') {
      bg = '#DCFCE7';
      color = '#15803D';
    } else if (status === 'READY') {
      bg = '#DBEAFE';
      color = '#1D4ED8';
    } else if (status === 'SCHEDULED') {
      bg = '#FEF9C3';
      color = '#A16207';
    } else if (status === 'CLOSED') {
      bg = '#F3E8FF';
      color = '#7E22CE';
    } else if (status === 'ARCHIVED') {
      bg = '#E2E8F0';
      color = '#334155';
    }

    return (
      <span
        style={{
          display: 'inline-block',
          padding: '3px 8px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: 800,
          backgroundColor: bg,
          color,
          letterSpacing: '0.04em',
        }}
      >
        {status}
      </span>
    );
  };

  return (
    <div style={{ padding: '24px 32px' }}>
      {/* ─── HEADER & ACTIONS ───────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
            Assessment Lifecycle Management
          </h1>
          <p style={{ margin: '4px 0 0', color: '#556987', fontSize: '14px' }}>
            Configure independent diagnostic rounds with dynamic section allocations, assign participating colleges, and control server-side opening states.
          </p>
        </div>
        <button
          onClick={handleOpenCreateModal}
          style={{
            backgroundColor: '#0B2E6F',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '8px',
            padding: '10px 18px',
            fontWeight: 700,
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(11,46,111,0.15)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Create New Assessment
        </button>
      </div>

      {actionMessage && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '14px',
            fontWeight: 600,
            backgroundColor: actionMessage.type === 'success' ? '#F0FDF4' : '#FEF2F2',
            color: actionMessage.type === 'success' ? '#15803D' : '#B91C1C',
            border: `1px solid ${actionMessage.type === 'success' ? '#BBF7D0' : '#FECDD3'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{formatApiError(actionMessage.text)}</span>
          <button
            onClick={() => setActionMessage(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ─── KPI SUMMARY CARDS ──────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#FFFFFF', borderRadius: '10px', padding: '16px 20px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assessments Total</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#0B2E6F', marginTop: '6px' }}>{totalCount}</div>
        </div>
        <div style={{ background: '#FFFFFF', borderRadius: '10px', padding: '16px 20px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#16A34A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active (Open)</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#16A34A', marginTop: '6px' }}>{openCount} <span style={{ fontSize: '14px', color: '#64748B', fontWeight: 500 }}>/ {totalCount}</span></div>
        </div>
        <div style={{ background: '#FFFFFF', borderRadius: '10px', padding: '16px 20px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#6366F1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Attempts Recorded</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#6366F1', marginTop: '6px' }}>{totalAttempts}</div>
        </div>
        <div style={{ background: '#FFFFFF', borderRadius: '10px', padding: '16px 20px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Enrolled Colleges</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#0B2E6F', marginTop: '6px' }}>{colleges.length}</div>
        </div>
      </div>

      {/* ─── CONTROLS: SEARCH & STATUS ──────────────────────────────── */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            type="text"
            placeholder="Search assessments by code, title, or instructions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px 10px 38px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '14px',
              boxSizing: 'border-box',
              outline: 'none',
              backgroundColor: '#FFFFFF',
            }}
          />
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#94A3B8"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid #CBD5E1',
            fontSize: '14px',
            backgroundColor: '#FFFFFF',
            cursor: 'pointer',
            outline: 'none',
            fontWeight: 500,
          }}
        >
          <option value="all">All Lifecycle States</option>
          <option value="DRAFT">DRAFT</option>
          <option value="READY">READY</option>
          <option value="SCHEDULED">SCHEDULED</option>
          <option value="OPEN">OPEN (Accepting Attempts)</option>
          <option value="CLOSED">CLOSED</option>
          <option value="ARCHIVED">ARCHIVED</option>
        </select>
      </div>

      {/* ─── BULK ACTIONS BAR (DURING SELECTION) ───────────────────── */}
      {selectedAssessmentIds.length > 0 && (
        <div
          style={{
            backgroundColor: '#EFF6FF',
            border: '1.5px solid #BFDBFE',
            borderRadius: '12px',
            padding: '12px 20px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 8px rgba(20, 85, 184, 0.08)',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              style={{
                backgroundColor: '#1455B8',
                color: '#FFFFFF',
                borderRadius: '6px',
                padding: '3px 9px',
                fontSize: '12px',
                fontWeight: 800,
              }}
            >
              {selectedAssessmentIds.length} Selected
            </span>
            <span style={{ fontSize: '13px', color: '#1E3A8A', fontWeight: 600 }}>
              Bulk operations for assessments. Rounds with existing candidate attempts will be safely archived.
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setSelectedAssessmentIds([])}
              style={{
                padding: '6px 12px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              Deselect All
            </button>
            <button
              onClick={handleBulkDeleteAssessments}
              disabled={bulkDeleting}
              style={{
                padding: '6px 14px',
                backgroundColor: '#DC2626',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: bulkDeleting ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>{bulkDeleting ? 'Deleting...' : `Delete / Archive Selected (${selectedAssessmentIds.length})`}</span>
            </button>
          </div>
        </div>
      )}

      {/* ─── ASSESSMENTS TABLE ──────────────────────────────────────── */}
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', overflowX: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748B', fontWeight: 600 }}>
            Loading assessments...
          </div>
        ) : assessments.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748B' }}>
            <div style={{ fontWeight: 700, fontSize: '16px', color: '#0B2E6F', marginBottom: '6px' }}>No assessments found</div>
            <p style={{ margin: 0, fontSize: '14px' }}>Click "Create New Assessment" to configure your first round.</p>
          </div>
        ) : (
          <table style={{ width: '100%', minWidth: '1100px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <th style={{ padding: '12px 16px', width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={assessments.length > 0 && selectedAssessmentIds.length === assessments.length}
                    ref={(el) => {
                      if (el) el.indeterminate = selectedAssessmentIds.length > 0 && selectedAssessmentIds.length < assessments.length;
                    }}
                    onChange={handleToggleSelectAllAssessments}
                    style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#1455B8' }}
                    title="Select / Deselect All Assessments"
                  />
                </th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', width: '120px' }}>CODE</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>ASSESSMENT TITLE</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', textAlign: 'center' }}>STATUS</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>DURATION & ALLOCATIONS</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', textAlign: 'center' }}>COLLEGES</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', textAlign: 'center' }}>ATTEMPTS</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>LIFECYCLE CONTROLS</th>
              </tr>
            </thead>
            <tbody>
              {assessments.map((a) => {
                const isSelected = selectedAssessmentIds.includes(a.id);
                return (
                <tr
                  key={a.id}
                  style={{
                    borderBottom: '1px solid #F1F5F9',
                    backgroundColor: isSelected ? '#F0F7FF' : 'transparent',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = '#F8FAFC';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelectAssessment(a.id)}
                      style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#1455B8' }}
                    />
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span
                      onClick={() => handleOpenDetail(a)}
                      title="Click to view assessment details"
                      style={{
                        backgroundColor: '#EEF2FF',
                        color: '#3730A3',
                        fontWeight: 700,
                        fontSize: '12px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        letterSpacing: '0.02em',
                        cursor: 'pointer',
                      }}
                    >
                      {a.code}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div
                      onClick={() => handleOpenDetail(a)}
                      title="Click to view assessment details and statistics"
                      style={{ fontWeight: 700, color: '#0F172A', cursor: 'pointer', transition: 'color 0.15s ease' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#1455B8')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '#0F172A')}
                    >
                      {a.title}
                    </div>
                    {a.description && (
                      <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.description}
                      </div>
                    )}
                    {a.delivery_mode === 'PDF_CODING' && (
                      <div style={{ marginTop: '4px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, backgroundColor: '#EDE9FE', color: '#6D28D9' }}>
                          📄 PDF Assessment Mode
                        </span>
                        {a.pdf_filename && (
                          <span style={{ marginLeft: '6px', fontSize: '11px', color: '#4B5563', fontFamily: 'monospace' }}>
                            {a.pdf_filename}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    {getStatusBadge(a.status, a.is_open)}
                  </td>
                  <td style={{ padding: '14px 16px', color: '#475569' }}>
                    <div><strong>{a.duration_minutes}</strong> mins • <strong>{a.total_marks}</strong> marks</div>
                    {a.delivery_mode === 'PDF_CODING' ? (
                      <div style={{ fontSize: '12px', color: '#7C3AED', fontWeight: 600, marginTop: '2px' }}>
                        Physical Paper Coding • On-Screen PDF
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                          {a.sections && a.sections.length > 0 ? (
                            a.sections.map((s) => `${s.question_count} ${s.section_name || s.section_code}`).join(' + ')
                          ) : (
                            `${a.aptitude_count} Aptitude + ${a.coding_count} Coding`
                          )}
                        </div>
                        <div style={{ fontSize: '11px', marginTop: '3px' }}>
                          <span
                            style={{
                              fontWeight: 700,
                              color: a.pool_sufficient ? '#16A34A' : '#DC2626',
                            }}
                          >
                            Pool: {a.pool_questions_count || 0} Qs ({a.pool_sufficient ? '✓ Sufficient' : '⚠ Insufficient'})
                          </span>
                        </div>
                      </>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleOpenDetail(a, 'colleges')}
                      title="Click to edit college assignments for this assessment"
                      style={{
                        backgroundColor: a.eligible_colleges_count > 0 ? '#F0F9FF' : '#FEF2F2',
                        color: a.eligible_colleges_count > 0 ? '#0369A1' : '#B91C1C',
                        border: '1px solid',
                        borderColor: a.eligible_colleges_count > 0 ? '#BAE6FD' : '#FECACA',
                        fontWeight: 700,
                        fontSize: '12px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span>{a.eligible_colleges_count} colleges</span>
                      <span style={{ fontSize: '11px', opacity: 0.8 }}>✎</span>
                    </button>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, color: '#0B2E6F' }}>{a.attempts_count}</div>
                    <div style={{ fontSize: '11px', color: '#64748B' }}>
                      {a.in_progress_count} active / {a.submitted_count} submitted
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                      {/* State transition triggers */}
                      {a.status === 'DRAFT' && (
                        <button
                          onClick={() => handlePrepare(a)}
                          title="Verify question bank sufficiency and mark READY"
                          style={{
                            backgroundColor: '#EFF6FF',
                            color: '#1D4ED8',
                            border: '1px solid #BFDBFE',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Verify & Ready
                        </button>
                      )}

                      {(a.status === 'READY' || a.status === 'SCHEDULED' || a.status === 'CLOSED') && (
                        <button
                          onClick={() => handleOpen(a)}
                          title="Open assessment for candidate attempts"
                          style={{
                            backgroundColor: '#DCFCE7',
                            color: '#15803D',
                            border: '1px solid #86EFAC',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Open Now
                        </button>
                      )}

                      {a.status === 'OPEN' && (
                        <button
                          onClick={() => handleOpenCloseModal(a)}
                          title="Close assessment and stop new attempts"
                          style={{
                            backgroundColor: '#FEE2E2',
                            color: '#B91C1C',
                            border: '1px solid #FCA5A5',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Close Assessment
                        </button>
                      )}

                      {a.status === 'CLOSED' && (
                        <button
                          onClick={() => handleArchive(a)}
                          title="Archive assessment"
                          style={{
                            backgroundColor: '#F1F5F9',
                            color: '#475569',
                            border: '1px solid #CBD5E1',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Archive
                        </button>
                      )}

                      <button
                        onClick={() => {
                          if (onNavigateToQuestions) {
                            onNavigateToQuestions(a.id);
                          }
                        }}
                        title="View and manage Question Pool for this assessment"
                        style={{
                          backgroundColor: '#EEF2FF',
                          color: '#4338CA',
                          border: '1px solid #C7D2FE',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Question Pool
                      </button>

                      <button
                        onClick={() => handleOpenEdit(a)}
                        title="Edit assessment parameters, duration, sections, and policies"
                        style={{
                          backgroundColor: '#FEF3C7',
                          color: '#92400E',
                          border: '1px solid #FDE68A',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => handleOpenDetail(a, 'colleges')}
                        title="Edit College Assignment"
                        style={{
                          backgroundColor: '#EFF6FF',
                          color: '#1D4ED8',
                          border: '1px solid #BFDBFE',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Colleges
                      </button>

                      <button
                        onClick={() => handleOpenDetail(a)}
                        title="Manage colleges, parameters, and audit trail"
                        style={{
                          backgroundColor: '#0B2E6F',
                          color: '#FFFFFF',
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Details
                      </button>

                      <button
                        onClick={() => handleDeleteAssessment(a)}
                        title="Permanently delete assessment"
                        style={{
                          backgroundColor: '#FFF1F2',
                          color: '#BE123C',
                          border: '1px solid #FDA4AF',
                          padding: '6px 10px',
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
        )}
      </div>

      {/* ─── CREATE ASSESSMENT MODAL ─────────────────────────────────── */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: '28px',
              width: '740px',
              maxWidth: '92vw',
              maxHeight: '92vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
                  Create New Assessment Round
                </h2>
                <span style={{ fontSize: '13px', color: '#64748B' }}>
                  Self-contained assessment with independent timing, dynamic section allocations, and institutional enrollment.
                </span>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94A3B8' }}
              >
                ✕
              </button>
            </div>

            {createError && (
              <div style={{ padding: '10px 14px', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }}>
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Assessment Code *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CSL-DIAG-02"
                    value={createForm.code}
                    onChange={(e) => setCreateForm({ ...createForm, code: e.target.value.toUpperCase() })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', boxSizing: 'border-box', textTransform: 'uppercase' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CSL Diagnostic Assessment — Phase 2"
                    value={createForm.title}
                    onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Candidate Instructions / Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Instructions presented to candidates before starting..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Duration (Minutes) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={createForm.duration_minutes}
                    onChange={(e) => setCreateForm({ ...createForm, duration_minutes: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Permitted Tab Switch Warnings
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={createForm.max_tab_switches_warning}
                    onChange={(e) => setCreateForm({ ...createForm, max_tab_switches_warning: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                  <span style={{ fontSize: '11px', color: '#64748B' }}>Default: 2 warnings (3rd switch auto-submits)</span>
                </div>
              </div>

              {/* ─── DYNAMIC SECTION ALLOCATION CARD ─── */}
              {true && (
              <div
                style={{
                  backgroundColor: '#F8FAFC',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  padding: '16px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
                      Assessment Sections & Question Allocation
                    </h3>
                    <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0 0' }}>
                      Configure sections, question counts, and marks per question.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setInlineSectionTarget('create');
                      setInlineSectionError('');
                      setShowInlineSectionModal(true);
                    }}
                    style={{
                      padding: '4px 10px',
                      backgroundColor: '#EEF2FF',
                      color: '#3730A3',
                      border: '1px solid #C7D2FE',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    + Define New Section
                  </button>
                </div>

                {/* Section selection list */}
                {createSections.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                    No sections added yet. Select a section from the dropdown below to allocate questions.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                    {createSections.map((sec, idx) => (
                      <div
                        key={sec.section_id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '2fr 1fr 1fr 1fr 36px',
                          gap: '10px',
                          alignItems: 'center',
                          backgroundColor: '#FFFFFF',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          border: '1px solid #E2E8F0',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '13px', color: '#0F172A' }}>{sec.name}</div>
                          <span style={{ fontSize: '11px', color: '#3730A3', fontWeight: 600 }}>{sec.code}</span>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Questions</label>
                          <input
                            type="number"
                            min={1}
                            value={sec.question_count}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                              setCreateSections((prev) =>
                                prev.map((s, i) => (i === idx ? { ...s, question_count: val } : s))
                              );
                            }}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Marks/Q</label>
                          <input
                            type="number"
                            min={1}
                            value={sec.marks_per_question}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                              setCreateSections((prev) =>
                                prev.map((s, i) => (i === idx ? { ...s, marks_per_question: val } : s))
                              );
                            }}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                          />
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '11px', color: '#64748B', display: 'block' }}>Subtotal</span>
                          <strong style={{ fontSize: '13px', color: '#0B2E6F' }}>
                            {sec.question_count * sec.marks_per_question} marks
                          </strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCreateSections((prev) => prev.filter((_, i) => i !== idx))}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#EF4444',
                            fontSize: '16px',
                            cursor: 'pointer',
                            padding: '4px',
                          }}
                          title="Remove section from this assessment"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add another section dropdown */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <select
                    onChange={(e) => {
                      const selectedId = parseInt(e.target.value, 10);
                      if (!selectedId) return;
                      const match = availableSections.find((s) => s.id === selectedId);
                      if (match && !createSections.some((s) => s.section_id === match.id)) {
                        setCreateSections((prev) => [
                          ...prev,
                          {
                            section_id: match.id,
                            name: match.name,
                            code: match.code,
                            question_count: 10,
                            marks_per_question: 1,
                          },
                        ]);
                      }
                      e.target.value = '';
                    }}
                    defaultValue=""
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      backgroundColor: '#FFFFFF',
                      flex: 1,
                    }}
                  >
                    <option value="">+ Add Section from Library...</option>
                    {availableSections
                      .filter((s) => !createSections.some((cs) => cs.section_id === s.id))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code}) — {s.question_count ?? 0} Qs in bank
                        </option>
                      ))}
                  </select>
                </div>

                {/* Summary calculation pill */}
                <div
                  style={{
                    marginTop: '12px',
                    padding: '8px 12px',
                    backgroundColor: '#EFF6FF',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#1E40AF',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>
                    Total Questions: <strong>{createSections.reduce((acc, s) => acc + Number(s.question_count || 0), 0)}</strong>
                  </span>
                  <span>
                    Computed Total Marks: <strong>{createSections.reduce((acc, s) => acc + Number(s.question_count || 0) * Number(s.marks_per_question || 1), 0)}</strong>
                  </span>
                </div>
              </div>
              )}

              {/* Close Policy */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Close Policy
                </label>
                <select
                  value={createForm.close_policy}
                  onChange={(e) => setCreateForm({ ...createForm, close_policy: e.target.value as any })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', boxSizing: 'border-box' }}
                >
                  <option value="ALLOW_FINISH">Allow in-progress attempts to finish</option>
                  <option value="STRICT_CUTOFF">Strict cutoff (terminate active attempts immediately)</option>
                </select>
              </div>

              {/* Eligible Colleges Selection */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Assign Participating Colleges ({createForm.eligible_college_ids.length} selected)
                </label>
                <div style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '10px', maxHeight: '140px', overflowY: 'auto', backgroundColor: '#F8FAFC' }}>
                  {colleges.map((c) => {
                    const isChecked = createForm.eligible_college_ids.includes(c.id);
                    return (
                      <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '13px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setCreateForm({ ...createForm, eligible_college_ids: [...createForm.eligible_college_ids, c.id] });
                            } else {
                              setCreateForm({
                                ...createForm,
                                eligible_college_ids: createForm.eligible_college_ids.filter((id) => id !== c.id),
                              });
                            }
                          }}
                        />
                        <strong>[{c.code}]</strong> {c.name}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ backgroundColor: '#F1F5F9', color: '#475569', border: 'none', borderRadius: '6px', padding: '10px 16px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  style={{ backgroundColor: '#0B2E6F', color: '#FFFFFF', border: 'none', borderRadius: '6px', padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}
                >
                  {createSubmitting ? 'Creating Assessment...' : 'Create Assessment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── EDIT ASSESSMENT MODAL ───────────────────────────────────── */}
      {showEditModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: '28px',
              width: '740px',
              maxWidth: '92vw',
              maxHeight: '92vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
                  Edit Assessment: {editForm.title}
                </h2>
                <span style={{ fontSize: '13px', color: '#64748B' }}>
                  Configure independent timing, marks, dynamic section question counts, and proctoring constraints.
                </span>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94A3B8' }}
              >
                ✕
              </button>
            </div>

            {editError && (
              <div style={{ padding: '10px 14px', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }}>
                {editError}
              </div>
            )}

            <form onSubmit={handleEditSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Assessment Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.code}
                    onChange={(e) => setEditForm({ ...editForm, code: e.target.value.toUpperCase() })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', boxSizing: 'border-box', textTransform: 'uppercase' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Candidate Instructions / Description
                </label>
                <textarea
                  rows={2}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Duration (Minutes) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={editForm.duration_minutes}
                    onChange={(e) => setEditForm({ ...editForm, duration_minutes: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                  <span style={{ fontSize: '11px', color: '#64748B' }}>Timer for each candidate</span>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Permitted Tab Switch Warnings
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editForm.max_tab_switches_warning}
                    onChange={(e) => setEditForm({ ...editForm, max_tab_switches_warning: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* ─── DYNAMIC SECTION ALLOCATION CARD (EDIT) ─── */}
              {true && (
              <div
                style={{
                  backgroundColor: '#F8FAFC',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  padding: '16px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
                      Assessment Sections & Question Allocation
                    </h3>
                    <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0 0' }}>
                      Configure sections and question allocations for this assessment round.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setInlineSectionTarget('edit');
                      setInlineSectionError('');
                      setShowInlineSectionModal(true);
                    }}
                    style={{
                      padding: '4px 10px',
                      backgroundColor: '#EEF2FF',
                      color: '#3730A3',
                      border: '1px solid #C7D2FE',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    + Define New Section
                  </button>
                </div>

                {editSections.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                    No sections configured yet. Use the dropdown below to allocate questions.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                    {editSections.map((sec, idx) => (
                      <div
                        key={sec.section_id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '2fr 1fr 1fr 1fr 36px',
                          gap: '10px',
                          alignItems: 'center',
                          backgroundColor: '#FFFFFF',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          border: '1px solid #E2E8F0',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '13px', color: '#0F172A' }}>{sec.name}</div>
                          <span style={{ fontSize: '11px', color: '#3730A3', fontWeight: 600 }}>{sec.code}</span>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Questions</label>
                          <input
                            type="number"
                            min={1}
                            value={sec.question_count}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                              setEditSections((prev) =>
                                prev.map((s, i) => (i === idx ? { ...s, question_count: val } : s))
                              );
                            }}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Marks/Q</label>
                          <input
                            type="number"
                            min={1}
                            value={sec.marks_per_question}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                              setEditSections((prev) =>
                                prev.map((s, i) => (i === idx ? { ...s, marks_per_question: val } : s))
                              );
                            }}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                          />
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '11px', color: '#64748B', display: 'block' }}>Subtotal</span>
                          <strong style={{ fontSize: '13px', color: '#0B2E6F' }}>
                            {sec.question_count * sec.marks_per_question} marks
                          </strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditSections((prev) => prev.filter((_, i) => i !== idx))}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#EF4444',
                            fontSize: '16px',
                            cursor: 'pointer',
                            padding: '4px',
                          }}
                          title="Remove section association"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <select
                    onChange={(e) => {
                      const selectedId = parseInt(e.target.value, 10);
                      if (!selectedId) return;
                      const match = availableSections.find((s) => s.id === selectedId);
                      if (match && !editSections.some((s) => s.section_id === match.id)) {
                        setEditSections((prev) => [
                          ...prev,
                          {
                            section_id: match.id,
                            name: match.name,
                            code: match.code,
                            question_count: 10,
                            marks_per_question: 1,
                          },
                        ]);
                      }
                      e.target.value = '';
                    }}
                    defaultValue=""
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      backgroundColor: '#FFFFFF',
                      flex: 1,
                    }}
                  >
                    <option value="">+ Add Section from Library...</option>
                    {availableSections
                      .filter((s) => !editSections.some((es) => es.section_id === s.id))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code}) — {s.question_count ?? 0} Qs in bank
                        </option>
                      ))}
                  </select>
                </div>

                <div
                  style={{
                    marginTop: '12px',
                    padding: '8px 12px',
                    backgroundColor: '#EFF6FF',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#1E40AF',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>
                    Total Questions: <strong>{editSections.reduce((acc, s) => acc + Number(s.question_count || 0), 0)}</strong>
                  </span>
                  <span>
                    Computed Total Marks: <strong>{editSections.reduce((acc, s) => acc + Number(s.question_count || 0) * Number(s.marks_per_question || 1), 0)}</strong>
                  </span>
                </div>
              </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Close Cutoff Policy
                  </label>
                  <select
                    value={editForm.close_policy}
                    onChange={(e) => setEditForm({ ...editForm, close_policy: e.target.value as any })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', boxSizing: 'border-box' }}
                  >
                    <option value="ALLOW_FINISH">Allow in-progress attempts to finish</option>
                    <option value="STRICT_CUTOFF">Strict cutoff (terminate active attempts immediately)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  style={{ backgroundColor: '#F1F5F9', color: '#475569', border: 'none', borderRadius: '6px', padding: '10px 16px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  style={{ backgroundColor: '#0B2E6F', color: '#FFFFFF', border: 'none', borderRadius: '6px', padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}
                >
                  {editSubmitting ? 'Saving Changes...' : 'Save Assessment Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── INLINE CREATE SECTION MODAL ──────────────────────────────── */}
      {showInlineSectionModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: '24px',
              width: '440px',
              maxWidth: '90vw',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
                Define New Reusable Section
              </h3>
              <button
                type="button"
                onClick={() => setShowInlineSectionModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94A3B8' }}
              >
                ✕
              </button>
            </div>

            {inlineSectionError && (
              <div style={{ padding: '8px 12px', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: '6px', fontSize: '12px', marginBottom: '12px' }}>
                {inlineSectionError}
              </div>
            )}

            <form onSubmit={handleInlineSectionSubmit}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Section Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Verbal Ability, System Architecture"
                  value={inlineSectionForm.name}
                  onChange={(e) => setInlineSectionForm({ ...inlineSectionForm, name: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Unique Section Code * (Uppercase)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. VERBAL, ARCHITECTURE"
                  value={inlineSectionForm.code}
                  onChange={(e) => setInlineSectionForm({ ...inlineSectionForm, code: e.target.value.toUpperCase() })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box', textTransform: 'uppercase' }}
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Topics covered..."
                  value={inlineSectionForm.description}
                  onChange={(e) => setInlineSectionForm({ ...inlineSectionForm, description: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowInlineSectionModal(false)}
                  style={{ backgroundColor: '#F1F5F9', color: '#475569', border: 'none', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inlineSectionSaving}
                  style={{ backgroundColor: '#0B2E6F', color: '#FFFFFF', border: 'none', borderRadius: '6px', padding: '8px 16px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                >
                  {inlineSectionSaving ? 'Saving...' : 'Save & Allocate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── CLOSE ASSESSMENT CONFIRMATION MODAL ─────────────────────── */}
      {showCloseModal && selectedAssessment && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: '24px 28px',
              width: '480px',
              maxWidth: '90vw',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#B91C1C', margin: '0 0 10px' }}>
              Close Assessment: {selectedAssessment.title}
            </h2>
            <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 16px', lineHeight: 1.5 }}>
              Closing this assessment will immediately prevent candidates from beginning new attempts.
              Please select the cutoff policy for candidates currently taking this assessment:
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', padding: '10px', borderRadius: '6px', border: '1px solid #CBD5E1', marginBottom: '8px', cursor: 'pointer', backgroundColor: closePolicy === 'ALLOW_FINISH' ? '#F0F9FF' : '#FFFFFF' }}>
                <input
                  type="radio"
                  name="closePolicy"
                  value="ALLOW_FINISH"
                  checked={closePolicy === 'ALLOW_FINISH'}
                  onChange={() => setClosePolicy('ALLOW_FINISH')}
                  style={{ marginRight: '8px' }}
                />
                <strong>Allow Finish:</strong> Let candidates with active in-progress attempts complete until their deadline.
              </label>

              <label style={{ display: 'block', padding: '10px', borderRadius: '6px', border: '1px solid #CBD5E1', cursor: 'pointer', backgroundColor: closePolicy === 'STRICT_CUTOFF' ? '#FEF2F2' : '#FFFFFF' }}>
                <input
                  type="radio"
                  name="closePolicy"
                  value="STRICT_CUTOFF"
                  checked={closePolicy === 'STRICT_CUTOFF'}
                  onChange={() => setClosePolicy('STRICT_CUTOFF')}
                  style={{ marginRight: '8px' }}
                />
                <strong>Strict Cutoff:</strong> Immediately terminate and score all active attempts right now.
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                style={{ backgroundColor: '#F1F5F9', color: '#475569', border: 'none', borderRadius: '6px', padding: '8px 16px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={closing}
                onClick={handleConfirmClose}
                style={{ backgroundColor: '#B91C1C', color: '#FFFFFF', border: 'none', borderRadius: '6px', padding: '8px 18px', fontWeight: 700, cursor: 'pointer' }}
              >
                {closing ? 'Closing...' : 'Confirm Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── ASSESSMENT DETAIL & AUDIT MODAL ─────────────────────────── */}
      {showDetailModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseDetail();
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: '28px',
              width: '840px',
              maxWidth: '94vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
                    {assessmentDetail?.title || selectedAssessment?.title || (detailError ? 'Assessment Details Error' : 'Loading Assessment...')}
                  </h2>
                  {(selectedAssessment?.code || assessmentDetail?.code) && (
                    <span style={{ backgroundColor: '#EEF2FF', color: '#3730A3', fontWeight: 700, fontSize: '12px', padding: '2px 8px', borderRadius: '4px' }}>
                      {assessmentDetail?.code || selectedAssessment?.code}
                    </span>
                  )}
                  {(selectedAssessment || assessmentDetail) &&
                    getStatusBadge(
                      (assessmentDetail?.status || selectedAssessment?.status) || 'DRAFT',
                      Boolean(assessmentDetail?.is_open ?? selectedAssessment?.is_open)
                    )}
                </div>
                {(selectedAssessment || assessmentDetail) && (
                  <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
                    {assessmentDetail?.duration_minutes ?? selectedAssessment?.duration_minutes ?? 60} Minutes •{' '}
                    {assessmentDetail?.total_marks ?? selectedAssessment?.total_marks ?? 50} Marks
                    {((assessmentDetail?.sections && assessmentDetail.sections.length > 0) ||
                      (selectedAssessment?.sections && selectedAssessment.sections.length > 0)) && (
                      <span>
                        {' '}
                        (
                        {(assessmentDetail?.sections || selectedAssessment?.sections || []).map(
                          (s) => `${s.question_count || 0} ${s.section_name || s.section_code || 'Section'}`
                        ).join(' + ')}
                        )
                      </span>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={handleCloseDetail}
                style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#94A3B8' }}
                title="Close Assessment Details"
              >
                ✕
              </button>
            </div>

            {/* TAB SELECTOR */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E2E8F0', marginBottom: '20px' }}>
              <button
                onClick={() => setDetailTab('overview')}
                style={{
                  padding: '8px 16px',
                  fontWeight: 700,
                  fontSize: '13px',
                  border: 'none',
                  borderBottom: detailTab === 'overview' ? '2px solid #0B2E6F' : '2px solid transparent',
                  color: detailTab === 'overview' ? '#0B2E6F' : '#64748B',
                  background: 'none',
                  cursor: 'pointer',
                }}
              >
                Overview & Sessions
              </button>
              <button
                onClick={() => setDetailTab('colleges')}
                style={{
                  padding: '8px 16px',
                  fontWeight: 700,
                  fontSize: '13px',
                  border: 'none',
                  borderBottom: detailTab === 'colleges' ? '2px solid #0B2E6F' : '2px solid transparent',
                  color: detailTab === 'colleges' ? '#0B2E6F' : '#64748B',
                  background: 'none',
                  cursor: 'pointer',
                }}
              >
                Assigned Colleges ({selectedCollegeIdsForAssign.length})
              </button>
              <button
                onClick={() => {
                  setDetailTab('candidates');
                  if (assessmentDetail) fetchCandidatesForAssessment(assessmentDetail.id);
                }}
                style={{
                  padding: '8px 16px',
                  fontWeight: 700,
                  fontSize: '13px',
                  border: 'none',
                  borderBottom: detailTab === 'candidates' ? '2px solid #0B2E6F' : '2px solid transparent',
                  color: detailTab === 'candidates' ? '#0B2E6F' : '#64748B',
                  background: 'none',
                  cursor: 'pointer',
                }}
              >
                Direct Candidates ({selectedCandidateIdsForAssign.length})
              </button>
              <button
                onClick={() => setDetailTab('audit')}
                style={{
                  padding: '8px 16px',
                  fontWeight: 700,
                  fontSize: '13px',
                  border: 'none',
                  borderBottom: detailTab === 'audit' ? '2px solid #0B2E6F' : '2px solid transparent',
                  color: detailTab === 'audit' ? '#0B2E6F' : '#64748B',
                  background: 'none',
                  cursor: 'pointer',
                }}
              >
                Audit Trail ({assessmentDetail?.audit_logs?.length || 0})
              </button>
            </div>

            {loadingDetail ? (
              <div style={{ padding: '48px', textAlign: 'center', color: '#64748B' }}>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>Loading assessment configuration...</div>
              </div>
            ) : detailError ? (
              <div
                style={{
                  padding: '24px',
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: '8px',
                  color: '#991B1B',
                  marginBottom: '20px',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '6px' }}>
                  Unable to Load Assessment Details
                </div>
                <p style={{ margin: '0 0 16px 0', fontSize: '13px', lineHeight: 1.5 }}>
                  {detailError}
                </p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => {
                      const id = selectedAssessment?.id || initialAssessmentId;
                      if (id) handleOpenDetail(id);
                      else handleCloseDetail();
                    }}
                    style={{
                      padding: '7px 16px',
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
                  <button
                    onClick={handleCloseDetail}
                    style={{
                      padding: '7px 14px',
                      backgroundColor: '#FFFFFF',
                      color: '#475569',
                      border: '1px solid #CBD5E1',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Close / Back to Assessments
                  </button>
                </div>
              </div>
            ) : assessmentDetail ? (
              <div>
                {/* 1. OVERVIEW TAB */}
                {detailTab === 'overview' && (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                      <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Total Attempts</div>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: '#0B2E6F', marginTop: '4px' }}>{assessmentDetail.attempts_count ?? 0}</div>
                      </div>
                      <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '11px', color: '#16A34A', fontWeight: 700, textTransform: 'uppercase' }}>In Progress</div>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: '#16A34A', marginTop: '4px' }}>{assessmentDetail.in_progress_count ?? 0}</div>
                      </div>
                      <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '11px', color: '#2563EB', fontWeight: 700, textTransform: 'uppercase' }}>Submitted</div>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: '#2563EB', marginTop: '4px' }}>{assessmentDetail.submitted_count ?? 0}</div>
                      </div>
                    </div>

                    <div style={{ backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '16px', fontSize: '13px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ fontWeight: 700, color: '#334155' }}>Proctoring & Rules Configuration</div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {onNavigateToQuestions && (
                            <button
                              type="button"
                              onClick={() => {
                                handleCloseDetail();
                                onNavigateToQuestions(assessmentDetail.id);
                              }}
                              style={{
                                backgroundColor: '#EEF2FF',
                                color: '#4338CA',
                                border: '1px solid #C7D2FE',
                                padding: '4px 10px',
                                borderRadius: '5px',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Manage Question Pool ({assessmentDetail.pool_questions_count ?? 0})
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDetailTab('colleges')}
                            style={{
                              backgroundColor: '#EFF6FF',
                              color: '#1D4ED8',
                              border: '1px solid #BFDBFE',
                              padding: '4px 10px',
                              borderRadius: '5px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            🏛 Edit College Assignment ({assessmentDetail.eligible_colleges_count ?? 0})
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowDetailModal(false);
                              handleOpenEdit(assessmentDetail);
                            }}
                            style={{
                              backgroundColor: '#FEF3C7',
                              color: '#92400E',
                              border: '1px solid #FDE68A',
                              padding: '4px 10px',
                              borderRadius: '5px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            ✎ Edit Assessment Parameters
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>Duration: <strong>{assessmentDetail.duration_minutes ?? 60} Minutes</strong></div>
                        <div>Total Marks: <strong>{assessmentDetail.total_marks ?? 50} Marks</strong></div>
                        <div>Max Tab Warnings: <strong>{assessmentDetail.max_tab_switches_warning ?? 2}</strong> (Auto-submit: {assessmentDetail.auto_submit_on_tab_limit ? 'Yes' : 'No'})</div>
                        <div>Max Attempts per Student: <strong>{assessmentDetail.max_attempts ?? 1}</strong></div>
                        <div>Close Policy: <strong>{assessmentDetail.close_policy || 'ALLOW_FINISH'}</strong></div>
                        <div>Opened: <strong>{assessmentDetail.opened_at ? new Date(assessmentDetail.opened_at).toLocaleString() : 'Not opened yet'}</strong></div>
                        {assessmentDetail.closed_at && (
                          <div>Closed: <strong>{new Date(assessmentDetail.closed_at).toLocaleString()}</strong></div>
                        )}
                        {assessmentDetail.delivery_mode === 'PDF_CODING' ? (
                          <>
                            <div>
                              Delivery Format: <strong style={{ color: '#7C3AED' }}>📄 PDF Assessment Mode</strong>
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                              Question Paper:{' '}
                              {assessmentDetail.pdf_filename ? (
                                <span style={{ color: '#059669', fontWeight: 700 }}>
                                  {assessmentDetail.pdf_filename} ({((assessmentDetail.pdf_file_size || 0) / 1024).toFixed(1)} KB)
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadPdf(assessmentDetail.id, assessmentDetail.pdf_filename || undefined)}
                                    disabled={downloadingPdf}
                                    style={{
                                      marginLeft: '10px',
                                      padding: '3px 10px',
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      backgroundColor: '#EDE9FE',
                                      color: '#6D28D9',
                                      border: '1px solid #DDD6FE',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    {downloadingPdf ? 'Downloading...' : '⬇ Download / Preview PDF'}
                                  </button>
                                </span>
                              ) : (
                                <strong style={{ color: '#DC2626' }}>⚠ Missing Question Paper PDF</strong>
                              )}
                            </div>
                          </>
                        ) : (
                          <div>
                            Question Pool Status:{' '}
                            <strong style={{ color: assessmentDetail.pool_sufficient ? '#16A34A' : '#DC2626' }}>
                              {assessmentDetail.pool_sufficient ? '✓ Sufficient' : '⚠ Insufficient Pool'}
                            </strong>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Eligible Institutions Overview Card */}
                    <div style={{ backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '16px', fontSize: '13px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                        <div style={{ fontWeight: 700, color: '#334155' }}>
                          Eligible Institutions ({Array.isArray(assessmentDetail.eligible_colleges) ? assessmentDetail.eligible_colleges.length : (assessmentDetail.eligible_colleges_count || 0)})
                        </div>
                        <button
                          type="button"
                          onClick={() => setDetailTab('colleges')}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#1D4ED8',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          Edit College Assignments →
                        </button>
                      </div>
                      {Array.isArray(assessmentDetail.eligible_colleges) && assessmentDetail.eligible_colleges.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {assessmentDetail.eligible_colleges.map((col) => (
                            <span
                              key={col.id}
                              style={{
                                backgroundColor: '#EFF6FF',
                                color: '#1E40AF',
                                border: '1px solid #DBEAFE',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: 600,
                              }}
                            >
                              <strong>{col.code}</strong> - {col.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div style={{ color: '#DC2626', fontWeight: 600, fontSize: '12px' }}>
                          ⚠ No colleges currently assigned. Candidates from unassigned institutions will not be eligible to register.
                        </div>
                      )}
                    </div>

                    {/* Section Questions & Question Pool Management (Phase 2.1) */}
                    <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '16px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
                            Curriculum Sections & Assessment Question Pool
                          </h4>
                          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                            Inspect actual assigned questions, preview items, replace questions, or assign more from the independent Question Bank.
                          </div>
                        </div>
                      </div>

                      {Array.isArray(assessmentDetail.sections) && assessmentDetail.sections.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {assessmentDetail.sections.map((s, idx) => {
                            const isExpanded = expandedSectionId === s.section_id;
                            const questionsInSec = sectionQuestions[s.section_id] || [];
                            const isLoadingSec = loadingSectionQuestions[s.section_id] || false;
                            const assignedCount = s.available_questions_count !== undefined ? s.available_questions_count : questionsInSec.length;
                            const isSufficient = assignedCount >= s.question_count;

                            return (
                              <div
                                key={s.id || idx}
                                style={{
                                  border: isExpanded ? '1.5px solid #1455B8' : '1px solid #CBD5E1',
                                  borderRadius: '8px',
                                  overflow: 'hidden',
                                  backgroundColor: '#FFFFFF',
                                  boxShadow: isExpanded ? '0 2px 8px rgba(20, 85, 184, 0.08)' : 'none',
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '12px 16px',
                                    backgroundColor: isExpanded ? '#F0F7FF' : '#F8FAFC',
                                    flexWrap: 'wrap',
                                    gap: '10px',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ backgroundColor: '#EEF2FF', color: '#3730A3', fontWeight: 800, fontSize: '12px', padding: '3px 8px', borderRadius: '4px' }}>
                                      {s.section_code}
                                    </span>
                                    <span style={{ fontWeight: 700, fontSize: '14px', color: '#0F172A' }}>
                                      {s.section_name}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        backgroundColor: isSufficient ? '#DCFCE7' : '#FEF3C7',
                                        color: isSufficient ? '#166534' : '#92400E',
                                        border: `1px solid ${isSufficient ? '#BBF7D0' : '#FDE68A'}`,
                                      }}
                                    >
                                      {isSufficient ? `✓ Pool Sufficient (${assignedCount}/${s.question_count})` : `⚠ Shortage (${assignedCount}/${s.question_count} assigned)`}
                                    </span>
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '12px', color: '#64748B', marginRight: '6px' }}>
                                      Allocated: <strong>{s.question_count} Qs</strong> ({s.marks_per_question} m/Q = {s.question_count * s.marks_per_question} marks)
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenAddQuestions(s)}
                                      style={{
                                        padding: '5px 10px',
                                        backgroundColor: '#FFFFFF',
                                        border: '1px solid #CBD5E1',
                                        borderRadius: '6px',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        color: '#0B2E6F',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      + Add from Bank
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleExpandSection(s)}
                                      style={{
                                        padding: '5px 12px',
                                        backgroundColor: isExpanded ? '#1455B8' : '#FFFFFF',
                                        color: isExpanded ? '#FFFFFF' : '#1455B8',
                                        border: '1px solid #1455B8',
                                        borderRadius: '6px',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      {isExpanded ? '▲ Hide Questions' : `▼ View Questions (${assignedCount})`}
                                    </button>
                                  </div>
                                </div>

                                {isExpanded && (
                                  <div style={{ padding: '16px', borderTop: '1px solid #E2E8F0', backgroundColor: '#FFFFFF' }}>
                                    {isLoadingSec ? (
                                      <div style={{ textAlign: 'center', padding: '24px', color: '#64748B', fontSize: '13px' }}>
                                        Loading questions for {s.section_name}...
                                      </div>
                                    ) : questionsInSec.length === 0 ? (
                                      <div style={{ textAlign: 'center', padding: '24px', color: '#94A3B8', fontSize: '13px' }}>
                                        No questions currently assigned to this section pool. Click <strong>"+ Add from Bank"</strong> above to assign questions.
                                      </div>
                                    ) : (
                                      <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                          <thead>
                                            <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                                              <th style={{ padding: '8px 12px', width: '60px', color: '#64748B', fontWeight: 700 }}>ID</th>
                                              <th style={{ padding: '8px 12px', color: '#64748B', fontWeight: 700 }}>QUESTION PROMPT</th>
                                              <th style={{ padding: '8px 12px', width: '90px', color: '#64748B', fontWeight: 700 }}>DIFFICULTY</th>
                                              <th style={{ padding: '8px 12px', width: '70px', color: '#64748B', fontWeight: 700, textAlign: 'center' }}>MARKS</th>
                                              <th style={{ padding: '8px 12px', width: '80px', color: '#64748B', fontWeight: 700, textAlign: 'center' }}>STATUS</th>
                                              <th style={{ padding: '8px 12px', width: '180px', color: '#64748B', fontWeight: 700, textAlign: 'right' }}>ACTIONS</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {questionsInSec.map((q) => (
                                              <tr key={q.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#64748B', fontWeight: 600 }}>
                                                  #{q.id}
                                                </td>
                                                <td style={{ padding: '10px 12px' }}>
                                                  <div style={{ color: '#0F172A', fontWeight: 600, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                    {q.prompt}
                                                  </div>
                                                  {q.category && (
                                                    <span style={{ fontSize: '11px', color: '#64748B', marginTop: '2px', display: 'inline-block' }}>
                                                      Category: {q.category}
                                                    </span>
                                                  )}
                                                </td>
                                                <td style={{ padding: '10px 12px' }}>
                                                  <span
                                                    style={{
                                                      display: 'inline-block',
                                                      padding: '2px 8px',
                                                      borderRadius: '4px',
                                                      fontSize: '11px',
                                                      fontWeight: 700,
                                                      backgroundColor: q.difficulty === 'EASY' ? '#DCFCE7' : q.difficulty === 'MEDIUM' ? '#FEF3C7' : '#FEE2E2',
                                                      color: q.difficulty === 'EASY' ? '#166534' : q.difficulty === 'MEDIUM' ? '#92400E' : '#991B1B',
                                                    }}
                                                  >
                                                    {q.difficulty}
                                                  </span>
                                                </td>
                                                <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#0B2E6F' }}>
                                                  {q.marks || 1}
                                                </td>
                                                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                  <span
                                                    style={{
                                                      fontSize: '11px',
                                                      fontWeight: 600,
                                                      color: q.is_archived ? '#94A3B8' : q.is_active ? '#16A34A' : '#DC2626',
                                                    }}
                                                  >
                                                    {q.is_archived ? 'Archived' : q.is_active ? 'Active' : 'Inactive'}
                                                  </span>
                                                </td>
                                                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                                    <button
                                                      type="button"
                                                      onClick={() => setPreviewQuestion(q)}
                                                      title="Preview full question prompt, options, and explanation"
                                                      style={{
                                                        padding: '4px 8px',
                                                        backgroundColor: '#F8FAFC',
                                                        border: '1px solid #CBD5E1',
                                                        borderRadius: '4px',
                                                        fontSize: '11.5px',
                                                        fontWeight: 600,
                                                        color: '#0B2E6F',
                                                        cursor: 'pointer',
                                                      }}
                                                    >
                                                      Preview
                                                    </button>
                                                    <button
                                                      type="button"
                                                      onClick={() => handleOpenReplaceQuestion(s, q)}
                                                      title="Replace this question with another item from the Question Bank"
                                                      style={{
                                                        padding: '4px 8px',
                                                        backgroundColor: '#EFF6FF',
                                                        border: '1px solid #BFDBFE',
                                                        borderRadius: '4px',
                                                        fontSize: '11.5px',
                                                        fontWeight: 600,
                                                        color: '#1D4ED8',
                                                        cursor: 'pointer',
                                                      }}
                                                    >
                                                      Replace
                                                    </button>
                                                    <button
                                                      type="button"
                                                      onClick={() => handleRemoveQuestionFromSection(s, q.id)}
                                                      title="Remove question from this assessment pool (retains in Question Bank)"
                                                      style={{
                                                        padding: '4px 8px',
                                                        backgroundColor: '#FFF1F2',
                                                        border: '1px solid #FECDD3',
                                                        borderRadius: '4px',
                                                        fontSize: '11.5px',
                                                        fontWeight: 600,
                                                        color: '#BE123C',
                                                        cursor: 'pointer',
                                                      }}
                                                    >
                                                      Remove
                                                    </button>
                                                  </div>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ padding: '12px 14px', borderRadius: '8px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: '13px', color: '#475569' }}>
                          <strong>Legacy Allocation:</strong> {assessmentDetail.aptitude_count ?? 25} Aptitude + {assessmentDetail.coding_count ?? 25} Coding Questions
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. ASSIGNED COLLEGES TAB */}
                {detailTab === 'colleges' && (() => {
                  const isArchived = assessmentDetail.status === 'ARCHIVED';
                  const isOpenState = assessmentDetail.status === 'OPEN';
                  const currentlySavedIds = Array.isArray(assessmentDetail.eligible_colleges)
                    ? assessmentDetail.eligible_colleges.map((c) => c.id)
                    : [];

                  const filteredColleges = Array.isArray(colleges)
                    ? colleges.filter((c) => {
                        if (!collegeSearchQuery.trim()) return true;
                        const query = collegeSearchQuery.trim().toLowerCase();
                        return c.name.toLowerCase().includes(query) || c.code.toLowerCase().includes(query);
                      })
                    : [];

                  const assignedCount = selectedCollegeIdsForAssign.length;
                  const totalCount = Array.isArray(colleges) ? colleges.length : 0;

                  return (
                    <div>
                      {/* Lifecycle Alert Banners */}
                      {isArchived && (
                        <div
                          style={{
                            padding: '10px 14px',
                            backgroundColor: '#FEF2F2',
                            color: '#991B1B',
                            borderRadius: '8px',
                            border: '1px solid #FCA5A5',
                            marginBottom: '14px',
                            fontSize: '13px',
                            fontWeight: 500,
                          }}
                        >
                          <strong>Archived Assessment:</strong> College assignments cannot be modified while an assessment is archived. Please unarchive it first to adjust institutional eligibility.
                        </div>
                      )}

                      {isOpenState && (
                        <div
                          style={{
                            padding: '10px 14px',
                            backgroundColor: '#EFF6FF',
                            color: '#1E40AF',
                            borderRadius: '8px',
                            border: '1px solid #BFDBFE',
                            marginBottom: '14px',
                            fontSize: '13px',
                            fontWeight: 500,
                          }}
                        >
                          <strong>Active Assessment:</strong> This assessment is currently OPEN. Newly added colleges will be able to register candidates immediately. Removed colleges will be prevented from registering, while existing candidates, attempts, and submitted answers are safely preserved.
                        </div>
                      )}

                      {collegeAssignError && (
                        <div
                          style={{
                            padding: '10px 14px',
                            backgroundColor: '#FEF2F2',
                            color: '#991B1B',
                            borderRadius: '8px',
                            border: '1px solid #FCA5A5',
                            marginBottom: '14px',
                            fontSize: '13px',
                          }}
                        >
                          <strong>Error updating assignments:</strong> {collegeAssignError}
                        </div>
                      )}

                      {/* Header and Summary Statistics */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '12px',
                          marginBottom: '12px',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '13px', color: '#475569' }}>
                            Select participating institutions eligible to register candidates for <strong>{assessmentDetail.title}</strong>.
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                            Currently Enrolled: <strong>{currentlySavedIds.length}</strong> | Selected for Assignment: <strong>{assignedCount}</strong> | Total Available: <strong>{totalCount}</strong>
                          </div>
                        </div>

                        {!isArchived && (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => {
                                const allIds = filteredColleges.map((c) => c.id);
                                setSelectedCollegeIdsForAssign(Array.from(new Set([...selectedCollegeIdsForAssign, ...allIds])));
                              }}
                              style={{
                                padding: '5px 10px',
                                backgroundColor: '#F1F5F9',
                                color: '#0B2E6F',
                                border: '1px solid #CBD5E1',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Select All
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedCollegeIdsForAssign([])}
                              style={{
                                padding: '5px 10px',
                                backgroundColor: '#F1F5F9',
                                color: '#475569',
                                border: '1px solid #CBD5E1',
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
                              onClick={() => setSelectedCollegeIdsForAssign(currentlySavedIds)}
                              style={{
                                padding: '5px 10px',
                                backgroundColor: '#F1F5F9',
                                color: '#475569',
                                border: '1px solid #CBD5E1',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Reset to Saved
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Search Filter Input */}
                      <div style={{ marginBottom: '12px' }}>
                        <input
                          type="text"
                          placeholder="Search institutions by name or code..."
                          value={collegeSearchQuery}
                          onChange={(e) => setCollegeSearchQuery(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            border: '1px solid #CBD5E1',
                            borderRadius: '6px',
                            fontSize: '13px',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>

                      {/* College Checkbox List */}
                      <div
                        style={{
                          border: '1px solid #E2E8F0',
                          borderRadius: '8px',
                          padding: '10px 14px',
                          maxHeight: '280px',
                          overflowY: 'auto',
                          backgroundColor: '#F8FAFC',
                          marginBottom: '16px',
                        }}
                      >
                        {filteredColleges.length > 0 ? (
                          filteredColleges.map((c) => {
                            const isChecked = selectedCollegeIdsForAssign.includes(c.id);
                            const wasSaved = currentlySavedIds.includes(c.id);

                            let statusBadge = (
                              <span style={{ fontSize: '11px', color: '#64748B', backgroundColor: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>
                                Not Assigned
                              </span>
                            );

                            if (wasSaved && isChecked) {
                              statusBadge = (
                                <span style={{ fontSize: '11px', color: '#15803D', backgroundColor: '#DCFCE7', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                  ✓ Currently Assigned
                                </span>
                              );
                            } else if (!wasSaved && isChecked) {
                              statusBadge = (
                                <span style={{ fontSize: '11px', color: '#1D4ED8', backgroundColor: '#DBEAFE', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                  + Will Be Assigned
                                </span>
                              );
                            } else if (wasSaved && !isChecked) {
                              statusBadge = (
                                <span style={{ fontSize: '11px', color: '#B91C1C', backgroundColor: '#FEE2E2', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                  − Will Be Removed
                                </span>
                              );
                            }

                            return (
                              <label
                                key={c.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '10px',
                                  padding: '8px 6px',
                                  fontSize: '13px',
                                  cursor: isArchived ? 'not-allowed' : 'pointer',
                                  borderBottom: '1px solid #F1F5F9',
                                  backgroundColor: isChecked ? '#F0F9FF' : 'transparent',
                                  borderRadius: '4px',
                                  marginBottom: '2px',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={isArchived || savingColleges}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedCollegeIdsForAssign([...selectedCollegeIdsForAssign, c.id]);
                                    } else {
                                      setSelectedCollegeIdsForAssign(selectedCollegeIdsForAssign.filter((id) => id !== c.id));
                                    }
                                  }}
                                  style={{ cursor: isArchived ? 'not-allowed' : 'pointer' }}
                                />
                                <span
                                  style={{
                                    fontWeight: 700,
                                    color: '#3730A3',
                                    backgroundColor: '#EEF2FF',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                  }}
                                >
                                  {c.code}
                                </span>
                                <span style={{ fontWeight: isChecked ? 600 : 400, color: '#0F172A' }}>
                                  {c.name}
                                </span>
                                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <span style={{ color: '#64748B', fontSize: '12px' }}>
                                    {c.candidates_count || 0} students
                                  </span>
                                  {statusBadge}
                                </div>
                              </label>
                            );
                          })
                        ) : (
                          <div style={{ padding: '20px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
                            {collegeSearchQuery ? `No institutions match "${collegeSearchQuery}".` : 'No institutions available.'}
                          </div>
                        )}
                      </div>

                      {/* Footer Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button
                          type="button"
                          disabled={savingColleges || isArchived}
                          onClick={handleSaveColleges}
                          style={{
                            backgroundColor: isArchived ? '#94A3B8' : '#0B2E6F',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '9px 20px',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: isArchived || savingColleges ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {savingColleges ? 'Saving Assignments...' : 'Save College Assignments'}
                        </button>
                        <button
                          type="button"
                          disabled={savingColleges}
                          onClick={() => {
                            setSelectedCollegeIdsForAssign(currentlySavedIds);
                            setCollegeAssignError(null);
                          }}
                          style={{
                            backgroundColor: '#FFFFFF',
                            color: '#475569',
                            border: '1px solid #CBD5E1',
                            borderRadius: '6px',
                            padding: '8px 16px',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel / Revert Changes
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* ─── QUESTION PREVIEW MODAL (PHASE 2.1) ────────────────────── */}
      {previewQuestion && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: '24px',
              width: '640px',
              maxWidth: '92vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ backgroundColor: '#EEF2FF', color: '#3730A3', fontWeight: 800, fontSize: '12px', padding: '2px 8px', borderRadius: '4px' }}>
                    #{previewQuestion.id}
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B' }}>
                    Section: <strong>{previewQuestion.section_name || previewQuestion.section_type}</strong>
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#0B2E6F' }}>
                    • {previewQuestion.marks || 1} Marks
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewQuestion(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', color: '#94A3B8', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '16px', lineHeight: 1.5, backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              {previewQuestion.prompt}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {[
                { key: 'A', text: previewQuestion.option_a },
                { key: 'B', text: previewQuestion.option_b },
                { key: 'C', text: previewQuestion.option_c },
                { key: 'D', text: previewQuestion.option_d },
              ].map(({ key, text }) => {
                const isCorrect = (previewQuestion.correct_option || '').toUpperCase() === key;
                return (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: isCorrect ? '2px solid #16A34A' : '1px solid #E2E8F0',
                      backgroundColor: isCorrect ? '#F0FDF4' : '#FFFFFF',
                    }}
                  >
                    <span
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: isCorrect ? '#16A34A' : '#E2E8F0',
                        color: isCorrect ? '#FFFFFF' : '#475569',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '12px',
                      }}
                    >
                      {isCorrect ? '✓' : key}
                    </span>
                    <span style={{ fontSize: '13.5px', color: isCorrect ? '#14532D' : '#334155', fontWeight: isCorrect ? 700 : 500 }}>
                      {text}
                    </span>
                  </div>
                );
              })}
            </div>

            {previewQuestion.explanation && (
              <div style={{ backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
                <strong style={{ color: '#1D4ED8' }}>Explanation:</strong>
                <div style={{ color: '#1E3A8A', marginTop: '4px', lineHeight: 1.4 }}>{previewQuestion.explanation}</div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setPreviewQuestion(null)}
                style={{ padding: '8px 18px', backgroundColor: '#0B2E6F', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── ADD QUESTIONS FROM BANK MODAL (PHASE 2.1) ───────────────── */}
      {showAddQuestionsModal && targetSectionForAdd && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: '24px',
              width: '720px',
              maxWidth: '92vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
                  Add Questions to {targetSectionForAdd.section_name} Pool
                </h3>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  Select questions from the independent Question Bank to include in this assessment round.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddQuestionsModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', color: '#94A3B8', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddQuestionsSubmit}>
              {loadingBankQuestions ? (
                <div style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                  Searching available Question Bank items...
                </div>
              ) : bankQuestionsForAdd.length === 0 ? (
                <div style={{ padding: '36px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
                  All bank questions for this section are already assigned to this assessment!
                </div>
              ) : (
                <div style={{ maxHeight: '380px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px', marginBottom: '16px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                        <th style={{ padding: '10px 14px', width: '40px' }}>
                          <input
                            type="checkbox"
                            checked={bankQuestionsForAdd.length > 0 && selectedBankQuestionIds.length === bankQuestionsForAdd.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedBankQuestionIds(bankQuestionsForAdd.map((q) => q.id));
                              } else {
                                setSelectedBankQuestionIds([]);
                              }
                            }}
                          />
                        </th>
                        <th style={{ padding: '10px 14px', color: '#64748B', fontWeight: 700 }}>PROMPT</th>
                        <th style={{ padding: '10px 14px', width: '90px', color: '#64748B', fontWeight: 700 }}>DIFFICULTY</th>
                        <th style={{ padding: '10px 14px', width: '70px', color: '#64748B', fontWeight: 700 }}>MARKS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bankQuestionsForAdd.map((q) => {
                        const isSelected = selectedBankQuestionIds.includes(q.id);
                        return (
                          <tr
                            key={q.id}
                            style={{
                              borderBottom: '1px solid #F1F5F9',
                              backgroundColor: isSelected ? '#F0F7FF' : 'transparent',
                              cursor: 'pointer',
                            }}
                            onClick={() => {
                              setSelectedBankQuestionIds((prev) =>
                                prev.includes(q.id) ? prev.filter((id) => id !== q.id) : [...prev, q.id]
                              );
                            }}
                          >
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                style={{ pointerEvents: 'none' }}
                              />
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ fontWeight: 600, color: '#0F172A' }}>{q.prompt}</div>
                              {q.category && <div style={{ fontSize: '11px', color: '#64748B' }}>{q.category}</div>}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>{q.difficulty}</span>
                            </td>
                            <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0B2E6F' }}>{q.marks || 1}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#0B2E6F' }}>
                  {selectedBankQuestionIds.length} Question{selectedBankQuestionIds.length === 1 ? '' : 's'} Selected
                </span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setShowAddQuestionsModal(false)}
                    style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontSize: '13px', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addingBankQuestions || selectedBankQuestionIds.length === 0}
                    style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: addingBankQuestions || selectedBankQuestionIds.length === 0 ? '#94A3B8' : '#1455B8', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: addingBankQuestions || selectedBankQuestionIds.length === 0 ? 'not-allowed' : 'pointer' }}
                  >
                    {addingBankQuestions ? 'Adding...' : `Add Selected (${selectedBankQuestionIds.length}) →`}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── REPLACE QUESTION MODAL (PHASE 2.1) ───────────────────────── */}
      {showReplaceQuestionModal && replacingQuestion && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: '24px',
              width: '640px',
              maxWidth: '92vw',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
                Replace Question #{replacingQuestion.id}
              </h3>
              <button
                type="button"
                onClick={() => setShowReplaceQuestionModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', color: '#94A3B8', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ backgroundColor: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '16px', fontSize: '13px' }}>
              <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Question to be replaced:</div>
              <div style={{ fontWeight: 600, color: '#0F172A', marginTop: '4px' }}>{replacingQuestion.prompt}</div>
            </div>

            <form onSubmit={handleReplaceQuestionSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Select Replacement Question from Bank *
                </label>
                <select
                  value={selectedReplacementId || ''}
                  onChange={(e) => setSelectedReplacementId(Number(e.target.value) || null)}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', backgroundColor: '#FFFFFF' }}
                >
                  <option value="">Choose a replacement question...</option>
                  {replacementOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      #{opt.id} [{opt.difficulty}] - {opt.prompt.slice(0, 70)}...
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowReplaceQuestionModal(false)}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontSize: '13px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={replacingAction || !selectedReplacementId}
                  style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: replacingAction || !selectedReplacementId ? '#94A3B8' : '#1455B8', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: replacingAction || !selectedReplacementId ? 'not-allowed' : 'pointer' }}
                >
                  {replacingAction ? 'Replacing...' : 'Confirm Replacement →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. AUDIT TRAIL TAB */}
                {detailTab === 'candidates' && (() => {
                  const filteredCandidates = allCandidates.filter((cand) => {
                    if (!candidateSearchQuery.trim()) return true;
                    const q = candidateSearchQuery.toLowerCase();
                    return (
                      cand.full_name?.toLowerCase().includes(q) ||
                      cand.register_number?.toLowerCase().includes(q) ||
                      cand.email?.toLowerCase().includes(q) ||
                      cand.college?.toLowerCase().includes(q)
                    );
                  });

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '12px',
                          backgroundColor: '#F8FAFC',
                          padding: '12px 16px',
                          borderRadius: '10px',
                          border: '1px solid #E2E8F0',
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: '13.5px', color: '#0B2E6F' }}>
                            Assessment-First Direct Candidate Eligibility (Phase 2.1)
                          </strong>
                          <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748B' }}>
                            Select specific candidates directly eligible to take this assessment, independent of college affiliation.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleSaveCandidates}
                          disabled={savingCandidates}
                          style={{
                            padding: '8px 18px',
                            backgroundColor: '#1455B8',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '12.5px',
                            cursor: savingCandidates ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {savingCandidates ? 'Saving...' : `Save Direct Candidates (${selectedCandidateIdsForAssign.length})`}
                        </button>
                      </div>

                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <input
                          type="text"
                          value={candidateSearchQuery}
                          onChange={(e) => setCandidateSearchQuery(e.target.value)}
                          placeholder="Search candidates by name, roll number, email, or institution..."
                          style={{
                            flex: 1,
                            padding: '9px 14px',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            fontSize: '13px',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const ids = filteredCandidates.map((c) => c.id);
                            setSelectedCandidateIdsForAssign(Array.from(new Set([...selectedCandidateIdsForAssign, ...ids])));
                          }}
                          style={{
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                            backgroundColor: '#FFFFFF',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Select All Visible
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedCandidateIdsForAssign([])}
                          style={{
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                            backgroundColor: '#FFFFFF',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Clear All
                        </button>
                      </div>

                      {loadingCandidates ? (
                        <div style={{ padding: '32px', textAlign: 'center', color: '#64748B' }}>
                          Loading eligible candidate directory...
                        </div>
                      ) : (
                        <div
                          style={{
                            maxHeight: '380px',
                            overflowY: 'auto',
                            border: '1px solid #E2E8F0',
                            borderRadius: '8px',
                          }}
                        >
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                            <thead style={{ backgroundColor: '#F8FAFC', position: 'sticky', top: 0 }}>
                              <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                                <th style={{ padding: '10px 14px', width: '36px' }}></th>
                                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Candidate</th>
                                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Roll Number</th>
                                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Institution</th>
                                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Department</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredCandidates.map((cand) => {
                                const isChecked = selectedCandidateIdsForAssign.includes(cand.id);
                                return (
                                  <tr
                                    key={cand.id}
                                    style={{
                                      borderBottom: '1px solid #F1F5F9',
                                      backgroundColor: isChecked ? '#EFF6FF' : 'transparent',
                                    }}
                                  >
                                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => {
                                          setSelectedCandidateIdsForAssign((prev) =>
                                            prev.includes(cand.id)
                                              ? prev.filter((id) => id !== cand.id)
                                              : [...prev, cand.id]
                                          );
                                        }}
                                        style={{ cursor: 'pointer', accentColor: '#1455B8' }}
                                      />
                                    </td>
                                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0B2E6F' }}>
                                      {cand.full_name}
                                    </td>
                                    <td style={{ padding: '10px 14px', fontFamily: 'monospace' }}>
                                      {cand.register_number}
                                    </td>
                                    <td style={{ padding: '10px 14px', color: '#475569' }}>
                                      {cand.college}
                                    </td>
                                    <td style={{ padding: '10px 14px', color: '#64748B' }}>
                                      {cand.department} ({cand.year_of_study || 'N/A'})
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {detailTab === 'audit' && (
                  <div>
                    {Array.isArray(assessmentDetail.audit_logs) && assessmentDetail.audit_logs.length > 0 ? (
                      <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', maxHeight: '280px', overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                              <th style={{ padding: '8px 12px', fontWeight: 700 }}>TIMESTAMP</th>
                              <th style={{ padding: '8px 12px', fontWeight: 700 }}>ACTION</th>
                              <th style={{ padding: '8px 12px', fontWeight: 700 }}>PERFORMED BY</th>
                              <th style={{ padding: '8px 12px', fontWeight: 700 }}>DETAILS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {assessmentDetail.audit_logs.map((log, idx) => (
                              <tr key={log.id || idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                <td style={{ padding: '8px 12px', color: '#64748B', whiteSpace: 'nowrap' }}>
                                  {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                                </td>
                                <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0B2E6F' }}>
                                  {log.action || 'ACTION'}
                                </td>
                                <td style={{ padding: '8px 12px' }}>
                                  {log.performed_by_name || 'System'}
                                </td>
                                <td style={{ padding: '8px 12px', color: '#475569' }}>
                                  <code style={{ fontSize: '11px', background: '#F1F5F9', padding: '2px 4px', borderRadius: '3px' }}>
                                    {typeof log.details === 'object' && log.details !== null
                                      ? JSON.stringify(log.details)
                                      : String(log.details || '{}')}
                                  </code>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8', fontStyle: 'italic' }}>
                        No audit records captured yet.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                onClick={handleCloseDetail}
                style={{ backgroundColor: '#0B2E6F', color: '#FFFFFF', border: 'none', borderRadius: '6px', padding: '8px 18px', fontWeight: 700, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
