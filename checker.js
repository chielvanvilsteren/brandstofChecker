// checker.js
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const nodemailer = require("nodemailer");
require("dotenv").config();

const RESULTS_FILE = path.resolve(__dirname, "last-result.json");

// Functie om huidige prijzen op te halen
async function getLatestPrices() {
  return new Promise((resolve, reject) => {
    exec("node scrape.js", (error, stdout, stderr) => {
      if (error) {
        return reject(`Fout bij uitvoeren scraper: ${error.message}`);
      }

      // Probeer direct te parsen als JSON
      try {
        const result = JSON.parse(stdout);
        return resolve(result);
      } catch (e) {
        console.warn("Directe JSON-parse mislukt, probeer regex...");
      }

      // Zoek met regex naar eerste geldige JSON-array/object
      const match = stdout.match(/(\$$[\s\S]*\$|{[\s\S]*})/);
      if (!match) {
        return reject("Geen geldige JSON gevonden in output.");
      }

      try {
        const result = JSON.parse(match[0]);
        resolve(result);
      } catch (e) {
        reject(`Kan JSON niet parsen: ${e.message}`);
      }
    });
  });
}

// Lees vorige resultaten
function getLastPrices() {
  if (fs.existsSync(RESULTS_FILE)) {
    const data = fs.readFileSync(RESULTS_FILE, "utf8");
    return JSON.parse(data);
  }
  return null;
}

// Sla nieuwe resultaten op
function savePrices(prices) {
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(prices, null, 2), "utf8");
}

// Stuur notificatie via e-mail
function sendNotification(oldResults, newResults, forceSend = false) {
  let htmlMessage = "<h2>⛽ Brandstofprijzen gecontroleerd</h2>";

  // Controleer of er verandering is
  const changed =
    oldResults && JSON.stringify(oldResults) !== JSON.stringify(newResults);

  if (changed) {
    htmlMessage += "<p>De volgende tankstations hebben nieuwe prijzen:</p><ul>";

    const lines = newResults.map((station, index) => {
      const oldPrice = oldResults[index]?.prijs;
      const newPrice = station.prijs;

      if (oldPrice && oldPrice !== newPrice) {
        return `<li><strong>${station.naam}</strong>: <del>${oldPrice}</del> → <ins>${newPrice}</ins></li>`;
      }
      return "";
    });

    htmlMessage += lines.join("") + "</ul>";
  } else {
    htmlMessage +=
      "<p>✅ Er zijn geen prijsveranderingen vandaag. Huidige prijzen:</p><ul>";

    // Voeg alle tankstations toe aan de e-mail
    newResults.forEach((station) => {
      htmlMessage += `<li><strong>${station.naam}</strong>: ${station.prijs}</li>`;
    });

    htmlMessage += "</ul>";
  }

  htmlMessage +=
    "<hr><small>Dit bericht is automatisch gegenereerd door de brandstofprijschecker.</small>";

  // Maak transporter
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: `"Brandstof Checker" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_TO,
    subject: changed
      ? "⚠️ Brandstofprijs gewijzigd!"
      : "✅ Geen prijsveranderingen",
    html: htmlMessage,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("❌ Kon e-mail niet verzenden:", error.message);
    } else {
      console.log(`📩 E-mail succesvol verzonden naar:`, process.env.EMAIL_TO);
      console.log("📨 SMTP-response:", info.response);
    }
  });
}

// Hoofdfunctie
async function runCheck() {
  try {
    const newResults = await getLatestPrices();
    const oldResults = getLastPrices();

    // Optioneel: stuur altijd een e-mail, ook zonder veranderingen
    const SEND_ALWAYS = true;

    if (!oldResults) {
      console.log("📌 Eerste keer uitgevoerd — sla huidige prijzen op.");
      savePrices(newResults);
      sendNotification([], newResults, true); // Stuur "eerste meting"-mail
      return;
    }

    if (JSON.stringify(oldResults) !== JSON.stringify(newResults)) {
      console.log("🔔 Prijsverandering gedetecteerd!");
      sendNotification(oldResults, newResults);
    } else {
      console.log("✅ Geen prijsveranderingen.");
      if (SEND_ALWAYS) {
        console.log("📧 Verstuur bevestigingsmail zonder wijzigingen...");
        sendNotification(oldResults, newResults, true);
      }
    }

    savePrices(newResults);
  } catch (err) {
    console.error("Er ging iets mis:", err.message);
  }
}

runCheck();
