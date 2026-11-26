export type AssessmentLifecycleStatus =
  | 'DRAFT'
  | 'READY'
  | 'SCHEDULED'
  | 'OPEN'
  | 'CLOSED'
  | 'ARCHIVED';

export interface SelectableAssessmentItem {
  id: string;
  title?: string;
  status: AssessmentLifecycleStatus | string;
  is_open?: boolean;
  scheduled_start_time?: string | null;
  created_at?: string | null;
  aptitude_count?: number;
  coding_count?: number;
  pool_questions_count?: number;
  sections?: Array<{ question_count?: number }>;
}

/**
 * Pure toggle for frontend-only bulk selection state.
 * Never mutates assessment lifecycle status or triggers navigation.
 */
export function toggleAssessmentSelection(selectedIds: string[], assessmentId: string): string[] {
  if (!assessmentId) return selectedIds;
  return selectedIds.includes(assessmentId)
    ? selectedIds.filter((id) => id !== assessmentId)
    : [...selectedIds, assessmentId];
}

/**
 * Selects or deselects only the currently visible / eligible assessments.
 */
export function toggleSelectAllAssessments<T extends { id: string }>(
  visibleAssessments: T[],
  currentlySelectedIds: string[]
): string[] {
  if (visibleAssessments.length === 0) return [];
  const visibleIds = visibleAssessments.map((item) => item.id);
  const allVisibleSelected = visibleIds.every((id) => currentlySelectedIds.includes(id));
  if (allVisibleSelected) {
    const visibleSet = new Set(visibleIds);
    return currentlySelectedIds.filter((id) => !visibleSet.has(id));
  }
  const merged = new Set(currentlySelectedIds);
  for (const id of visibleIds) merged.add(id);
  return Array.from(merged);
}

export function areAllVisibleAssessmentsSelected<T extends { id: string }>(
  visibleAssessments: T[],
  selectedIds: string[]
): boolean {
  if (visibleAssessments.length === 0) return false;
  return visibleAssessments.every((a) => selectedIds.includes(a.id));
}

export function areSomeVisibleAssessmentsSelected<T extends { id: string }>(
  visibleAssessments: T[],
  selectedIds: string[]
): boolean {
  if (visibleAssessments.length === 0) return false;
  const selectedVisible = visibleAssessments.filter((a) => selectedIds.includes(a.id)).length;
  return selectedVisible > 0 && selectedVisible < visibleAssessments.length;
}

export type AssessmentLifecycleActionType = 'PREPARE' | 'ACTIVATE' | 'DEACTIVATE';

export function getAssessmentLifecycleAction(
  assessment: Pick<SelectableAssessmentItem, 'status' | 'is_open'>
): { type: AssessmentLifecycleActionType; label: string; title: string } | null {
  const status = String(assessment.status || '').toUpperCase();
  if (status === 'OPEN' || (status !== 'CLOSED' && status !== 'ARCHIVED' && assessment.is_open)) {
    return {
      type: 'DEACTIVATE',
      label: 'Deactivate',
      title: 'Close assessment and stop new candidate attempts',
    };
  }
  if (status === 'DRAFT') {
    return {
      type: 'PREPARE',
      label: 'Verify & Ready',
      title: 'Validate question bank sufficiency and mark READY',
    };
  }
  if (status === 'READY' || status === 'SCHEDULED' || status === 'CLOSED') {
    return {
      type: 'ACTIVATE',
      label: 'Activate',
      title: 'Open assessment for candidate attempts',
    };
  }
  return null;
}

export function getAssessmentQuestionCount(assessment: SelectableAssessmentItem): number {
  if (Array.isArray(assessment.sections) && assessment.sections.length > 0) {
    const sum = assessment.sections.reduce((acc, s) => acc + Number(s.question_count || 0), 0);
    if (sum > 0) return sum;
  }
  const legacySum = Number(assessment.aptitude_count || 0) + Number(assessment.coding_count || 0);
  if (legacySum > 0) return legacySum;
  return Number(assessment.pool_questions_count || 0);
}

export function formatAssessmentScheduleLabel(assessment: SelectableAssessmentItem): string {
  const rawDate = assessment.scheduled_start_time || assessment.created_at;
  if (!rawDate) return 'Unscheduled';
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return 'Unscheduled';
  const prefix = assessment.scheduled_start_time ? 'Scheduled' : 'Created';
  return `${prefix}: ${parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}
