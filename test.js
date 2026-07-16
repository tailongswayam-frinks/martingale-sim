import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => {
    console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText);
  });
  page.on('response', response => {
    if (response.status() >= 400) {
      console.log('RESPONSE STATUS FAILED:', response.url(), response.status());
    }
  });

  await page.goto('http://localhost:5174/');
  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
})();
