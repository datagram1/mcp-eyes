// Test the audience validation logic directly
function validateTokenAudience(tokenAudience: string, expectedResource: string): boolean {
  const normalizedAudience = tokenAudience.replace(/\/+$/, '');
  const normalizedExpected = expectedResource.replace(/\/+$/, '');

  console.log('Normalized audience:', normalizedAudience);
  console.log('Normalized expected:', normalizedExpected);

  // Exact match
  if (normalizedAudience === normalizedExpected) {
    console.log('Exact match!');
    return true;
  }

  // Allow base path match
  if (normalizedExpected.startsWith(normalizedAudience + '/')) {
    console.log('Base path match!');
    return true;
  }

  console.log('No match');
  return false;
}

// Test with actual values from the database
const tokenAudience = 'https://screencontrol.knws.co.uk/mcp';
const expectedResource = 'https://screencontrol.knws.co.uk/mcp/cmivv9aar000310vcfp9lg0qj';

console.log('Testing audience validation:');
console.log('Token audience:', tokenAudience);
console.log('Expected resource:', expectedResource);
console.log('---');
const result = validateTokenAudience(tokenAudience, expectedResource);
console.log('---');
console.log('Result:', result ? 'VALID' : 'INVALID');
