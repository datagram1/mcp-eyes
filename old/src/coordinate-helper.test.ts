import {
  normalizeXCoordinate,
  normalizeCoordinates,
  denormalizeCoordinates,
  isWithinTolerance,
  formatCoordinate
} from './coordinate-helper';

// Test data based on expected values from debug logs
const testData = {
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

describe('Coordinate Helper Tests', () => {
  describe('normalizeXCoordinate', () => {
    testData.testCases.forEach(testCase => {
      it(testCase.name, () => {
        const { regionX, buttonX, appX, appWidth } = testCase.input;
        const result = normalizeXCoordinate(regionX, buttonX, appX, appWidth);
        
        console.log(`Test: ${testCase.name}`);
        console.log(`Input: regionX=${regionX}, buttonX=${buttonX}, appX=${appX}, appWidth=${appWidth}`);
        console.log(`Expected: ${testCase.expected.x}, Actual: ${result}`);
        console.log(`Within tolerance: ${isWithinTolerance(result, testCase.expected.x, testCase.tolerance)}`);
        
        expect(isWithinTolerance(result, testCase.expected.x, testCase.tolerance)).toBe(true);
      });
    });

    it('should throw error for zero width', () => {
      expect(() => normalizeXCoordinate(0, 0, 0, 0)).toThrow('Application width cannot be zero');
    });

    it('should clamp values outside 0-1 range', () => {
      // Button before app bounds
      const result1 = normalizeXCoordinate(0, -100, 0, 1000);
      expect(result1).toBe(0);

      // Button after app bounds
      const result2 = normalizeXCoordinate(0, 1500, 0, 1000);
      expect(result2).toBe(1);
    });
  });

  describe('normalizeCoordinates', () => {
    it('should normalize both X and Y coordinates', () => {
      const coords = {
        regionX: 100,
        regionY: 50,
        buttonX: 200,
        buttonY: 150,
        appX: 150,
        appY: 100,
        appWidth: 1200,
        appHeight: 800
      };

      const result = normalizeCoordinates(coords);
      
      expect(isWithinTolerance(result.x, 0.125, 0.001)).toBe(true);
      expect(isWithinTolerance(result.y, 0.125, 0.001)).toBe(true);
    });

    it('should throw error for zero dimensions', () => {
      const coords = {
        regionX: 0,
        regionY: 0,
        buttonX: 0,
        buttonY: 0,
        appX: 0,
        appY: 0,
        appWidth: 0,
        appHeight: 100
      };

      expect(() => normalizeCoordinates(coords)).toThrow('Application dimensions cannot be zero');
    });
  });

  describe('denormalizeCoordinates', () => {
    it('should convert normalized coordinates back to screen coordinates', () => {
      const appBounds = { x: 100, y: 200, width: 800, height: 600 };
      const result = denormalizeCoordinates(0.5, 0.5, appBounds);
      
      expect(result.x).toBe(500); // 100 + (0.5 * 800)
      expect(result.y).toBe(500); // 200 + (0.5 * 600)
    });
  });

  describe('isWithinTolerance', () => {
    it('should correctly identify values within tolerance', () => {
      expect(isWithinTolerance(0.018, 0.018, 0.001)).toBe(true);
      expect(isWithinTolerance(0.0185, 0.018, 0.001)).toBe(true);
      expect(isWithinTolerance(0.020, 0.018, 0.001)).toBe(false);
    });

    it('should use default tolerance of 1e-3', () => {
      expect(isWithinTolerance(0.0185, 0.018)).toBe(true);
      expect(isWithinTolerance(0.020, 0.018)).toBe(false);
    });
  });

  describe('formatCoordinate', () => {
    it('should format coordinates with specified precision', () => {
      expect(formatCoordinate(0.018)).toBe('0.018');
      expect(formatCoordinate(0.018456, 3)).toBe('0.018');
      expect(formatCoordinate(0.018456, 5)).toBe('0.01846');
    });
  });
});

// Export test runner for non-Jest environments
export function runCoordinateTests() {
  console.log('Running coordinate mapping tests...\n');
  
  testData.testCases.forEach(testCase => {
    const { regionX, buttonX, appX, appWidth } = testCase.input;
    const result = normalizeXCoordinate(regionX, buttonX, appX, appWidth);
    const passed = isWithinTolerance(result, testCase.expected.x, testCase.tolerance);
    
    console.log(`Test: ${testCase.name}`);
    console.log(`  Input: regionX=${regionX}, buttonX=${buttonX}, appX=${appX}, appWidth=${appWidth}`);
    console.log(`  Expected: ${testCase.expected.x}`);
    console.log(`  Actual: ${formatCoordinate(result)}`);
    console.log(`  Status: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log('');
  });
}