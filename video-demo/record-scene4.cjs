const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

async function main() {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
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
  console.log('Recording Scene 4 (Waitlist Queue)...');
  const startTime = Date.now();

  await page.goto('http://127.0.0.1:5173/auth');
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    localStorage.setItem('marque_auth_token', 'mock-jwt-token-attendee');
    localStorage.setItem('marque_auth_user', JSON.stringify({
      userId: 'usr-attendee-demo',
      name: 'Chandrabhanu Prusty',
      email: 'chandrabhanu@example.com',
      role: 'ATTENDEE'
    }));
  });

  console.log('Navigating to full event...');
  await page.goto('http://127.0.0.1:5173/events/evt-gdg-devfest');
  await page.waitForTimeout(4000);

  console.log('Scrolling to waitlist & capacity quota...');
  await page.mouse.wheel(0, 260);
  await page.waitForTimeout(4000);

  const waitlistBtn = await page.$('button:has-text("Waitlist")');
  if (waitlistBtn) {
    console.log('Clicking join waitlist...');
    await waitlistBtn.click();
    await page.waitForTimeout(4000);
  }

  // Smooth browsing of waitlist status
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(4000);

  const elapsed = (Date.now() - startTime) / 1000;
  const target = 28.0;
  if (elapsed < target) {
    const pad = Math.ceil((target - elapsed) * 1000);
    console.log(`Padding scene 4 with ${pad}ms...`);
    await page.waitForTimeout(pad);
  }

  const video = page.video();
  await page.close();
  await context.close();
  if (video) {
    const videoFile = await video.path();
    const destPath = path.resolve(recDir, 'scene4_waitlist.webm');
    if (fs.existsSync(destPath)) {
      fs.unlinkSync(destPath);
    }
    fs.renameSync(videoFile, destPath);
    console.log(`Scene 4 saved to: ${destPath}`);
  }
  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
