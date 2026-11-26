const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const screenshotDir = path.resolve(__dirname, '../docs/images/screenshots');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function run() {
  console.log('Launching Chrome with Playwright...');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 },
    deviceScaleFactor: 1.5,
  });

  const page = await context.newPage();

  // 1. Public Event Catalog (logged out or default)
  console.log('1. Capturing Event Catalog...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotDir, '01_event_catalog.png'), fullPage: false });

  // 2. Event Detail - Cloud Canvas Hackathon
  console.log('2. Capturing Event Detail...');
  await page.goto('http://127.0.0.1:5173/events/evt-ccl-hackathon-2026', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotDir, '02_event_detail.png'), fullPage: false });

  // 3. Set Attendee Auth in LocalStorage
  console.log('Setting Attendee auth in localStorage...');
  await page.evaluate(() => {
    localStorage.setItem('marque_auth_token', 'mock-token-attendee-demo');
    localStorage.setItem('marque_auth_user', JSON.stringify({
      userId: 'usr-attendee-demo',
      email: 'chandrabhanu@example.com',
      name: 'Chandrabhanu Prusty',
      role: 'ATTENDEE'
    }));
  });

  // 4. Attendee My Registrations Page
  console.log('4. Capturing My Registrations...');
  await page.goto('http://127.0.0.1:5173/my-rsvps', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotDir, '03_my_registrations.png'), fullPage: false });

  // 5. Standalone Ticket Page with QR Code
  console.log('5. Capturing Ticket QR Code...');
  await page.goto('http://127.0.0.1:5173/tickets/tkt-8f3a9e1b2c4d', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotDir, '04_ticket_qr.png'), fullPage: false });

  // 6. Waitlist Event Detail (Full Event)
  console.log('6. Capturing Waitlist Event Detail...');
  await page.goto('http://127.0.0.1:5173/events/evt-gdg-devfest', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotDir, '05_waitlist_event.png'), fullPage: false });

  // 7. Set Organizer Auth in LocalStorage
  console.log('Setting Organizer auth in localStorage...');
  await page.evaluate(() => {
    localStorage.setItem('marque_auth_token', 'mock-token-organizer-01');
    localStorage.setItem('marque_auth_user', JSON.stringify({
      userId: 'usr-organizer-01',
      email: 'organizer.neilsen@example.com',
      name: 'Chandrabhanu Prusty (Organizer)',
      role: 'ORGANIZER'
    }));
  });

  // 8. Organizer Studio
  console.log('8. Capturing Organizer Studio...');
  await page.goto('http://127.0.0.1:5173/studio', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotDir, '06_organizer_studio.png'), fullPage: false });

  // 9. Coordinator Check-in Scanner
  console.log('9. Capturing Coordinator Check-in Scanner...');
  await page.goto('http://127.0.0.1:5173/events/evt-ccl-hackathon-2026/checkin', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(screenshotDir, '07_coordinator_checkin.png'), fullPage: false });

  await browser.close();
  console.log('All screenshots captured successfully!');
}

run().catch(err => {
  console.error('Error capturing screenshots:', err);
  process.exit(1);
});
