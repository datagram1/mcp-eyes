import { chromium, Browser, Page } from 'playwright';

const BASE_URL = 'https://screencontrol.knws.co.uk';
const USER_EMAIL = 'richard.brown@knws.co.uk';
const USER_PASSWORD = 'K3yn3tw0rk53';

async function runTest() {
  let browser: Browser | null = null;

  try {
    console.log('🚀 Starting OAuth visibility test...\n');

    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Step 1: Login
    console.log('📝 Step 1: Logging in...');
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Fill login form
    await page.fill('input[type="email"]', USER_EMAIL);
    await page.fill('input[type="password"]', USER_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL('**/dashboard**', { timeout: 10000 });
    console.log('✅ Login successful, redirected to:', page.url());

    // Step 2: Navigate to Connections page
    console.log('\n📝 Step 2: Navigating to connections...');
    await page.goto(`${BASE_URL}/dashboard/connections`);
    await page.waitForLoadState('networkidle');
    console.log('✅ On connections page');

    // Step 3: Find "Dev Testing" connection
    console.log('\n📝 Step 3: Looking for "Dev Testing" connection...');

    // Wait for connections to load
    await page.waitForSelector('a[href*="/dashboard/connections/"]', { timeout: 10000 }).catch(() => null);

    // Look for the Dev Testing connection
    const devTestingLink = await page.locator('a:has-text("Dev Testing")').first();
    const devTestingExists = await devTestingLink.count() > 0;

    if (!devTestingExists) {
      console.log('❌ "Dev Testing" connection NOT FOUND in the connections list!');
      console.log('\n📋 Available connections:');
      const allConnections = await page.locator('a[href*="/dashboard/connections/"]').allTextContents();
      allConnections.forEach((conn, i) => console.log(`   ${i + 1}. ${conn}`));

      // Take screenshot
      await page.screenshot({ path: '/tmp/connections-list.png', fullPage: true });
      console.log('\n📸 Screenshot saved to /tmp/connections-list.png');
      return;
    }

    console.log('✅ Found "Dev Testing" connection');

    // Step 4: Click on Dev Testing to view details
    console.log('\n📝 Step 4: Opening Dev Testing connection details...');
    await devTestingLink.click();
    await page.waitForLoadState('networkidle');
    console.log('✅ On connection detail page:', page.url());

    // Step 5: Check for OAuth credentials section
    console.log('\n📝 Step 5: Checking for OAuth credentials...');

    // Wait for page to fully load
    await page.waitForTimeout(2000);

    // Look for various OAuth-related elements
    const checks = {
      'Connect to Claude section': await page.locator('h2:has-text("Connect to Claude")').count() > 0,
      'OAuth Client ID label': await page.locator('text=OAuth Client ID').count() > 0,
      'OAuth Client Secret label': await page.locator('text=OAuth Client Secret').count() > 0,
      'MCP Server URL in credentials table': await page.locator('td:has-text("MCP Server URL")').count() > 0,
      'Regenerate Credentials button': await page.locator('button:has-text("Regenerate")').count() > 0,
    };

    console.log('\n🔍 OAuth Elements Found:');
    let allPassed = true;
    for (const [label, found] of Object.entries(checks)) {
      const status = found ? '✅' : '❌';
      console.log(`   ${status} ${label}`);
      if (!found) allPassed = false;
    }

    // Get the actual client ID if visible
    const clientIdCell = await page.locator('td:has-text("OAuth Client ID")').first();
    if (await clientIdCell.count() > 0) {
      const row = await clientIdCell.locator('..'); // parent tr
      const clientIdValue = await row.locator('code').first().textContent();
      console.log(`\n📋 OAuth Client ID: ${clientIdValue || 'Not visible'}`);
    }

    // Check if client secret shows the "Hidden" message
    const secretHidden = await page.locator('text=Hidden - click').count() > 0;
    if (secretHidden) {
      console.log('📋 OAuth Client Secret: Hidden (as expected - need to regenerate to see)');
    }

    // Take screenshot of the detail page
    await page.screenshot({ path: '/tmp/dev-testing-detail.png', fullPage: true });
    console.log('\n📸 Screenshot saved to /tmp/dev-testing-detail.png');

    // Final result
    console.log('\n' + '═'.repeat(60));
    if (allPassed) {
      console.log('✅ TEST PASSED: OAuth credentials are visible in Dev Testing connection');
    } else {
      console.log('❌ TEST FAILED: Some OAuth elements are missing');

      // Additional debugging - get page content
      console.log('\n📄 Page sections found:');
      const h2s = await page.locator('h2').allTextContents();
      h2s.forEach((h, i) => console.log(`   ${i + 1}. ${h}`));
    }
    console.log('═'.repeat(60));

  } catch (error) {
    console.error('\n❌ Test error:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run the test
runTest().catch(console.error);
