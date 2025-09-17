/**
 * Coordinate normalization helper for converting screen coordinates to normalized values
 */

export interface ScreenCoordinates {
  regionX: number;    // X coordinate of the screenshot region
  buttonX: number;    // X coordinate of the button/element within the region
  appX: number;       // X coordinate of the application window
  appWidth: number;   // Width of the application window
}

export interface NormalizedCoordinate {
  x: number;  // Normalized X coordinate (0-1)
  y: number;  // Normalized Y coordinate (0-1)
}

/**
 * Convert screen coordinates to normalized coordinates (0-1 range)
 * 
 * @param regionX - X coordinate of the screenshot region
 * @param buttonX - X coordinate of the button/element within the region
 * @param appX - X coordinate of the application window
 * @param appWidth - Width of the application window
 * @returns Normalized X coordinate between 0 and 1
 */
export function normalizeXCoordinate(
  regionX: number,
  buttonX: number,
  appX: number,
  appWidth: number
): number {
  // Handle edge case: division by zero
  if (appWidth === 0) {
    throw new Error('Application width cannot be zero');
  }

  // Calculate the absolute position of the button
  const absoluteButtonX = regionX + buttonX;
  
  // Calculate the relative position within the application window
  const relativeX = absoluteButtonX - appX;
  
  // Normalize to 0-1 range
  const normalizedX = relativeX / appWidth;
  
  // Clamp to valid range [0, 1]
  return Math.max(0, Math.min(1, normalizedX));
}

/**
 * Convert screen coordinates to normalized coordinates for both X and Y
 * 
 * @param coords - Object containing all coordinate values
 * @returns Normalized coordinates object with x and y values
 */
export function normalizeCoordinates(coords: {
  regionX: number;
  regionY: number;
  buttonX: number;
  buttonY: number;
  appX: number;
  appY: number;
  appWidth: number;
  appHeight: number;
}): NormalizedCoordinate {
  // Handle edge cases
  if (coords.appWidth === 0 || coords.appHeight === 0) {
    throw new Error('Application dimensions cannot be zero');
  }

  const x = normalizeXCoordinate(coords.regionX, coords.buttonX, coords.appX, coords.appWidth);
  
  // Similar calculation for Y coordinate
  const absoluteButtonY = coords.regionY + coords.buttonY;
  const relativeY = absoluteButtonY - coords.appY;
  const normalizedY = relativeY / coords.appHeight;
  
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, normalizedY))
  };
}

/**
 * Convert normalized coordinates back to screen coordinates
 * 
 * @param normalizedX - Normalized X coordinate (0-1)
 * @param normalizedY - Normalized Y coordinate (0-1)
 * @param appBounds - Application window bounds
 * @returns Absolute screen coordinates
 */
export function denormalizeCoordinates(
  normalizedX: number,
  normalizedY: number,
  appBounds: { x: number; y: number; width: number; height: number }
): { x: number; y: number } {
  return {
    x: appBounds.x + (normalizedX * appBounds.width),
    y: appBounds.y + (normalizedY * appBounds.height)
  };
}

/**
 * Validate if normalized coordinates are within expected tolerance
 * 
 * @param actual - Actual normalized value
 * @param expected - Expected normalized value
 * @param tolerance - Acceptable tolerance (default: 1e-3)
 * @returns true if within tolerance
 */
export function isWithinTolerance(
  actual: number,
  expected: number,
  tolerance: number = 1e-3
): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

/**
 * Format coordinate for display with specified precision
 * 
 * @param value - Coordinate value
 * @param precision - Number of decimal places (default: 3)
 * @returns Formatted string
 */
export function formatCoordinate(value: number, precision: number = 3): string {
  return value.toFixed(precision);
}