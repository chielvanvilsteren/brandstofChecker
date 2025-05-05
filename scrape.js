// scrape.js
const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/chromium-browser', // gebruik systeem-chromium
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage"
    ],
  });

  const page = await browser.newPage();

  // Gebruik realistische user agent en viewport
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36"
  );
  await page.setViewport({ width: 1920, height: 1080 });

  // Blokkeer afbeeldingen en CSS om te versnellen
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (["image", "stylesheet", "font"].includes(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });

  // Ga naar site
  await page.goto("https://www.brandstof-zoeker.nl/", {
    waitUntil: "domcontentloaded",
  });

  // console.log("Pagina geladen, aan het scrapen...");

  try {
    // Accepteer cookies
    await page.waitForSelector(".cc-btn.cc-allow", { timeout: 5000 });
    await page.click(".cc-btn.cc-allow");
  } catch {}

  try {
    // Klik op 'Is goed'
    await page.waitForSelector(".fc-primary-button", { timeout: 5000 });
    await page.click(".fc-primary-button");
  } catch {}

  // Zoek naar Deventer
  await page.type("#autoComplete", "Deventer");
  await page.keyboard.press("Enter");
  await page.waitForNavigation({ waitUntil: "domcontentloaded" });

  // Selecteer brandstof
  await page.waitForSelector('select[name="fuel"]');
  await page.select('select[name="fuel"]', "euro95");

  // Wacht tot tankstations geladen zijn
  await page.waitForSelector("#js--type-list li.list-group-item", {
    visible: true,
    timeout: 10000,
  });

  // Haal data op
  const results = await page.$$eval(
    "#js--type-list li.list-group-item",
    (stations) =>
      stations.map((station) => {
        const nameEl = station.querySelector("p.text-truncate > a");
        const priceEl = station.querySelector(
          "span.badge.bg-primary.rounded-pill.float-end.ms-1"
        );

        return {
          naam: nameEl ? nameEl.innerText.trim() : "Onbekend",
          prijs: priceEl ? priceEl.innerText.trim() : "Onbekend",
        };
      })
  );

  // Alleen JSON loggen (voor checker.js)
  console.log(JSON.stringify(results));

  // // Optioneel: mooi overzicht in terminal
  // console.table(results);

  await browser.close();
})();
