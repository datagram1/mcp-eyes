"use strict";
/**
 * Coordinate normalization helper for converting screen coordinates to normalized values
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeXCoordinate = normalizeXCoordinate;
exports.normalizeCoordinates = normalizeCoordinates;
exports.denormalizeCoordinates = denormalizeCoordinates;
exports.isWithinTolerance = isWithinTolerance;
exports.formatCoordinate = formatCoordinate;
/**
 * Convert screen coordinates to normalized coordinates (0-1 range)
 *
 * @param regionX - X coordinate of the screenshot region
 * @param buttonX - X coordinate of the button/element within the region
 * @param appX - X coordinate of the application window
 * @param appWidth - Width of the application window
 * @returns Normalized X coordinate between 0 and 1
 */
function normalizeXCoordinate(regionX, buttonX, appX, appWidth) {
    // Handle edge case: division by zero
    if (appWidth === 0) {
        throw new Error('Application width cannot be zero');
    }
    // Calculate the absolute position of the button
    var absoluteButtonX = regionX + buttonX;
    // Calculate the relative position within the application window
    var relativeX = absoluteButtonX - appX;
    // Normalize to 0-1 range
    var normalizedX = relativeX / appWidth;
    // Clamp to valid range [0, 1]
    return Math.max(0, Math.min(1, normalizedX));
}
/**
 * Convert screen coordinates to normalized coordinates for both X and Y
 *
 * @param coords - Object containing all coordinate values
 * @returns Normalized coordinates object with x and y values
 */
function normalizeCoordinates(coords) {
    // Handle edge cases
    if (coords.appWidth === 0 || coords.appHeight === 0) {
        throw new Error('Application dimensions cannot be zero');
    }
    var x = normalizeXCoordinate(coords.regionX, coords.buttonX, coords.appX, coords.appWidth);
    // Similar calculation for Y coordinate
    var absoluteButtonY = coords.regionY + coords.buttonY;
    var relativeY = absoluteButtonY - coords.appY;
    var normalizedY = relativeY / coords.appHeight;
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
function denormalizeCoordinates(normalizedX, normalizedY, appBounds) {
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
function isWithinTolerance(actual, expected, tolerance) {
    if (tolerance === void 0) { tolerance = 1e-3; }
    return Math.abs(actual - expected) <= tolerance;
}
/**
 * Format coordinate for display with specified precision
 *
 * @param value - Coordinate value
 * @param precision - Number of decimal places (default: 3)
 * @returns Formatted string
 */
function formatCoordinate(value, precision) {
    if (precision === void 0) { precision = 3; }
    return value.toFixed(precision);
}
