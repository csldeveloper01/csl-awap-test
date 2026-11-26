export type BrowserExecutionStatus =
  | 'ACCEPTED'
  | 'WRONG_ANSWER'
  | 'COMPILATION_ERROR'
  | 'RUNTIME_ERROR'
  | 'TIME_LIMIT_EXCEEDED'
  | 'CANCELLED'
  | 'RUNTIME_LOAD_ERROR'
  | 'BROWSER_RUNTIME_UNSUPPORTED';

export type BrowserRuntimeState = 'IDLE' | 'LOADING_RUNTIME' | 'READY' | 'EXECUTING' | 'ERROR';

export type OutputComparisonMode = 'EXACT' | 'TRIMMED' | 'WHITESPACE_NORMALIZED';

export type TestCaseVisibilityScope = 'SAMPLE' | 'ADDITIONAL' | 'HIDDEN';

export interface BrowserExecutionRequest {
  sourceCode: string;
  language: string;
  stdin?: string;
  timeoutMs?: number;
  maxInputChars?: number;
  maxOutputChars?: number;
  onRuntimeStateChange?: (state: BrowserRuntimeState, detail?: string) => void;
}

export interface BrowserPhaseTimings {
  initMs?: number;
  compileMs?: number;
  generateMs?: number;
  executionMs?: number;
  totalMs?: number;
}

export interface BrowserExecutionResult {
  status: BrowserExecutionStatus;
  stdout: string;
  stderr: string;
  compilationErrors: string;
  runtimeErrors: string;
  executionTimeMs: number;
  phaseTimings?: BrowserPhaseTimings;
  truncated?: boolean;
  unsupportedReason?: string;
}

export interface SampleTestCaseSpec {
  id: string;
  input_text: string;
  expected_output: string;
  explanation?: string;
  marks_weightage?: number;
  is_public?: boolean;
  visibility_scope?: TestCaseVisibilityScope;
  comparison_mode?: OutputComparisonMode | 'INHERIT';
}

export interface SampleTestExecutionResult {
  testCaseId: string;
  index: number;
  visibilityScope?: TestCaseVisibilityScope;
  isPublic?: boolean;
  inputText: string;
  expectedOutput: string;
  actualOutput: string;
  stderr: string;
  compilationErrors: string;
  runtimeErrors: string;
  status: BrowserExecutionStatus;
  passed: boolean;
  executionTimeMs: number;
  marksWeightage?: number;
  explanation?: string;
  truncated?: boolean;
}

export interface SampleSuiteExecutionResult {
  overallStatus: BrowserExecutionStatus;
  passedCount: number;
  failedCount?: number;
  totalCount: number;
  results: SampleTestExecutionResult[];
  compilationErrors?: string;
  runtimeErrors?: string;
  unsupportedReason?: string;
}

export interface EvaluationPipelineResult {
  overallStatus: BrowserExecutionStatus;
  passedCount: number;
  failedCount: number;
  totalCount: number;
  scoreAwarded: number;
  maxMarks: number;
  comparisonMode: OutputComparisonMode;
  engineVersion: string;
  totalExecutionTimeMs: number;
  compilationErrors: string;
  runtimeErrors: string;
  results: SampleTestExecutionResult[];
}

export interface LanguageExecutionDriver {
  language: string;
  isSupported(): boolean;
  getUnsupportedReason?(): string;
  getRuntimeState?(): BrowserRuntimeState;
  execute(req: BrowserExecutionRequest): Promise<BrowserExecutionResult>;
  cancel(): void;
}
