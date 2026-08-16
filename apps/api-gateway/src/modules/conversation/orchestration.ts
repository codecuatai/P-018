export type WorkflowStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'PARTIAL_SUCCESS' | 'FAILED';
export type DependencyPolicy = 'STOP_DEPENDENTS' | 'CONTINUE_INDEPENDENT';
export type OrchestrationTaskStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type OrchestrationTaskInput = {
  id: string;
  phase: string;
  depends_on: string[];
};

export type OrchestrationTaskState = {
  status: OrchestrationTaskStatus;
  depends_on: string[];
  dependency_policy: DependencyPolicy;
  error_code?: string;
};

export type OrchestrationSnapshot = {
  status: WorkflowStatus;
  dependency_policy: DependencyPolicy;
  tasks: Record<string, OrchestrationTaskState>;
  updated_at: string;
};

function taskStatus(phase: string): OrchestrationTaskStatus {
  if (phase === 'COMPLETED') return 'COMPLETED';
  if (phase === 'FAILED') return 'FAILED';
  if (phase === 'IN_PROGRESS' || phase === 'AWAITING_CONFIRMATION') return 'RUNNING';
  return 'PENDING';
}

export function deriveWorkflowStatus(tasks: OrchestrationTaskInput[]): WorkflowStatus {
  if (!tasks.length) return 'PENDING';
  const statuses = tasks.map((task) => taskStatus(task.phase));
  if (statuses.every((status) => status === 'COMPLETED')) return 'COMPLETED';
  const failed = statuses.filter((status) => status === 'FAILED').length;
  const completed = statuses.filter((status) => status === 'COMPLETED').length;
  if (failed && !completed && statuses.every((status) => status === 'FAILED')) return 'FAILED';
  if (failed && (completed > 0 || statuses.some((status) => status !== 'FAILED'))) return 'PARTIAL_SUCCESS';
  if (statuses.every((status) => status === 'PENDING')) return 'PENDING';
  return 'RUNNING';
}

export function buildOrchestrationSnapshot(
  tasks: OrchestrationTaskInput[],
  errors: Record<string, string> = {},
  now = new Date().toISOString(),
): OrchestrationSnapshot {
  const taskStates = Object.fromEntries(tasks.map((task) => {
    const status = taskStatus(task.phase);
    const errorCode = errors[task.id];
    return [task.id, {
      status,
      depends_on: [...task.depends_on],
      dependency_policy: task.depends_on.length ? 'STOP_DEPENDENTS' : 'CONTINUE_INDEPENDENT',
      ...(errorCode ? { error_code: errorCode } : {}),
    } satisfies OrchestrationTaskState];
  }));
  const hasDependencies = tasks.some((task) => task.depends_on.length > 0);
  return {
    status: deriveWorkflowStatus(tasks),
    dependency_policy: hasDependencies ? 'STOP_DEPENDENTS' : 'CONTINUE_INDEPENDENT',
    tasks: taskStates,
    updated_at: now,
  };
}

export function hasFailedDependency(task: OrchestrationTaskInput, allTasks: OrchestrationTaskInput[]): boolean {
  return task.depends_on.some((dependency) => allTasks.some((candidate) => candidate.id === dependency && candidate.phase === 'FAILED'));
}
