import type { Objective, Subobjective } from "./db";
import { clamp01 } from "./format";

export function computeObjectivePercent(
  objective: Objective,
  subobjectives: Subobjective[]
): number | null {
  const target = objective.goal_target && objective.goal_target > 0
    ? objective.goal_target
    : subobjectives.length;
  if (target <= 0) return null;

  const sum = subobjectives.reduce((acc, subobjective) => (
    acc + subobjectiveContribution(subobjective)
  ), 0);
  return clamp01(sum / target);
}

function subobjectiveContribution(subobjective: Subobjective): number {
  const target = subobjective.target_total ?? 0;
  if (target > 0) return clamp01((subobjective.progress_current ?? 0) / target);
  return subobjective.is_done ? 1 : 0;
}

function formatProgressNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/**
 * Chooses the most useful label without asking the user to select a data model.
 * A single measured step keeps its exact value; simple collections use a count;
 * mixed collections fall back to a percentage.
 */
export function objectiveProgressLabel(
  objective: Objective,
  subobjectives: Subobjective[]
): string {
  const percent = computeObjectivePercent(objective, subobjectives);
  if (percent === null) return "—";

  const onlyStep = subobjectives.length === 1 ? subobjectives[0] : null;
  const onlyStepTarget = onlyStep?.target_total ?? 0;
  const plannedSteps = objective.goal_target ?? 0;
  if (onlyStep && onlyStepTarget > 1 && plannedSteps <= 1) {
    const unit = onlyStep.unit ? ` ${onlyStep.unit}` : "";
    return `${formatProgressNumber(onlyStep.progress_current ?? 0)} / ${formatProgressNumber(onlyStepTarget)}${unit}`;
  }

  const itemLike = subobjectives.every((step) => {
    const target = step.target_total ?? 0;
    return target <= 1;
  });
  if (itemLike) {
    const target = plannedSteps > 0 ? plannedSteps : subobjectives.length;
    const done = subobjectives.reduce((sum, step) => sum + subobjectiveContribution(step), 0);
    const unit = objective.goal_unit ? ` ${objective.goal_unit}` : "";
    return `${formatProgressNumber(done)} / ${formatProgressNumber(target)}${unit}`;
  }

  return `${Math.round(percent * 100)}%`;
}

export function progressLabel(
  percent: number | null,
  goalKind: string,
  goalTarget: number | null,
  goalUnit: string | null
): string {
  if (percent === null) return '—'
  if (goalKind === 'manual' || !goalTarget) {
    return `${Math.round(percent * 100)}%`
  }
  const done = Math.round(percent * goalTarget)
  const unit = goalUnit ? ` ${goalUnit}` : ''
  return `${done} / ${goalTarget}${unit}`
}

export function computeTotalMs(
  timeMap: Map<string, { total_ms: number; last_end: number | null }>
): number {
  let total = 0
  for (const { total_ms } of timeMap.values()) total += total_ms
  return total
}

export function computeLastStudiedTs(
  timeMap: Map<string, { total_ms: number; last_end: number | null }>,
  subs: ReadonlyArray<{ updated_at: number }>
): number | null {
  let max: number | null = null
  for (const { last_end } of timeMap.values()) {
    if (last_end !== null && (max === null || last_end > max)) max = last_end
  }
  for (const s of subs) {
    if (max === null || s.updated_at > max) max = s.updated_at
  }
  return max
}
