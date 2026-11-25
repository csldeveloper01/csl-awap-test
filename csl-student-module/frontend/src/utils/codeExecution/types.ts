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

export interface BrowserExecutionRequest {
  sourceCode: string;
  language: string;
  stdin?: string;
  timeoutMs?: number;
  maxInputChars?: number;
  maxOutputChars?: number;
  onRuntimeStateChange?: (state: BrowserRuntimeState, detail?: string) => void;
}

export interface BrowserExecutionResult {
  status: BrowserExecutionStatus;
  stdout: string;
  stderr: string;
  compilationErrors: string;
  runtimeErrors: string;
  executionTimeMs: number;
  truncated?: boolean;
  unsupportedReason?: string;
}

export interface SampleTestCaseSpec {
  id: string;
  input_text: string;
  expected_output: string;
  explanation?: string;
}

export interface SampleTestExecutionResult {
  testCaseId: string;
  index: number;
  inputText: string;
  expectedOutput: string;
  actualOutput: string;
  stderr: string;
  compilationErrors: string;
  runtimeErrors: string;
  status: BrowserExecutionStatus;
  passed: boolean;
  executionTimeMs: number;
  explanation?: string;
  truncated?: boolean;
}

export interface SampleSuiteExecutionResult {
  overallStatus: BrowserExecutionStatus;
  passedCount: number;
  totalCount: number;
  results: SampleTestExecutionResult[];
  compilationErrors?: string;
  runtimeErrors?: string;
  unsupportedReason?: string;
}

export interface LanguageExecutionDriver {
  language: string;
  isSupported(): boolean;
  getUnsupportedReason?(): string;
  execute(req: BrowserExecutionRequest): Promise<BrowserExecutionResult>;
  cancel(): void;
}
