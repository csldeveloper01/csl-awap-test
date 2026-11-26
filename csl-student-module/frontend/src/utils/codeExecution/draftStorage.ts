import { normalizeCanonicalLanguage } from './BrowserCodeExecutionAdapter';

export const CODING_DRAFT_PREFIX = 'csl_coding_draft_v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key?(index: number): string | null;
  readonly length?: number;
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch {
    // Ignore storage access errors in restricted sandbox contexts
  }
  return null;
}

/**
 * Resolves the stable question identifier for draft isolation.
 * Always prefers authoritative database question_id over fallback order.
 */
export function resolveDraftQuestionKey(
  questionId?: number | null,
  questionOrder?: number | null
): string {
  if (typeof questionId === 'number' && Number.isFinite(questionId) && questionId > 0) {
    return String(questionId);
  }
  return `order_${questionOrder ?? 0}`;
}

export function buildCodingDraftKey(
  attemptId: string,
  questionKey: string | number,
  language: string
): string {
  const safeAttempt = String(attemptId || 'default').trim();
  const safeQuestion = String(questionKey || '0').trim();
  const canonicalLang = normalizeCanonicalLanguage(language || 'python');
  return `${CODING_DRAFT_PREFIX}:${safeAttempt}:${safeQuestion}:${canonicalLang}`;
}

export function loadCodingDraft(
  attemptId: string,
  questionIdOrOrder: string | number,
  language: string,
  storage: StorageLike | null = getDefaultStorage()
): string | null {
  if (!storage || !attemptId) return null;
  try {
    const key = buildCodingDraftKey(attemptId, questionIdOrOrder, language);
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function saveCodingDraft(
  attemptId: string,
  questionIdOrOrder: string | number,
  language: string,
  sourceCode: string,
  storage: StorageLike | null = getDefaultStorage()
): void {
  if (!storage || !attemptId) return;
  try {
    const key = buildCodingDraftKey(attemptId, questionIdOrOrder, language);
    storage.setItem(key, sourceCode);
  } catch {
    // Ignore quota / security errors silently without breaking editing
  }
}

export function resetCodingDraft(
  attemptId: string,
  questionIdOrOrder: string | number,
  language: string,
  boilerplate: string,
  storage: StorageLike | null = getDefaultStorage()
): string {
  saveCodingDraft(attemptId, questionIdOrOrder, language, boilerplate, storage);
  return boilerplate;
}

export function clearAttemptCodingDrafts(
  attemptId: string,
  storage: StorageLike | null = getDefaultStorage()
): void {
  if (!storage || !attemptId) return;
  const attemptPrefix = `${CODING_DRAFT_PREFIX}:${String(attemptId).trim()}:`;
  try {
    if (typeof storage.length === 'number' && typeof storage.key === 'function') {
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith(attemptPrefix)) {
          keysToRemove.push(k);
        }
      }
      for (const k of keysToRemove) {
        storage.removeItem(k);
      }
    }
  } catch {
    // Ignore storage iteration failures
  }
}
