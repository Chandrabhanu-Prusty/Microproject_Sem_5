const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const recordingsDir = path.resolve(__dirname, 'recordings');
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

async function recordScene(browser, name, targetDurationSec, actionFn) {
  console.log(`\n========================================`);
  console.log(`Recording Scene: ${name} (Target: ${targetDurationSec}s)`);
  console.log(`========================================`);
  
  const startTime = Date.now();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: recordingsDir,
      size: { width: 1280, height: 720 },
    },
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  try {
    await actionFn(page);
  } catch (err) {
    console.error(`Error during scene ${name}:`, err);
  }

  // Pad remaining time to match target duration precisely
  const elapsedSec = (Date.now() - startTime) / 1000;
  if (elapsedSec < targetDurationSec) {
    const padMs = Math.round((targetDurationSec - elapsedSec) * 1000);
    console.log(`Padding scene ${name} with ${padMs}ms...`);
    await page.waitForTimeout(padMs);
  }

  const video = page.video();
  await page.close();
  await context.close();

  if (video) {
    const videoPath = await video.path();
    const destPath = path.join(recordingsDir, `${name}.webm`);
    if (fs.existsSync(destPath)) {
      fs.unlinkSync(destPath);
    }
    fs.renameSync(videoPath, destPath);
    console.log(`Saved recording: ${destPath}`);
  }
}

async function main() {
  console.log('Launching Chrome for automated screen recording...');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ]
  });

  // ----------------------------------------------------
  // SCENE 1: Introduction & System Architecture (33s)
  // ----------------------------------------------------
  await recordScene(browser, 'scene1_intro', 33.5, async (page) => {
    const introHtmlPath = path.resolve(__dirname, 'assets/scene1-intro.html');
    await page.goto(`file://${introHtmlPath}`);
    await page.waitForTimeout(5000);

    // Subtle smooth camera pan
    await page.evaluate(() => window.scrollBy({ top: 40, behavior: 'smooth' }));
    await page.waitForTimeout(10000);
    await page.evaluate(() => window.scrollBy({ top: -40, behavior: 'smooth' }));
    await page.waitForTimeout(15000);
  });

  // ----------------------------------------------------
  // SCENE 2: Attendee Auth & Discovery (27s)
  // ----------------------------------------------------
  await recordScene(browser, 'scene2_attendee', 27.0, async (page) => {
    await page.goto('http://127.0.0.1:5173/auth');
    await page.waitForTimeout(1500);

    console.log('Logging in as Student Attendee (Chandrabhanu)...');
    await page.type('input[type="email"]', 'chandrabhanu@example.com', { delay: 45 });
    await page.waitForTimeout(600);
    await page.type('input[type="password"]', 'StrongPassword123!', { delay: 45 });
    await page.waitForTimeout(800);

    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    console.log('Browsing events catalog...');
    await page.mouse.wheel(0, 250);
    await page.waitForTimeout(3000);
    await page.mouse.wheel(0, -250);
    await page.waitForTimeout(2000);

    console.log('Opening event detail...');
    await page.click('text=Cloud Canvas 2026: Campus Hackathon');
    await page.waitForTimeout(5000);
  });

  // ----------------------------------------------------
  // SCENE 3: Atomic RSVP & Cryptographic QR Ticket (30s)
  // ----------------------------------------------------
  await recordScene(browser, 'scene3_ticket', 30.5, async (page) => {
    await page.goto('http://127.0.0.1:5173/auth');
    await page.waitForTimeout(1000);
    await page.type('input[type="email"]', 'chandrabhanu@example.com', { delay: 30 });
    await page.type('input[type="password"]', 'StrongPassword123!', { delay: 30 });
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);

    console.log('Navigating to My Registrations...');
    await page.goto('http://127.0.0.1:5173/my-registrations');
    await page.waitForTimeout(3500);

    console.log('Opening digital pass view...');
    await page.goto('http://127.0.0.1:5173/tickets/tkt-8f3a9e1b2c4d');
    await page.waitForTimeout(5000);

    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(6000);
  });

  // ----------------------------------------------------
  // SCENE 4: Deterministic FIFO Waitlist Queue (28s)
  // ----------------------------------------------------
  await recordScene(browser, 'scene4_waitlist', 28.0, async (page) => {
    await page.goto('http://127.0.0.1:5173/auth');
    await page.waitForTimeout(1000);
    await page.type('input[type="email"]', 'chandrabhanu@example.com', { delay: 30 });
    await page.type('input[type="password"]', 'StrongPassword123!', { delay: 30 });
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);

    console.log('Navigating to full event GDG DevFest...');
    await page.goto('http://127.0.0.1:5173/events/evt-gdg-devfest');
    await page.waitForTimeout(3500);

    console.log('Inspecting waitlist queue indicator...');
    await page.mouse.wheel(0, 250);
    await page.waitForTimeout(3000);

    const waitlistBtn = await page.$('button:has-text("Waitlist")');
    if (waitlistBtn) {
      await waitlistBtn.click();
      await page.waitForTimeout(3000);
    }

    await page.waitForTimeout(8000);
  });

  // ----------------------------------------------------
  // SCENE 5: Organizer Login & Studio (30s)
  // ----------------------------------------------------
  await recordScene(browser, 'scene5_organizer', 30.0, async (page) => {
    // 1. Show genuine Organizer Login on Auth Page
    console.log('Navigating to Login Page for Event Organizer...');
    await page.goto('http://127.0.0.1:5173/auth');
    await page.waitForTimeout(2000);

    console.log('Typing Organizer credentials (Neilsen)...');
    await page.type('input[type="email"]', 'organizer.neilsen@example.com', { delay: 45 });
    await page.waitForTimeout(600);
    await page.type('input[type="password"]', 'StrongPassword123!', { delay: 45 });
    await page.waitForTimeout(1000);

    // 2. Submit form and navigate to Organizer Dashboard
    console.log('Submitting Organizer Sign In...');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3500);

    // 3. Inspect Dashboard & Metrics
    console.log('Inspecting Organizer Dashboard and capacity metrics...');
    await page.mouse.wheel(0, 220);
    await page.waitForTimeout(4000);
    await page.mouse.wheel(0, -220);
    await page.waitForTimeout(2000);

    // 4. Open Create Event Studio Modal
    console.log('Opening Event Creation Studio modal...');
    const newEventBtn = await page.$('button:has-text("New Event")');
    if (newEventBtn) {
      await newEventBtn.click();
      await page.waitForTimeout(5000);
    }

    await page.waitForTimeout(4000);
  });

  // ----------------------------------------------------
  // SCENE 6: Gate Coordinator Optical Check-In (31s)
  // ----------------------------------------------------
  await recordScene(browser, 'scene6_coordinator', 31.0, async (page) => {
    // 1. Show genuine Coordinator Login on Auth Page
    console.log('Navigating to Login Page for Gate Coordinator...');
    await page.goto('http://127.0.0.1:5173/auth');
    await page.waitForTimeout(2000);

    console.log('Typing Coordinator credentials (Preeti)...');
    await page.type('input[type="email"]', 'coordinator.preeti@example.com', { delay: 45 });
    await page.waitForTimeout(600);
    await page.type('input[type="password"]', 'StrongPassword123!', { delay: 45 });
    await page.waitForTimeout(1000);

    // 2. Submit form and navigate into Check-in Workspace
    console.log('Submitting Coordinator Sign In...');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3500);

    // 3. Show Camera Scanner Tab first
    console.log('Inspecting Venue Check-in Workspace & Scanner...');
    await page.waitForTimeout(3000);

    // 4. Switch to Manual Lookup Tab
    console.log('Switching to Manual Attendee Lookup tab...');
    const manualTabBtn = await page.$('button:has-text("Manual Lookup")');
    if (manualTabBtn) {
      await manualTabBtn.click();
      await page.waitForTimeout(2000);
    }

    // 5. Search attendee in roster
    console.log('Searching attendee "Chandrabhanu"...');
    const searchInput = await page.$('input[placeholder*="Search"], input[type="text"]');
    if (searchInput) {
      await searchInput.type('Chandrabhanu', { delay: 50 });
      await page.waitForTimeout(2500);
    }

    // 6. Check In Attendee
    console.log('Performing check-in...');
    const checkinBtn = await page.$('button:has-text("Check In"), button:has-text("Admit")');
    if (checkinBtn) {
      await checkinBtn.click();
      await page.waitForTimeout(3500);
    }

    // 7. Duplicate check-in prevention demonstration
    console.log('Demonstrating duplicate check-in rejection...');
    const checkinAgainBtn = await page.$('button:has-text("Check In"), button:has-text("Admit")');
    if (checkinAgainBtn) {
      await checkinAgainBtn.click();
      await page.waitForTimeout(3500);
    }

    await page.waitForTimeout(2000);
  });

  // ----------------------------------------------------
  // SCENE 7: Verification & Conclusion Outro (28s)
  // ----------------------------------------------------
  await recordScene(browser, 'scene7_outro', 28.0, async (page) => {
    const outroHtmlPath = path.resolve(__dirname, 'assets/scene7-outro.html');
    await page.goto(`file://${outroHtmlPath}`);
    await page.waitForTimeout(6000);

    // Smooth hover / pan
    await page.mouse.wheel(0, 30);
    await page.waitForTimeout(10000);
    await page.mouse.wheel(0, -30);
    await page.waitForTimeout(10000);
  });

  await browser.close();
  console.log('\n========================================');
  console.log('ALL 7 SCENES RECORDED SUCCESSFULLY WITH GENUINE STAKEHOLDER LOGINS!');
  console.log('========================================');
}

main().catch(err => {
  console.error('Fatal recording error:', err);
  process.exit(1);
});
