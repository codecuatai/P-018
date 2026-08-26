import { estimateTokenCostUsd } from '../src/modules/core/token-pricing.util';

describe('estimateTokenCostUsd', () => {
  it('calculates cost for gemini-1.5-flash correctly', () => {
    // 1000 prompt tokens * $0.075 / 1M = $0.000075
    // 500 completion tokens * $0.30 / 1M = $0.000150
    // Total = $0.000225
    const cost = estimateTokenCostUsd('gemini-1.5-flash', 1000, 500);
    expect(cost).toBe(0.000225);
  });

  it('calculates cost for gemini-2.5-flash correctly', () => {
    const cost = estimateTokenCostUsd('gemini-2.5-flash', 10000, 2000);
    // 10000 * 0.075 / 1M = 0.00075
    // 2000 * 0.30 / 1M = 0.0006
    // Total = 0.00135
    expect(cost).toBe(0.00135);
  });

  it('calculates cost for gemini-1.5-pro correctly', () => {
    // 1000 prompt tokens * $1.25 / 1M = $0.00125
    // 500 completion tokens * $5.00 / 1M = $0.0025
    // Total = $0.00375
    const cost = estimateTokenCostUsd('gemini-1.5-pro', 1000, 500);
    expect(cost).toBe(0.00375);
  });

  it('calculates cost for flash-lite correctly', () => {
    // 1000 prompt * 0.0375/1M = 0.0000375
    // 1000 completion * 0.15/1M = 0.00015
    // Total = 0.0001875
    const cost = estimateTokenCostUsd('gemini-2.0-flash-lite', 1000, 1000);
    expect(cost).toBe(0.0001875);
  });

  it('handles 0 tokens gracefully', () => {
    const cost = estimateTokenCostUsd('gemini-1.5-flash', 0, 0);
    expect(cost).toBe(0);
  });
});
