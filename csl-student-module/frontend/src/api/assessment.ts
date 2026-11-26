import axios from 'axios';

function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null;
  }
  return null;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export const assessmentApi = axios.create({
  baseURL: `${API_BASE}/api/assessment`,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

assessmentApi.interceptors.request.use((config) => {
  const csrfToken = getCookie('csrftoken');
  if (csrfToken && config.headers) {
    config.headers['X-CSRFToken'] = csrfToken;
  }

  // Inject secure assessment token if stored
  const token = sessionStorage.getItem('csl_assessment_token') || localStorage.getItem('csl_assessment_token');
  if (token && config.headers) {
    config.headers['Authorization'] = `Bearer ${token}`;
    config.headers['X-Assessment-Token'] = token;
  }

  return config;
});

export interface CollegeOption {
  id: number;
  name: string;
  code: string;
  location?: string;
}

export interface CandidateAssessmentItem {
  id: string;
  code: string;
  title: string;
  description: string;
  duration_minutes: number;
  total_marks: number;
  sections?: Array<{
    id: number;
    code: string;
    name: string;
    question_count: number;
    marks_per_question: number;
    total_marks: number;
    order: number;
  }>;
  aptitude_count: number;
  coding_count: number;
  max_attempts: number;
  delivery_mode?: 'MCQ' | 'PDF_CODING';
  has_pdf?: boolean;
  pdf_filename?: string | null;
  status: string;
  is_open: boolean;
  scheduled_start_time?: string;
  scheduled_end_time?: string;
  attempts_count: number;
  user_can_attempt: boolean;
  latest_attempt_id?: string | null;
  latest_attempt_state?: string | null;
  latest_attempt_score?: number | null;
  is_seb_required?: boolean;
  instructions?: string;
  passing_percentage?: number | null;
  passing_marks?: number | null;
}

export interface CandidateAssessmentsResponse {
  candidate: {
    id: string;
    full_name: string;
    register_number: string;
    college: string;
    college_id?: number | null;
    department: string;
    year_of_study: string;
    is_active: boolean;
  };
  assessments: CandidateAssessmentItem[];
}

export interface RegistrationPayload {
  full_name: string;
  register_number: string;
  college?: string;
  college_id?: number;
  email: string;
  department: string;
  year_of_study: string;
  phone_number: string;
  assessment_id?: string;
  drive_code?: string;
  invite_token?: string;
  access_code?: string;
}

export interface RegisterResponse {
  candidate_id: string;
  assessment_token: string;
  full_name?: string;
  college?: string;
  college_id?: number | null;
  already_completed: boolean;
  is_active_attempt?: boolean;
  attempt_id?: string;
  attempt_state?: string;
  assessment_title?: string;
  assessment_code?: string;
  remaining_seconds?: number;
  message?: string;
}

export interface QuestionOption {
  key: string;
  text: string;
}

export interface ProgrammingTestCaseSample {
  id: string;
  input_text: string;
  expected_output: string;
  explanation?: string;
  marks_weightage?: number;
}

export interface ProgrammingDetails {
  problem_statement: string;
  constraints?: string;
  input_format?: string;
  output_format?: string;
  allowed_languages: string[];
  boilerplate_code: Record<string, string>;
  time_limit_seconds: number;
  memory_limit_mb: number;
  sample_test_cases: ProgrammingTestCaseSample[];
}

export interface QuestionSnapshot {
  question_order: number;
  question_id?: number;
  section_type: string;
  category?: string;
  prompt: string;
  options: QuestionOption[];
  selected_option: string;
  programming_details?: ProgrammingDetails | null;
}

export interface AttemptDetailResponse {
  id: string;
  assessment_id?: string;
  assessment_title?: string;
  assessment_code?: string;
  state: 'CREATED' | 'IN_PROGRESS' | 'SUBMITTED' | 'TIMED_OUT' | 'FLAGGED_FOR_REVIEW' | 'COMPLETED_PENDING_MANUAL_EVALUATION';
  delivery_mode?: 'MCQ' | 'PDF_CODING';
  has_pdf?: boolean;
  pdf_filename?: string | null;
  pdf_file_size?: number | null;
  is_manual_evaluation_pending?: boolean;
  started_at: string;
  deadline: string;
  remaining_seconds: number;
  server_time?: string;
  candidate_name: string;
  candidate_register_number?: string;
  college: string;
  total_questions: number;
  tab_switch_count: number;
  fullscreen_exit_count: number;
  max_tab_switches: number;
  remaining_tab_switches: number;
  is_flagged?: boolean;
  flag_reason?: string;
  is_paused?: boolean;
  total_paused_seconds?: number;
  max_disconnection_grace_seconds?: number;
  sections?: Array<{
    id: number;
    code: string;
    name: string;
    question_count: number;
    marks_per_question: number;
    total_marks: number;
    order: number;
    snapshot_count?: number;
    unattempted_count?: number;
  }>;
  questions: QuestionSnapshot[];
  assessment_token?: string;
  is_simulation?: boolean;
  camera_calibrated?: boolean;
  is_seb_required?: boolean;
  instructions?: string;
  passing_percentage?: number | null;
}

export interface SectionBreakdown {
  score: number;
  total: number;
  percentage: number;
  correct: number;
  incorrect: number;
  unattempted: number;
}

export interface ResultBreakdown {
  total_questions: number;
  time_taken_seconds: number;
  time_taken_display: string;
  aptitude: SectionBreakdown;
  coding: SectionBreakdown;
}

export interface ResultResponse {
  id: string;
  assessment_id?: string;
  assessment_title?: string;
  assessment_code?: string;
  candidate_name: string;
  register_number: string;
  college: string;
  department: string;
  year_of_study?: string;
  state: string;
  delivery_mode?: 'MCQ' | 'PDF_CODING';
  is_manual_evaluation_pending?: boolean;
  aptitude_score: number;
  coding_score: number;
  total_score: number;
  percentage: number;
  duration_minutes?: number;
  max_marks?: number;
  total_questions?: number;
  tab_switch_count?: number;
  fullscreen_exit_count?: number;
  is_flagged?: boolean;
  flag_reason?: string;
  is_results_released?: boolean;
  message?: string;
  started_at: string;
  submitted_at: string;
  breakdown?: ResultBreakdown;
}

export interface IntegrityEventResponse {
  status: string;
  event_type: string;
  tab_switches: number;
  max_switches: number;
  remaining_switches: number;
  is_finalized: boolean;
  state: string;
  flag_reason: string;
}

export const getStudentColleges = async (params?: { search?: string; drive_code?: string; code?: string }): Promise<CollegeOption[]> => {
  const res = await assessmentApi.get<CollegeOption[]>('/colleges/', { params });
  const raw = res.data;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    if (Array.isArray((raw as any).results)) return (raw as any).results;
    if (Array.isArray((raw as any).colleges)) return (raw as any).colleges;
    if (Array.isArray((raw as any).data)) return (raw as any).data;
  }
  return [];
};



export const registerCandidate = async (payload: RegistrationPayload): Promise<RegisterResponse> => {
  const res = await assessmentApi.post<RegisterResponse>('/register/', payload);
  if (res.data.assessment_token) {
    sessionStorage.setItem('csl_assessment_token', res.data.assessment_token);
    sessionStorage.setItem('csl_candidate_id', res.data.candidate_id);
  }
  return res.data;
};

export const startAssessment = async (assessmentId?: string): Promise<AttemptDetailResponse> => {
  const payload = assessmentId ? { assessment_id: assessmentId } : {};
  const res = await assessmentApi.post<AttemptDetailResponse>('/start/', payload);
  if (res.data.assessment_token) {
    sessionStorage.setItem('csl_assessment_token', res.data.assessment_token);
  }
  if (res.data.id) {
    sessionStorage.setItem('csl_attempt_id', res.data.id);
  }
  return res.data;
};

export const getAttemptState = async (attemptId: string): Promise<AttemptDetailResponse> => {
  const res = await assessmentApi.get<AttemptDetailResponse>(`/attempts/${attemptId}/`);
  return res.data;
};

export const saveAnswer = async (
  attemptId: string,
  questionOrder: number,
  selectedOption: string
): Promise<{ question_order: number; selected_option: string; status: string }> => {
  const res = await assessmentApi.post(`/attempts/${attemptId}/answer/`, {
    question_order: questionOrder,
    selected_option: selectedOption,
  });
  return res.data;
};

export interface HeartbeatResponse {
  attempt_id: string;
  state: string;
  remaining_seconds: number;
  is_paused: boolean;
  total_paused_seconds: number;
  server_time: string;
}

export const sendAttemptHeartbeat = async (attemptId: string): Promise<HeartbeatResponse> => {
  const res = await assessmentApi.post<HeartbeatResponse>(`/attempts/${attemptId}/heartbeat/`);
  return res.data;
};

export interface SyncAnswerItem {
  question_order: number;
  selected_option: string;
  client_timestamp?: string;
}

export interface SyncAnswersResponse {
  attempt_id: string;
  synced_count: number;
  state: string;
  remaining_seconds: number;
  is_paused: boolean;
  total_paused_seconds: number;
}

export const syncAnswers = async (
  attemptId: string,
  answers: SyncAnswerItem[]
): Promise<SyncAnswersResponse> => {
  const res = await assessmentApi.post<SyncAnswersResponse>(`/attempts/${attemptId}/sync-answers/`, {
    answers,
  });
  return res.data;
};

export const recordIntegrityEvent = async (
  attemptId: string,
  eventType: string,
  eventId: string = '',
  metadata: Record<string, unknown> = {}
): Promise<IntegrityEventResponse> => {
  const res = await assessmentApi.post<IntegrityEventResponse>(`/attempts/${attemptId}/integrity-event/`, {
    event_type: eventType,
    event_id: eventId,
    client_timestamp: new Date().toISOString(),
    metadata,
  });
  return res.data;
};

export const finalizeAssessment = async (attemptId: string): Promise<ResultResponse> => {
  const res = await assessmentApi.post<ResultResponse>(`/attempts/${attemptId}/finalize/`);
  return res.data;
};

export const getAssessmentResult = async (attemptId: string): Promise<ResultResponse> => {
  const res = await assessmentApi.get<ResultResponse>(`/attempts/${attemptId}/result/`);
  return res.data;
};

export const fetchAttemptPdfBlob = async (attemptId: string): Promise<Blob> => {
  const res = await assessmentApi.get(`/attempts/${attemptId}/pdf/`, {
    responseType: 'blob',
  });
  return res.data;
};

export interface RecoverAttemptPayload {
  register_number: string;
  verification_factor: string;
  attempt_id?: string;
}

export interface RecoverAttemptResponse {
  message: string;
  attempt_id: string;
  token: string;
  remaining_seconds: number;
  candidate: {
    id: string;
    full_name: string;
    register_number: string;
    college: string;
    department: string;
    year_of_study: string;
  };
  assessment: {
    id: string;
    code: string;
    title: string;
    duration_minutes: number;
    total_marks: number;
    delivery_mode: string;
  };
  recovery_count: number;
  max_self_recoveries: number;
}

export const recoverStudentAttempt = async (
  payload: RecoverAttemptPayload
): Promise<RecoverAttemptResponse> => {
  const res = await assessmentApi.post<RecoverAttemptResponse>('/recover/', payload);
  if (res.data.token) {
    sessionStorage.setItem('csl_assessment_token', res.data.token);
    localStorage.setItem('csl_assessment_token', res.data.token);
  }
  return res.data;
};


export const requestInstitutionAddition = async (data: {
  institution_name: string;
  email?: string;
  city?: string;
  state?: string;
}): Promise<{ message: string; success: boolean }> => {
  const res = await assessmentApi.post<{ message: string; success: boolean }>('/request-college/', data);
  return res.data;
};

// ─── PHASE 2.2 PUBLIC DRIVE & ACCESS CODE RESOLUTION ──────────────────────────

export interface PublicDriveAssessment {
  id: string;
  code: string;
  title: string;
  duration_minutes: number;
  total_marks: number;
  is_required: boolean;
  delivery_mode?: string;
  assessment_type?: string;
}

export interface PublicDriveInfo {
  id: string;
  name: string;
  code: string;
  description: string;
  status: string;
  visibility?: string;
  start_date: string | null;
  end_date: string | null;
  registration_start: string | null;
  registration_end: string | null;
  is_registration_open?: boolean;
  eligible_colleges?: Array<{ id: number; name: string; code: string }>;
  assessments: PublicDriveAssessment[];
}

export const fetchPublicDrive = async (codeOrId: string): Promise<PublicDriveInfo> => {
  const res = await assessmentApi.get<PublicDriveInfo>(`/drives/${codeOrId}/public/`);
  return res.data;
};

export interface ResolveAccessCodeResult {
  valid: boolean;
  type: 'ASSESSMENT' | 'DRIVE' | 'DRIVE_INVITATION';
  target_id: string;
  name?: string;
  title?: string;
  code: string;
  drive_id?: string;
  drive_code?: string;
  eight_digit_code?: string;
  drive_name?: string;
  assessment_id?: string;
  assessment_code?: string;
  assessment_title?: string;
  visibility?: string;
  invite_token?: string;
  eligible_colleges?: CollegeOption[];
  eligible_college_ids?: number[];
  drive?: PublicDriveInfo;
  assessment?: any;
  message?: string;
}

export const resolveAccessCode = async (code: string): Promise<ResolveAccessCodeResult> => {
  const res = await assessmentApi.post<ResolveAccessCodeResult>('/resolve-code/', { code });
  return res.data;
};


export interface DriveLinkPayload {
  drive_code?: string;
  access_code?: string;
  invite_token?: string;
  register_number?: string;
  verification_factor?: string;
  token?: string;
}

export interface DriveLinkResponse {
  success: boolean;
  message: string;
  candidate_id: string;
  full_name: string;
  register_number: string;
  college: string;
  drive_id: string;
  drive_name: string;
  drive_code: string;
  assessment_token: string;
}

export const linkCandidateToDrive = async (payload: DriveLinkPayload): Promise<DriveLinkResponse> => {
  const res = await assessmentApi.post<DriveLinkResponse>('/drive-link/', payload);
  if (res.data.assessment_token) {
    sessionStorage.setItem('csl_assessment_token', res.data.assessment_token);
    sessionStorage.setItem('assessment_token', res.data.assessment_token);
    localStorage.setItem('csl_assessment_token', res.data.assessment_token);
  }
  return res.data;
};


export interface CodeRunPayload {
  attempt_id: string;
  question_id: number;
  language: string;
  source_code: string;
  custom_input?: string;
}

export interface CodeRunResult {
  mode: 'CUSTOM_INPUT' | 'SAMPLE_TEST_CASES';
  verdict?: string;
  stdout?: string;
  stderr?: string;
  compile_output?: string;
  execution_time_ms?: number;
  sample_results?: Array<{
    test_case_id: string;
    input_text: string;
    expected_output: string;
    actual_output: string;
    stderr?: string;
    passed: boolean;
    execution_time_ms: number;
  }>;
}

export const runCode = async (payload: CodeRunPayload): Promise<CodeRunResult> => {
  const res = await assessmentApi.post<CodeRunResult>('/code/run/', payload);
  return res.data;
};

export interface BrowserExecutionMetadataPayload {
  runtime_name?: string;
  runtime_version?: string;
  browser_status?: string;
  public_samples_attempted?: number;
  public_samples_passed?: number;
  execution_time_ms?: number;
  is_authoritative?: boolean;
  is_verified?: boolean;
}

export interface CodeSubmitPayload {
  attempt_id: string;
  question_id: number;
  language: string;
  source_code: string;
  browser_execution_metadata?: BrowserExecutionMetadataPayload;
}

export interface CodeSubmitResult {
  submission_id: string;
  status?: string;
  review_status?: string;
  verdict: string;
  message?: string;
  language?: string;
  question_id?: number;
  created_at?: string;
  score_awarded?: number;
  is_authoritative_score?: boolean;
  browser_execution_metadata?: BrowserExecutionMetadataPayload;
  total_test_cases?: number;
  passed_test_cases?: number;
  execution_time_ms?: number;
  compile_output?: string;
  results?: Array<{
    test_case_id: string;
    is_public: boolean;
    status: string;
    passed: boolean;
    execution_time_ms: number;
    actual_output?: string | null;
    expected_output?: string | null;
    input_text?: string | null;
  }>;
}

export const submitCode = async (payload: CodeSubmitPayload): Promise<CodeSubmitResult> => {
  const res = await assessmentApi.post<CodeSubmitResult>('/code/submit/', payload);
  return res.data;
};

export const getCandidateAssessments = async (driveCode?: string): Promise<CandidateAssessmentsResponse> => {
  const params = driveCode ? { drive_code: driveCode } : {};
  const res = await assessmentApi.get<CandidateAssessmentsResponse>('/candidate-assessments/', { params });
  return res.data;
};

export interface CandidateLoginPayload {
  register_number: string;
  email?: string;
  assessment_id?: string;
  drive_code?: string;
}

export interface CandidateLoginResponse {
  success: boolean;
  message?: string;
  token: string;
  candidate: {
    id: string;
    full_name: string;
    register_number: string;
    email: string;
    college: string;
  };
  active_attempt?: {
    id: string;
    state: string;
    is_simulation?: boolean;
  } | null;
}

export const candidateLogin = async (payload: CandidateLoginPayload): Promise<CandidateLoginResponse> => {
  const res = await assessmentApi.post<CandidateLoginResponse>('/login/', payload);
  if (res.data.token) {
    sessionStorage.setItem('csl_assessment_token', res.data.token);
    sessionStorage.setItem('assessment_token', res.data.token);
    localStorage.setItem('csl_assessment_token', res.data.token);
  }
  return res.data;
};

export interface CameraBypassStatusResponse {
  bypass_granted: boolean;
  candidate_id?: string;
  assessment_id?: string;
  reason?: string;
}

export const checkCameraBypassStatus = async (
  assessmentId: string,
  candidateId?: string
): Promise<CameraBypassStatusResponse> => {
  const params: Record<string, string> = { assessment_id: assessmentId };
  if (candidateId) params.candidate_id = candidateId;
  const res = await assessmentApi.get<CameraBypassStatusResponse>('/camera-bypass-status/', { params });
  return res.data;
};

export const downloadCandidateSebConfig = async (assessmentId: string): Promise<Blob> => {
  const res = await assessmentApi.get(`/${assessmentId}/seb-config/`, { responseType: 'blob' });
  return res.data;
};

export const updateAttemptCalibration = async (
  attemptId: string,
  calibrationData: {
    status: 'COMPLETED' | 'SKIPPED_BY_ADMIN' | 'FAILED';
    poses: Array<{ name: string; timestamp: number; confidence: number }>;
  }
): Promise<{ success: boolean; camera_calibrated: boolean }> => {
  const res = await assessmentApi.post(`/attempts/${attemptId}/calibration/`, calibrationData);
  return res.data;
};

// =============================================================================
// CSL SENTINEL PROCTORING APIS
// =============================================================================

export interface ProctoringSessionResponse {
  id: string;
  assessment_session: string;
  student: string;
  assessment: string;
  status: 'INITIALIZING' | 'ACTIVE' | 'SUSPENDED' | 'COMPLETED' | 'TERMINATED_VIOLATION';
  camera_status: 'PENDING' | 'INITIALIZING' | 'ACTIVE' | 'DISCONNECTED' | 'ERROR';
  face_calibration_status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'SKIPPED_BY_ADMIN';
  screen_share_status: 'PENDING' | 'INITIALIZING' | 'ACTIVE' | 'INTERRUPTED' | 'STOPPED';
  browser_monitoring_status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  started_at: string | null;
  ended_at: string | null;
  risk_score: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  risk_breakdown: Record<string, any>;
  review_status: 'PENDING' | 'CLEARED' | 'NEEDS_REVIEW' | 'CONFIRMED_VIOLATION';
  calibration?: any;
  recent_events?: any[];
}

export const initProctoringSession = async (attemptId: string): Promise<ProctoringSessionResponse> => {
  const res = await assessmentApi.post<ProctoringSessionResponse>('/proctoring/init/', { attempt_id: attemptId });
  return res.data;
};

export const updateProctoringCameraStatus = async (
  sessionId: string,
  cameraStatus: 'ACTIVE' | 'DISCONNECTED' | 'ERROR',
  metadata: Record<string, any> = {}
): Promise<{ success: boolean; camera_status: string; risk_score: number }> => {
  const res = await assessmentApi.post(`/proctoring/${sessionId}/camera-status/`, {
    status: cameraStatus,
    metadata,
  });
  return res.data;
};

export const submitProctoringCalibration = async (
  sessionId: string,
  payload: {
    baseline_orientation: { yaw: number; pitch: number; roll: number; confidence?: number };
    calibration_results: any[];
    calibration_completed: boolean;
  }
): Promise<{ success: boolean; face_calibration_status: string; calibration_id: string }> => {
  const res = await assessmentApi.post(`/proctoring/${sessionId}/calibration/`, payload);
  return res.data;
};

export const updateProctoringScreenShareStatus = async (
  sessionId: string,
  screenShareStatus: 'ACTIVE' | 'INTERRUPTED' | 'STOPPED',
  metadata: Record<string, any> = {}
): Promise<{ success: boolean; screen_share_status: string; risk_score: number }> => {
  const res = await assessmentApi.post(`/proctoring/${sessionId}/screen-share-status/`, {
    status: screenShareStatus,
    metadata,
  });
  return res.data;
};

export const recordProctoringEvent = async (
  sessionId: string,
  payload: {
    event_type: string;
    severity?: 'INFO' | 'WARNING' | 'CRITICAL';
    event_id?: string;
    metadata?: Record<string, any>;
  }
): Promise<{ status: string; event_id?: number; event_type?: string; risk_score: number; risk_level: string }> => {
  const res = await assessmentApi.post(`/proctoring/${sessionId}/events/`, payload);
  return res.data;
};

export const uploadProctoringEvidence = async (
  sessionId: string,
  frameBase64: string,
  evidenceType: 'WEBCAM_SNAPSHOT' | 'SCREEN_SNAPSHOT' | 'CALIBRATION_FRAME' = 'WEBCAM_SNAPSHOT',
  relatedEventId?: number,
  metadata: Record<string, any> = {}
): Promise<{ success: boolean; evidence_id: string; storage_type: string }> => {
  const res = await assessmentApi.post(`/proctoring/${sessionId}/evidence/`, {
    frame_base64: frameBase64,
    evidence_type: evidenceType,
    related_event_id: relatedEventId,
    metadata,
  });
  return res.data;
};

export const getProctoringSessionStatus = async (sessionId: string): Promise<ProctoringSessionResponse> => {
  const res = await assessmentApi.get<ProctoringSessionResponse>(`/proctoring/${sessionId}/status/`);
  return res.data;
};

export const endProctoringSession = async (sessionId: string): Promise<{ success: boolean; status: string }> => {
  const res = await assessmentApi.post(`/proctoring/${sessionId}/end/`);
  return res.data;
};


