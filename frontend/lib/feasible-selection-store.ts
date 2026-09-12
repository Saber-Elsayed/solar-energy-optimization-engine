type Listener = () => void;

export type RunningPlanSelection =
  | { kind: 'feasible'; combinationId: string }
  | { kind: 'or-tools' }
  | { kind: 'night-plan' };

let selection: RunningPlanSelection | null = null;
const listeners = new Set<Listener>();

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

export function getRunningPlanSelection(): RunningPlanSelection | null {
  return selection;
}

export function getFeasibleSelection(): string | null {
  return selection?.kind === 'feasible' ? selection.combinationId : null;
}

export function setFeasibleSelection(combinationId: string | null): void {
  selection = combinationId ? { kind: 'feasible', combinationId } : null;
  notifyListeners();
}

export function setOrToolsRunningPlan(): void {
  selection = { kind: 'or-tools' };
  notifyListeners();
}

export function setNightPlanRunningPlan(): void {
  selection = { kind: 'night-plan' };
  notifyListeners();
}

export function clearRunningPlanSelection(): void {
  selection = null;
  notifyListeners();
}

export function subscribeFeasibleSelection(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
