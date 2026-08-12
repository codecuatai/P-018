import { buildOrchestrationSnapshot, deriveWorkflowStatus, hasFailedDependency } from '../src/modules/conversation/orchestration';

describe('multi-service orchestration policy', () => {
  it('keeps a restaurant-to-ride dependency blocked when the restaurant fails', () => {
    const tasks = [
      { id: 'restaurant', phase: 'FAILED', depends_on: [] },
      { id: 'ride', phase: 'PLANNING', depends_on: ['restaurant'] },
    ];
    expect(hasFailedDependency(tasks[1], tasks)).toBe(true);
    expect(deriveWorkflowStatus(tasks)).toBe('PARTIAL_SUCCESS');
    expect(buildOrchestrationSnapshot(tasks).tasks.ride.dependency_policy).toBe('STOP_DEPENDENTS');
  });

  it('reports healthcare success plus ride failure as partial success', () => {
    const tasks = [
      { id: 'healthcare', phase: 'COMPLETED', depends_on: [] },
      { id: 'ride', phase: 'FAILED', depends_on: ['healthcare'] },
    ];
    expect(deriveWorkflowStatus(tasks)).toBe('PARTIAL_SUCCESS');
  });

  it('allows independent tasks to continue while another task fails', () => {
    const tasks = [
      { id: 'food', phase: 'IN_PROGRESS', depends_on: [] },
      { id: 'healthcare', phase: 'FAILED', depends_on: [] },
    ];
    const snapshot = buildOrchestrationSnapshot(tasks);
    expect(snapshot.status).toBe('PARTIAL_SUCCESS');
    expect(snapshot.tasks.food.dependency_policy).toBe('CONTINUE_INDEPENDENT');
  });
});
