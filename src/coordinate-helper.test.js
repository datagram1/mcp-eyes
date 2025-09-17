"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCoordinateTests = runCoordinateTests;
var coordinate_helper_1 = require("./coordinate-helper");
// Test data based on expected values from debug logs
var testData = {
    testCases: [
        {
            name: "Expected case 1 - normalized X should be 0.018",
            input: {
                regionX: 100,
                buttonX: 50,
                appX: 120,
                appWidth: 1667
            },
            expected: {
                x: 0.018
            },
            tolerance: 0.001
        },
        {
            name: "Expected case 2 - normalized X should be 0.061",
            input: {
                regionX: 100,
                buttonX: 100,
                appX: 98,
                appWidth: 1667
            },
            expected: {
                x: 0.061
            },
            tolerance: 0.001
        },
        {
            name: "Edge case - button at app origin",
            input: {
                regionX: 0,
                buttonX: 0,
                appX: 0,
                appWidth: 1000
            },
            expected: {
                x: 0.0
            },
            tolerance: 0.001
        },
        {
            name: "Edge case - button at app right edge",
            input: {
                regionX: 0,
                buttonX: 1000,
                appX: 0,
                appWidth: 1000
            },
            expected: {
                x: 1.0
            },
            tolerance: 0.001
        }
    ]
};
describe('Coordinate Helper Tests', function () {
    describe('normalizeXCoordinate', function () {
        testData.testCases.forEach(function (testCase) {
            it(testCase.name, function () {
                var _a = testCase.input, regionX = _a.regionX, buttonX = _a.buttonX, appX = _a.appX, appWidth = _a.appWidth;
                var result = (0, coordinate_helper_1.normalizeXCoordinate)(regionX, buttonX, appX, appWidth);
                console.log("Test: ".concat(testCase.name));
                console.log("Input: regionX=".concat(regionX, ", buttonX=").concat(buttonX, ", appX=").concat(appX, ", appWidth=").concat(appWidth));
                console.log("Expected: ".concat(testCase.expected.x, ", Actual: ").concat(result));
                console.log("Within tolerance: ".concat((0, coordinate_helper_1.isWithinTolerance)(result, testCase.expected.x, testCase.tolerance)));
                expect((0, coordinate_helper_1.isWithinTolerance)(result, testCase.expected.x, testCase.tolerance)).toBe(true);
            });
        });
        it('should throw error for zero width', function () {
            expect(function () { return (0, coordinate_helper_1.normalizeXCoordinate)(0, 0, 0, 0); }).toThrow('Application width cannot be zero');
        });
        it('should clamp values outside 0-1 range', function () {
            // Button before app bounds
            var result1 = (0, coordinate_helper_1.normalizeXCoordinate)(0, -100, 0, 1000);
            expect(result1).toBe(0);
            // Button after app bounds
            var result2 = (0, coordinate_helper_1.normalizeXCoordinate)(0, 1500, 0, 1000);
            expect(result2).toBe(1);
        });
    });
    describe('normalizeCoordinates', function () {
        it('should normalize both X and Y coordinates', function () {
            var coords = {
                regionX: 100,
                regionY: 50,
                buttonX: 200,
                buttonY: 150,
                appX: 150,
                appY: 100,
                appWidth: 1200,
                appHeight: 800
            };
            var result = (0, coordinate_helper_1.normalizeCoordinates)(coords);
            expect((0, coordinate_helper_1.isWithinTolerance)(result.x, 0.125, 0.001)).toBe(true);
            expect((0, coordinate_helper_1.isWithinTolerance)(result.y, 0.125, 0.001)).toBe(true);
        });
        it('should throw error for zero dimensions', function () {
            var coords = {
                regionX: 0,
                regionY: 0,
                buttonX: 0,
                buttonY: 0,
                appX: 0,
                appY: 0,
                appWidth: 0,
                appHeight: 100
            };
            expect(function () { return (0, coordinate_helper_1.normalizeCoordinates)(coords); }).toThrow('Application dimensions cannot be zero');
        });
    });
    describe('denormalizeCoordinates', function () {
        it('should convert normalized coordinates back to screen coordinates', function () {
            var appBounds = { x: 100, y: 200, width: 800, height: 600 };
            var result = (0, coordinate_helper_1.denormalizeCoordinates)(0.5, 0.5, appBounds);
            expect(result.x).toBe(500); // 100 + (0.5 * 800)
            expect(result.y).toBe(500); // 200 + (0.5 * 600)
        });
    });
    describe('isWithinTolerance', function () {
        it('should correctly identify values within tolerance', function () {
            expect((0, coordinate_helper_1.isWithinTolerance)(0.018, 0.018, 0.001)).toBe(true);
            expect((0, coordinate_helper_1.isWithinTolerance)(0.0185, 0.018, 0.001)).toBe(true);
            expect((0, coordinate_helper_1.isWithinTolerance)(0.020, 0.018, 0.001)).toBe(false);
        });
        it('should use default tolerance of 1e-3', function () {
            expect((0, coordinate_helper_1.isWithinTolerance)(0.0185, 0.018)).toBe(true);
            expect((0, coordinate_helper_1.isWithinTolerance)(0.020, 0.018)).toBe(false);
        });
    });
    describe('formatCoordinate', function () {
        it('should format coordinates with specified precision', function () {
            expect((0, coordinate_helper_1.formatCoordinate)(0.018)).toBe('0.018');
            expect((0, coordinate_helper_1.formatCoordinate)(0.018456, 3)).toBe('0.018');
            expect((0, coordinate_helper_1.formatCoordinate)(0.018456, 5)).toBe('0.01846');
        });
    });
});
// Export test runner for non-Jest environments
function runCoordinateTests() {
    console.log('Running coordinate mapping tests...\n');
    testData.testCases.forEach(function (testCase) {
        var _a = testCase.input, regionX = _a.regionX, buttonX = _a.buttonX, appX = _a.appX, appWidth = _a.appWidth;
        var result = (0, coordinate_helper_1.normalizeXCoordinate)(regionX, buttonX, appX, appWidth);
        var passed = (0, coordinate_helper_1.isWithinTolerance)(result, testCase.expected.x, testCase.tolerance);
        console.log("Test: ".concat(testCase.name));
        console.log("  Input: regionX=".concat(regionX, ", buttonX=").concat(buttonX, ", appX=").concat(appX, ", appWidth=").concat(appWidth));
        console.log("  Expected: ".concat(testCase.expected.x));
        console.log("  Actual: ".concat((0, coordinate_helper_1.formatCoordinate)(result)));
        console.log("  Status: ".concat(passed ? '✅ PASSED' : '❌ FAILED'));
        console.log('');
    });
}
