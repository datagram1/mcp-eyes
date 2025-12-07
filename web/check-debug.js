const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    // Go to login page first
    await page.goto('https://screencontrol.knws.co.uk/login', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    console.log('On login page, logging in...');
    
    // Fill in credentials
    await page.fill('input[type="email"]', 'richard.brown@knws.co.uk');
    await page.fill('input[type="password"]', 'K3yn3tw0rk53');
    
    // Click sign in button
    await page.click('button[type="submit"]');
    
    // Wait for navigation
    await page.waitForURL('**/dashboard**', { timeout: 15000 });
    console.log('Logged in, current URL:', page.url());
    
    // Now go to debug page
    await page.goto('https://screencontrol.knws.co.uk/dashboard/debug', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    console.log('On debug page:', page.url());
    
    // Wait a moment for React to render
    await page.waitForTimeout(2000);
    
    // Check for the OAuth tab
    const oauthTab = await page.locator('text=Connect Claude / AI Clients').count();
    console.log('OAuth tab found:', oauthTab > 0);
    
    // Check for Create OAuth Client button
    const createButton = await page.locator('button:has-text("Create OAuth Client")').count();
    console.log('Create OAuth Client button found:', createButton > 0);
    
    // Check for OAuth Credentials section
    const oauthSection = await page.locator('text=OAuth Credentials').count();
    console.log('OAuth Credentials section found:', oauthSection > 0);
    
    // Take a screenshot
    await page.screenshot({ path: '/tmp/debug-page.png', fullPage: true });
    console.log('Screenshot saved to /tmp/debug-page.png');
    
    // Get visible text
    const bodyText = await page.locator('body').innerText();
    console.log('\n--- Page content preview ---');
    console.log(bodyText.substring(0, 1500));
    
  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: '/tmp/error-page.png' });
    console.log('Error screenshot saved to /tmp/error-page.png');
  }
  
  await browser.close();
})();
