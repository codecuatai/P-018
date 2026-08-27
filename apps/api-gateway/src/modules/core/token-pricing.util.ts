/**
 * Calculates estimated USD cost for a given model and token counts.
 * Uses standard Google Gemini pricing:
 * - Gemini 1.5 Flash / 2.0 Flash / 2.5 Flash: $0.075 / 1M input, $0.30 / 1M output
 * - Gemini Flash-Lite: $0.0375 / 1M input, $0.15 / 1M output
 * - Gemini 1.5 Pro: $1.25 / 1M input, $5.00 / 1M output
 * - Default: $0.075 / 1M input, $0.30 / 1M output
 */
export function estimateTokenCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const normalized = (model || '').toLowerCase();
  let inputRatePerMillion = 0.075;
  let outputRatePerMillion = 0.30;

  if (normalized.includes('pro')) {
    inputRatePerMillion = 1.25;
    outputRatePerMillion = 5.0;
  } else if (normalized.includes('flash-lite') || normalized.includes('lite')) {
    inputRatePerMillion = 0.0375;
    outputRatePerMillion = 0.15;
  } else if (normalized.includes('flash')) {
    inputRatePerMillion = 0.075;
    outputRatePerMillion = 0.30;
  }

  const cost =
    (promptTokens * inputRatePerMillion + completionTokens * outputRatePerMillion) / 1_000_000;
  return Number(cost.toFixed(8));
}
