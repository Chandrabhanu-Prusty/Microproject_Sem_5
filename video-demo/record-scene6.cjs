const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

async function main() {
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

  const recDir = path.resolve(__dirname, 'recordings');
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: recDir,
      size: { width: 1280, height: 720 }
    }
  });

  const page = await context.newPage();
  console.log('Recording Scene 6: Gate Coordinator Optical Check-In (Target: 31s)...');
  const startTime = Date.now();

  // 1. Show genuine Coordinator Login on Auth Page
  console.log('Navigating to Login Page for Gate Coordinator...');
  await page.goto('http://127.0.0.1:5173/auth');
  await page.waitForTimeout(2000);

  console.log('Typing Coordinator credentials (Preeti)...');
  await page.type('input[type="email"]', 'coordinator.preeti@example.com', { delay: 40 });
  await page.waitForTimeout(600);
  await page.type('input[type="password"]', 'StrongPassword123!', { delay: 40 });
  await page.waitForTimeout(800);

  // 2. Submit form and navigate into Check-in Workspace
  console.log('Submitting Coordinator Sign In...');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3500);

  // 3. Show Camera Scanner Tab first
  console.log('Inspecting Venue Check-in Workspace & Camera Scanner...');
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

  // 7. Scroll and inspect the verified green banner and disabled "Checked In" status
  console.log('Inspecting verified ticket status and single-use enforcement...');
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(3000);

  const elapsed = (Date.now() - startTime) / 1000;
  const target = 31.0;
  if (elapsed < target) {
    const pad = Math.ceil((target - elapsed) * 1000);
    console.log(`Padding scene 6 with ${pad}ms...`);
    await page.waitForTimeout(pad);
  }

  const video = page.video();
  await page.close();
  await context.close();
  if (video) {
    const videoFile = await video.path();
    const destPath = path.resolve(recDir, 'scene6_coordinator.webm');
    if (fs.existsSync(destPath)) {
      fs.unlinkSync(destPath);
    }
    fs.renameSync(videoFile, destPath);
    console.log(`Saved clean recording: ${destPath}`);
  }
  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
