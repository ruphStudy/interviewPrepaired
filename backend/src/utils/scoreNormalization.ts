/**
 * Score Normalization Utilities
 * 
 * Ensures consistent score handling across the application:
 * - Safe parsing of numeric values
 * - Range clamping (0-10 for scores, 0-100 for percentages)
 * - Proper handling of zero scores (not treated as falsy)
 * - Rejection of NaN, Infinity, and invalid values
 */

/**
 * Normalize a score value to a valid number within range
 * 
 * @param value - The value to normalize (can be number, string, or unknown)
 * @param fallback - Default value if parsing fails (default: 0)
 * @param min - Minimum allowed value (default: 0)
 * @param max - Maximum allowed value (default: 10)
 * @returns A valid finite number within [min, max]
 */
export function normalizeScore(
  value: unknown,
  fallback = 0,
  min = 0,
  max = 10
): number {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return fallback;
  }

  // Parse to number
  const parsed = Number(value);

  // Reject NaN and Infinity
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  // Clamp to range
  return Math.min(max, Math.max(min, parsed));
}

/**
 * Normalize a percentage value (0-100 range)
 */
export function normalizePercentage(value: unknown, fallback = 0): number {
  return normalizeScore(value, fallback, 0, 100);
}

/**
 * Calculate average score from an array of scores
 * Filters out invalid values and returns a clean average
 * 
 * @param scores - Array of score values
 * @param decimalPlaces - Number of decimal places (default: 2)
 * @returns Average score rounded to specified decimal places
 */
export function calculateAverageScore(
  scores: unknown[],
  decimalPlaces = 2
): number {
  // Filter to valid finite numbers only
  const validScores = scores
    .map(s => Number(s))
    .filter(Number.isFinite);

  if (validScores.length === 0) {
    return 0;
  }

  const average = validScores.reduce((sum, score) => sum + score, 0) / validScores.length;
  
  return Number(average.toFixed(decimalPlaces));
}

/**
 * Validate and normalize evaluation dimensions
 */
export function normalizeEvaluationDimensions(
  dimensions: Array<{ name: string; label: string; score: number; description: string }>
): Array<{ name: string; label: string; score: number; description: string }> {
  return dimensions.map(dim => ({
    ...dim,
    score: normalizeScore(dim.score, 0, 0, 10),
  }));
}

/**
 * Extract numeric score from strings like "8/10" or "8.5"
 * Returns null if no valid number can be extracted
 */
export function extractNumericScore(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    // Handle "8/10" format
    const fractionMatch = value.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+)$/);
    if (fractionMatch) {
      const numerator = parseFloat(fractionMatch[1]);
      const denominator = parseFloat(fractionMatch[2]);
      if (denominator > 0) {
        return (numerator / denominator) * 10; // Normalize to 0-10 scale
      }
    }

    // Handle plain number string
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
