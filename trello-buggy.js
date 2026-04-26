const fs = require('fs');
// const { app } = require("electron");
const path = require('path');

let electronApp = null;
let isElectron = false;
let isPackaged = false;



try {
  const electron = require("electron");
  electronApp = electron.app;
  isElectron = true;
  isPackaged = electronApp?.isPackaged ?? false;
} catch {
  // Pokrenuto iz CLI-a (node index.js)
}

function getBasePath() {
  // 📦 ELECTRON BUILD (exe)
  if (isElectron && isPackaged) {
    // resources folder
    const resourcesPath = process.resourcesPath;

    // .env i json fileovi su OUTSIDE app.asar
    // => jedan level iznad resources/app.asar
    return path.join(resourcesPath);
  }

  // 🧪 ELECTRON DEV
  if (isElectron && !isPackaged) {
    return __dirname;
  }

  // 💻 CLI RUN
  return process.cwd();
}

function getDataPath(filename) {
  return path.join(getBasePath(), filename);
}

// require("dotenv").config({
//   path: getEnvPath(),
// });

function getEnvPath() {
  // 📦 packaged exe
  if (isElectron && isPackaged) {
    return path.join(process.resourcesPath, ".env");
  }

  // dev + CLI
  return path.join(getBasePath(), ".env");
}

require("dotenv").config({
  path: getEnvPath(),
});

const axios = require('axios');
const log  = require('console');
const FormData = require('form-data');

const TRELLO_KEY = process.env.TRELLO_API_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const LIST_ID = process.env.TRELLO_LIST_ID;
const BOARD_ID = process.env.TRELLO_BOARD_ID;

// console.log("ENV PATH:", getEnvPath());
// console.log("TRELLO_KEY:", process.env.TRELLO_API_KEY ? "OK" : "MISSING");
// console.log("LIST_ID:", process.env.TRELLO_LIST_ID);

let app;
try {
  // probaj importat electron app ako postoji
  ({ app } = require("electron"));
} catch (e) {
  app = null; // fallback ako se pokreće iz CLI-a
}

const dataFile = readJSONSafe("data.json", { reservations: [] });
const reservations = dataFile.reservations;

const configPath = getDataPath("config.json");
const logFile = getDataPath("log.txt");


const cron = require('node-cron');
const readline = require('readline');
const _ = require('lodash');
const { fetchReservations, previewDataFromAPI, previewRawAPI } = require('./rentlio');

function updateConfig(newConfig) {
  writeJSONSafe("config.json", newConfig);
  config = newConfig;
}

// 📖 UČITAJ CONFIG
let config = loadConfig();
let isCreatingCards = false; // sprječava overlap

//STARI AUTOSYNC
// async function autoSync() {
//   try {
//     const now = now();
//     const currentMonth = now.getMonth() + 1; // 1-12
//     config = loadConfig();
//     const trackedMonth = config.monthTracker;

//     if (currentMonth !== trackedMonth && !isCreatingCards) {
//       console.log(`🗓️ Novi mjesec (${currentMonth}) otkriven! - Kreiram kartice`);
//       logText(`🗓️ Novi mjesec (${currentMonth}) otkriven — pokrećem izradu kartica...`);

//       isCreatingCards = true;

//       // 📁 Arhiviraj stare kartice + preimenuj listu
//       await archiveAndRenameList(currentMonth);

//       // 🃏 Kreiraj nove kartice
//       await createCardsForCurrentMonth();

//       // 🔁 Ažuriraj config
//       config.monthTracker = currentMonth;
//       updateConfig(config);

//       isCreatingCards = false;

//       console.log("✅ Novi mjesec kreiran i config ažuriran.");
//       logText(`✅ Novi mjesec kreiran i config ažuriran na ${currentMonth}.`);
//     } else {
//       // 🔄 Samo provjeri updatee (ako nije novi mjesec)
//       console.log("🔄 Pokrećem sinkronizaciju s Rentlio API-jem...");
//       await checkForUpdates();
//     }
//   } catch (err) {
//     console.error("❌ Greška u autoSync:", err.message);
//     logText(`❌ Greška u autoSync: ${err.message}`);
//     isCreatingCards = false;
//   }
// }

async function createMonth(monthNumber) {
  console.log(`🃏 Kreiram kartice za mjesec ${monthNumber}`);
  await createCardsForMonth(monthNumber);
}

async function syncMonth(monthNumber) {
  console.log(`🔄 Sync mjeseca ${monthNumber}`);
  await checkForUpdates(monthNumber);
}

async function archiveMonth(monthNumber) {
  console.log(`📦 Arhiviram mjesec ${monthNumber}`);
  await archiveAndRenameList(monthNumber);
}

function getMonthKey(month, year) {
  return `${month}-${year}`;
}

function getMonthName(month, year) {
  return new Date(year, month - 1)
    .toLocaleString("en-US", { month: "long" }) + " " + year;
}


function getListIdForMonth(month, year) {
  config = loadConfig();
  return config.trelloLists?.[getMonthKey(month, year)];
}

function saveListIdForMonth(month, year, listId) {
  config = loadConfig();
  if (!config.trelloLists) config.trelloLists = {};
  config.trelloLists[getMonthKey(month, year)] = listId;
  updateConfig(config);
}

function getToday() {
  // reload config svaki put → možeš mijenjati dok app radi
  config = loadConfig();

  if (config.debugDate) {
    console.log("🧪 DEBUG DATE ACTIVE:", config.debugDate);
    return new Date(config.debugDate);
  }

  return now();
}

async function autoSync() {
      try {
        const today = getToday(); // debugDate aware
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const monthKey = `${year}-${String(month).padStart(2,"0")}`;

    config = loadConfig();

    const hasCurrentMonthList = config.trelloLists?.[monthKey];

    // 🟢 FIRST RUN / MISMATCH FIX
    if (!hasCurrentMonthList || config.monthTracker !== month) {
      console.log("🆕 FIRST RUN DETECTED → kreiram trenutni mjesec");

      const listId = await createTrelloListForMonth(year, month);
      await createCardsForMonth(year, month, listId);

      config.monthTracker = month;
      config.trelloLists[monthKey] = listId;
      updateConfig(config);

      console.log("✅ Current month inicijaliziran.");
      return; // VERY IMPORTANT → prekini dalje logike
    }

    const daysInMonth = new Date(year, currentMonth, 0).getDate();
    const daysLeft = daysInMonth - today;

    // 🟡 5 DANA PRIJE → dual mode
    if (daysLeft <= 5 && !config.dualMode) {
      console.log("🟡 Ulazim u DUAL MONTH MODE");

      await ensureMonthReady(nextMonth, year);

      config.dualMode = true;
      config.nextMonth = nextMonth;
      updateConfig(config);
    }

    // 🔵 DUAL MODE → update oba mjeseca
    if (config.dualMode) {
      console.log("🔵 Dual mode sync");

      await checkForUpdates(currentMonth, year);
      await checkForUpdates(nextMonth, year);
    }
    // 🟢 Normal mode → update samo current
    else {
      await checkForUpdates(currentMonth, year);
    }

    // 🟣 1. U MJESECU → arhiviraj stari
    if (today === 1 && config.dualMode) {
      console.log("🟣 Novi mjesec — gasim dual mode");

      await archiveAndRenameList(currentMonth - 1 || 12, year);

      config.dualMode = false;
      config.currentMonth = currentMonth;
      delete config.trelloLists[getMonthKey(currentMonth - 1 || 12, year)];

      updateConfig(config);
    }

  } catch (err) {
    console.error("❌ Greška u autoSync:", err.message);
  }
}



function readJSONSafe(filename, fallback) {
  try {
    const filePath = getDataPath(filename);
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error("❌ JSON read error:", filename, err.message);
    return fallback;
  }
}

function writeJSONSafe(filename, data) {
  try {
    fs.writeFileSync(
      getDataPath(filename),
      JSON.stringify(data, null, 2),
      "utf8"
    );
  } catch (err) {
    console.error("❌ JSON write error:", filename, err.message);
  }
}

function loadConfig() {
  return readJSONSafe("config.json", {
    currentMonth: 0,
    nextMonth: 0,
    dualMode: false,
    refreshMinutes: 3,
  });
}





// function getDataPath(filename = "data.json") {
//   // Ako je electron i app definiran
//   if (app && app.isPackaged) {
//     return path.join(process.resourcesPath, filename);
//   }
//   // fallback: Node CLI ili nepakiran Electron
//   return path.join(__dirname, filename);
// }

async function ensureMonthReady(month, year) {
  // 1️⃣ kreiraj listu ako ne postoji
  await createTrelloListForMonth(month, year);

  // 2️⃣ kreiraj kartice za mjesec
  await createCardsForMonth(month, year);
}

async function createTrelloListForMonth(monthNumber, year = now().getFullYear()) {
  try {
    const monthKey = getMonthKey(monthNumber, year);
    const existingList = getListIdForMonth(monthNumber, year);

    // ako lista već postoji → ništa ne radi
    if (existingList) {
      console.log(`📋 Lista za ${monthKey} već postoji`);
      return existingList;
    }

    const listName = getMonthName(monthNumber, year);
    console.log(`🆕 Kreiram Trello listu: ${listName}`);

    const res = await axios.post(
      "https://api.trello.com/1/lists",
      null,
      {
        params: {
          name: listName,
          idBoard: BOARD_ID,
          pos: "bottom",
          key: TRELLO_KEY,
          token: TRELLO_TOKEN,
        },
      }
    );

    const newListId = res.data.id;

    console.log(`✅ Kreirana lista ${listName} (${newListId})`);

    // spremi u config
    saveListIdForMonth(monthNumber, year, newListId);

    return newListId;
  } catch (err) {
    console.error("❌ Greška kod kreiranja Trello liste:", err.response?.data || err.message);
  }
}

// 📦 Dummy funkcija (preimenuj listu + arhiviraj stare kartice)
async function archiveAndRenameList(monthNumber, year = now().getFullYear()) {
  try {
    const listId = getListIdForMonth(monthNumber, year);
    if (!listId) {
      console.log("⚠️ Lista za mjesec ne postoji → preskačem arhiviranje");
      return;
    }

    const monthName = new Date(year, monthNumber - 1)
      .toLocaleString("en-US", { month: "long" });

    console.log(`📦 Arhiviram listu ${monthName}`);

    const cardsRes = await axios.get(
      `https://api.trello.com/1/lists/${listId}/cards`,
      { params: { key: TRELLO_KEY, token: TRELLO_TOKEN } }
    );

    for (const card of cardsRes.data) {
      await axios.put(
        `https://api.trello.com/1/cards/${card.id}/closed`,
        null,
        { params: { key: TRELLO_KEY, token: TRELLO_TOKEN, value: true } }
      );
      await sleep(250);
    }

    await axios.put(
      `https://api.trello.com/1/lists/${listId}/closed`,
      null,
      { params: { key: TRELLO_KEY, token: TRELLO_TOKEN, value: true } }
    );

    console.log(`✅ Lista ${monthName} arhivirana`);
  } catch (err) {
    console.error("❌ Archive error:", err.response?.data || err.message);
  }
}


// 🕒 SCHEDULE
console.log(`🚀 Program pokrenut! Refresh svakih ${config.refreshMinutes} minuta.`);

// Pokreni odmah pri startu
autoSync();
// fetchReservations();

// Zatim svaka X minuta (iz config.json)
cron.schedule(`*/${config.refreshMinutes} * * * *`, async () => {
  if (!isCreatingCards) {
    await autoSync();
  } else {
    console.log("⏸️ Pauzirano — izrada kartica u tijeku.");
  }
});

//fetchReservations("newData.json");

function getMonthInfo() {
  const now = now();

  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const lastDayOfMonth = new Date(currentYear, currentMonth, 0).getDate();
  const daysLeft = lastDayOfMonth - now.getDate();

  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;

  return {
    today: now.getDate(),
    daysLeft,
    currentMonth,
    nextMonth
  };
}

function getMonthKey(timestamp) {
  const d = new Date(timestamp * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getActiveMonths() {
  const now = now();

  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const fiveDaysBeforeNext = new Date(nextMonth);
  fiveDaysBeforeNext.setDate(fiveDaysBeforeNext.getDate() - 5);

  // Ako smo unutar 5 dana prije novog mjeseca → aktivna su oba
  if (now >= fiveDaysBeforeNext) {
    return [
      getMonthKey(currentMonth.getTime() / 1000),
      getMonthKey(nextMonth.getTime() / 1000),
    ];
  }

  return [getMonthKey(currentMonth.getTime() / 1000)];
}

function now() {
  // uvijek vraća "trenutni" datum (debug aware)
  return new Date(getToday().getTime());
}

function currentYear() {
  return now().getFullYear();
}

function currentMonthIndex() {
  return now().getMonth(); // 0-11
}

function currentMonthNumber() {
  return now().getMonth() + 1; // 1-12
}



// Pomoćne funkcije
// function loadJSON(file) {
//   return JSON.parse(fs.readFileSync(file));
// }

// function saveJSON(file, data) {
//   fs.writeFileSync(file, JSON.stringify(data, null, 2));
// }

function timestamp() {
  const now = now();
  return now.toISOString().replace("T", " ").split(".")[0]; // npr. "2025-10-02 15:42:10"
}

function logText(message) {
  const entry = `[${timestamp()}] ✅ ${message}\n\n`; // ✅ za uspjeh
  console.log(message);
  fs.appendFileSync(logFile, entry, "utf8");
}

function logError(error) {
  const entry = `[${timestamp()}] ❌ ERROR: ${error}\n\n`; // ❌ za error
  console.error(error);
  fs.appendFileSync(logFile, entry, "utf8");
}




//fetchReservations();


//#region HELPERI
function toLocalDateKey(timestamp) {
  const d = new Date(timestamp * 1000);
  // Normaliziraj na lokalni datum (ignoriši satnice)
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0]; // sada sigurno vraća ispravan dan u lokalnom vremenu
}

function formatDate(timestamp) {
  const date = new Date(timestamp * 1000); // convert seconds → milliseconds
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function getAppDir() {
  // Ako je program buildan u .exe
  if (process.pkg) {
    return path.dirname(process.execPath);
  } else {
    return process.cwd();
  }
}
// function getDataPath(filename = "data.json") {
//   return path.join(getAppDir(), filename);
// }


//#endregion

function groupReservationsByArrivalDate(reservations, month, year) {
  return reservations.reduce((acc, res) => {
    const arrival = new Date(res.arrivalDate * 1000);
    arrival.setHours(0, 0, 0, 0);
    if (arrival.getMonth() !== month || arrival.getFullYear() !== year) return acc;

    const dateKey = toLocalDateKey(res.arrivalDate);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(res);
    return acc;
  }, {});
}

function groupReservationsByDepartureDate(reservations, month, year) {
  return reservations.reduce((acc, res) => {
    const departure = new Date(res.departureDate * 1000);
    departure.setHours(0, 0, 0, 0);
    if (departure.getMonth() !== month || departure.getFullYear() !== year) return acc;

    const dateKey = toLocalDateKey(res.departureDate);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(res);
    return acc;
  }, {});
}

// --- HELPER: Odredi checklistu prema broju ---
function getChecklistGroup(unitNumber, isCleaning = false, unitName = "") {
  const lowerName = unitName.toLowerCase();

  // 🟢 Ako je TRANSFER → vraćamo posebne checkliste
  if (lowerName.includes("transfer dolazni")) return "TRANSFER / Dolazni 🚐";
  if (lowerName.includes("transfer odlazni")) return "TRANSFER / Odlazni 🚐";

  // Ako nije transfer → normalne grupe
  const suffix = isCleaning ? " / Cleaning 🪣🚽🪤🧹" : " / Check-in 🛎️";
  if (unitNumber >= 1 && unitNumber <= 70) return "OLD TOWN" + suffix;
  if (unitNumber >= 71 && unitNumber <= 78) return "VILLA SPINDLER" + suffix;
  if (unitNumber >= 101 && unitNumber <= 108) return "KALA LUXURY ROOMS / OUTER APARTMENTS" + suffix;
  return null;
}

function getShortChannelName(salesChannelName) {
  const lower = salesChannelName ? salesChannelName.toLowerCase() : "";
  if (lower.includes("booking")) return "B";
  if (lower.includes("expedia")) return "E";
  if (lower.includes("airbnb")) return "AB";
  if (lower.includes("du homes") || lower.includes("duhomes")) return "DU HOMES";
  return salesChannelName;
}

function formatDateFixed(dateObj) {
  const d = dateObj.getDate().toString().padStart(2, "0");
  const m = (dateObj.getMonth() + 1).toString().padStart(2, "0");
  const y = dateObj.getFullYear();
  return `${d}/${m}/${y}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createCardForDay(dateObj, arrivalsGrouped, departuresGrouped) {
  const dayName = dateObj.toLocaleDateString("en-US", { weekday: "long" });
  const dateFormatted = formatDateFixed(dateObj);

  // 1️⃣ Kreiraj karticu
  const cardName = `DAY TO DAY - ${dateFormatted} - ${dayName}`;
  const cardRes = await axios.post(`https://api.trello.com/1/cards`, null, {
    params: { key: TRELLO_KEY, token: TRELLO_TOKEN, idList: LIST_ID, name: cardName },
  });
  const cardId = cardRes.data.id;
  console.log(`✅ Kreirana kartica: ${cardName}`);

  // 2️⃣ Dodaj naslovnu sliku
  const imgPath = `./img/${dayName.toLowerCase()}.webp`;
  if (fs.existsSync(imgPath)) {
    try {
      const form = new FormData();
      form.append("file", fs.createReadStream(imgPath));

      const attachRes = await axios.post(
        `https://api.trello.com/1/cards/${cardId}/attachments?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`,
        form,
        { headers: form.getHeaders() }
      );

      await axios.put(
        `https://api.trello.com/1/cards/${cardId}/idAttachmentCover`,
        null,
        { params: { key: TRELLO_KEY, token: TRELLO_TOKEN, value: attachRes.data.id } }
      );
      console.log(`🖼️ Naslovna slika postavljena za ${cardName}`);
    } catch (err) {
      console.warn(`⚠️ Slika nije dodana (${imgPath}):`, err.response?.data || err.message);
    }
  }

  const dateKey = toLocalDateKey(Math.floor(dateObj.getTime() / 1000));
  let arrivalsForDay = (arrivalsGrouped[dateKey] || []).sort((a, b) => (a.unitNumber ?? 9999) - (b.unitNumber ?? 9999));
  let departuresForDay = (departuresGrouped[dateKey] || []).sort((a, b) => (a.unitNumber ?? 9999) - (b.unitNumber ?? 9999));

  // ➡️ Predefinirani checklists redoslijed
  const checklistOrder = [
    "OLD TOWN / Check-in 🛎️",
    "VILLA SPINDLER / Check-in 🛎️",
    "KALA LUXURY ROOMS / OUTER APARTMENTS / Check-in 🛎️",
    "TRANSFER DOLAZNI 🚐",
    "TRANSFER ODLAZNI 🚐",
    "EVISITOR ✍🏻",
    "OLD TOWN / Cleaning 🪣🚽🪤🧹",
    "VILLA SPINDLER / Cleaning 🪣🚽🪤🧹",
    "KALA LUXURY ROOMS / Cleaning 🪣🚽🪤🧹",
    "EXTRA CLEANING 🪣🚽🪤🧹",
    "MAINTANANCE 🛠️",
    "CALL CENTAR 📞",
    "ERRAND BOY 🚐",
  ];

  // ➡️ Prođi redom kroz sve checkliste
  for (const checklistName of checklistOrder) {
    const checklistRes = await axios.post(
      `https://api.trello.com/1/cards/${cardId}/checklists`,
      null,
      { params: { key: TRELLO_KEY, token: TRELLO_TOKEN, name: checklistName } }
    );
    const checklistId = checklistRes.data.id;
    console.log(`📋 Kreiran checklist: ${checklistName}`);
    await sleep(250);

    let items = [];

    // ➕ Dodjela stavki po tipu checklista
    if (checklistName.includes("Check-in")) {
      const filtered = arrivalsForDay.filter(r =>
        !r.unitName.toLowerCase().includes("transfer dolazni") &&
        !r.unitName.toLowerCase().includes("transfer odlazni") &&
        getChecklistGroup(r.unitNumber, false) === checklistName
      );
      items = filtered.map(r => `${r.unitName} / ${r.guestName} / ${getShortChannelName(r.salesChannelName)} / ${r.guestNumber}pax`);
    }
    else if (checklistName === "TRANSFER DOLAZNI 🚐") {
      const filtered = arrivalsForDay.filter(r => r.unitName.toLowerCase().includes("transfer dolazni"));
      items = filtered.map(r => `${r.unitName} / ${r.guestName} / ${getShortChannelName(r.salesChannelName)} / ${r.guestNumber}pax`);
    }
    else if (checklistName === "TRANSFER ODLAZNI 🚐") {
      const filtered = arrivalsForDay.filter(r => r.unitName.toLowerCase().includes("transfer odlazni"));
      items = filtered.map(r => `${r.unitName} / ${r.guestName} / ${getShortChannelName(r.salesChannelName)} / ${r.guestNumber}pax`);
    }
    else if (checklistName === "EVISITOR ✍🏻") {
      const filtered = arrivalsForDay.filter(r =>
        !r.unitName.toLowerCase().includes("transfer dolazni") &&
        !r.unitName.toLowerCase().includes("transfer odlazni")
      );
      items = filtered.map(r => `${r.unitName} / ${r.guestName} / ${getShortChannelName(r.salesChannelName)} / ${r.guestNumber}pax`);
    }
    else if (checklistName.includes("Cleaning")) {
      const filtered = departuresForDay.filter(r =>
        !r.unitName.toLowerCase().includes("transfer dolazni") &&
        !r.unitName.toLowerCase().includes("transfer odlazni") &&
        getChecklistGroup(r.unitNumber, true) === checklistName
      );
      items = filtered.map(r => 
        `${r.unitName} / ${r.guestName} / ${getShortChannelName(r.salesChannelName)} / ${r.guestNumber}pax`
      );
    }


    // ➕ Dodaj sve stavke u checklist (jednu po jednu sa delayem)
    for (const item of items) {
      await axios.post(
        `https://api.trello.com/1/checklists/${checklistId}/checkItems`,
        null,
        { params: { key: TRELLO_KEY, token: TRELLO_TOKEN, name: item } }
      );
      console.log(`➕ ${checklistName}: ${item}`);
      await sleep(150);
    }
  }

  console.log(`✅ Gotova kartica: ${cardName}`);
}








//#region AUTOMATSKO AZURIRANJE


// --- HELPER: dohvati karticu po datumu ---


// --- HELPER: nađi ili kreiraj checklistu ---
async function findOrCreateChecklist(cardId, checklistName) {
  const res = await axios.get(`https://api.trello.com/1/cards/${cardId}/checklists`, {
    params: { key: TRELLO_KEY, token: TRELLO_TOKEN },
  });

  let checklist = res.data.find(cl => cl.name === checklistName);
  if (!checklist) {
    const checklistRes = await axios.post(
      `https://api.trello.com/1/cards/${cardId}/checklists`,
      null,
      { params: { key: TRELLO_KEY, token: TRELLO_TOKEN, name: checklistName } }
    );
    checklist = checklistRes.data;
  }

  return checklist;
}



async function findCardByDate(dateUnix) {
  const dateObj = new Date(dateUnix * 1000);
  const dayName = dateObj.toLocaleDateString("en-US", { weekday: "long" });
  const dateFormatted = formatDateFixed(dateObj);
  const cardName = `DAY TO DAY - ${dateFormatted} - ${dayName}`;
  console.log(cardName);

  const cardsRes = await axios.get(`https://api.trello.com/1/lists/${LIST_ID}/cards`, {
    params: { key: TRELLO_KEY, token: TRELLO_TOKEN },
  });

  return cardsRes.data.find(card => card.name === cardName);
}





async function handleNewReservation(reservation, type = 'all') {
  const itemName = `${reservation.unitName} / ${reservation.guestName} / ${getShortChannelName(reservation.salesChannelName)} / ${reservation.guestNumber}pax`;
  const lowerUnitName = reservation.unitName.toLowerCase();

  const card = await findCardByDate(reservation.arrivalDate);
  if (!card) {
    console.warn(`⚠️ Kartica za taj dan ne postoji, preskačem.`);
    logError(`Kartica ne postoji: ${formatDate(reservation.arrivalDate)}: (${reservation.id})`);
    return;
  }

  async function addSortedCheckItem(checklistId, reservation, itemName) {
    const existingItemsRes = await axios.get(
      `https://api.trello.com/1/checklists/${checklistId}`,
      { params: { key: TRELLO_KEY, token: TRELLO_TOKEN } }
    );
    const existingItems = existingItemsRes.data.checkItems;

    const sorted = existingItems
      .map(i => ({
        ...i,
        unitNumber: parseInt(i.name.split(" / ")[0]) || null,
      }))
      .sort((a, b) => (a.unitNumber || 99999) - (b.unitNumber || 99999));

    let pos = "bottom";
    if (reservation.unitNumber) {
      for (let i = 0; i < sorted.length; i++) {
        if (reservation.unitNumber < sorted[i].unitNumber) {
          pos = sorted[i].pos - 0.1;
          break;
        }
      }
    }

    await axios.post(
      `https://api.trello.com/1/checklists/${checklistId}/checkItems`,
      null,
      { params: { key: TRELLO_KEY, token: TRELLO_TOKEN, name: itemName, pos } }
    );
  }

  // 🔀 TRANSFER DOLAZNI
  if ((type === 'arrival' || type === 'all') && lowerUnitName.includes("transfer dolazni")) {
    const checklist = await findOrCreateChecklist(card.id, "TRANSFERS - DOLAZNI 🚖");
    await addSortedCheckItem(checklist.id, reservation, itemName);
    console.log(`🚖 Dodan transfer dolazni za ${reservation.unitName}`);
    logText(`Dodan transfer dolazni: (${formatDate(reservation.arrivalDate)}: ${reservation.id}) \n${reservation.unitName} - ${reservation.guestName}`);
    return;
  }

  // 🔀 TRANSFER ODLAZNI
  if ((type === 'arrival' || type === 'all') && lowerUnitName.includes("transfer odlazni")) {
    const checklist = await findOrCreateChecklist(card.id, "TRANSFERS - ODLASCI 🚕");
    await addSortedCheckItem(checklist.id, reservation, itemName);
    console.log(`🚕 Dodan transfer odlazni za ${reservation.unitName}`);
    logText(`Dodan transfer odlazni: (${formatDate(reservation.arrivalDate)}: ${reservation.id}) \n${reservation.unitName} - ${reservation.guestName}`);
    return;
  }

  // ➕ NORMALNI CHECK-IN
  if ((type === 'arrival' || type === 'all')) {
    const checklistGroup = getChecklistGroup(reservation.unitNumber, false);
    if (checklistGroup) {
      const checklist = await findOrCreateChecklist(card.id, checklistGroup);
      await addSortedCheckItem(checklist.id, reservation, itemName);
      console.log(`✅ Dodana rezervacija u ${checklistGroup} za ${reservation.unitName}`);
      logText(`Dodana rezervacija u ${checklistGroup}: (${formatDate(reservation.arrivalDate)}: ${reservation.id}) \n${reservation.unitName} - ${reservation.guestName}`);
    }

    // ✍🏻 EVISITOR
    const evisitorChecklist = await findOrCreateChecklist(card.id, "EVISITOR ✍🏻");
    await addSortedCheckItem(evisitorChecklist.id, reservation, itemName);
    console.log(`✍🏻 Dodana rezervacija i u EVISITOR`);
    logText(`Dodan EVISITOR: (${formatDate(reservation.arrivalDate)}: ${reservation.id}) \n${reservation.unitName} - ${reservation.guestName}`);
  }

  // 🧹 CLEANING → ide u karticu na departureDate
  if ((type === 'departure' || type === 'all') && reservation.departureDate) {
    const cleaningCard = await findCardByDate(reservation.departureDate);
    if (cleaningCard) {
      const cleaningChecklistGroup = getChecklistGroup(reservation.unitNumber, true);
      if (cleaningChecklistGroup) {
        const cleaningChecklist = await findOrCreateChecklist(cleaningCard.id, cleaningChecklistGroup);
        await addSortedCheckItem(cleaningChecklist.id, reservation, itemName);
        console.log(`🧹 Dodana rezervacija i u cleaning za ${reservation.unitName}`);
        logText(`Dodan CLEANING: (${formatDate(reservation.departureDate)}: ${reservation.id}) \n${reservation.unitName} - ${reservation.guestName}`);
      }
    }
  }
}




// --- OBRIŠI CANCEL / DELETED REZERVACIJU ---
async function handleDeleteReservation(reservation, type = 'all') {
  try {
    // Dohvati sve kartice iz LIST_ID
    const cardsRes = await axios.get(`https://api.trello.com/1/lists/${LIST_ID}/cards`, {
      params: { key: TRELLO_KEY, token: TRELLO_TOKEN },
    });

    for (const card of cardsRes.data) {
      // Dohvati sve checkliste u kartici
      const checklistsRes = await axios.get(
        `https://api.trello.com/1/cards/${card.id}/checklists`,
        { params: { key: TRELLO_KEY, token: TRELLO_TOKEN } }
      );

      const checklists = checklistsRes.data;

      for (const checklist of checklists) {
        // Odredi da li checklist spada pod brisanje prema type-u
        let shouldCheck = false;

        if (type === 'arrival') {
          const name = checklist.name.toLowerCase();
          if (name.includes('check-in') || name.includes('evisitor') || name.includes('transfer')) {
            shouldCheck = true;
          }
        } else if (type === 'departure') {
          if (checklist.name.toLowerCase().includes('cleaning')) {
            shouldCheck = true;
          }
        } else if (type === 'all') {
          shouldCheck = true; // briši sve
        }

        if (!shouldCheck) continue;

        const item = checklist.checkItems.find(
          ci =>
            ci.name.includes(reservation.unitName) &&
            ci.name.includes(reservation.guestName)
        );

        if (item) {
          await axios.delete(
            `https://api.trello.com/1/checklists/${checklist.id}/checkItems/${item.id}`,
            { params: { key: TRELLO_KEY, token: TRELLO_TOKEN } }
          );

          console.log(
            `🗑️ Obrisan checkbox (${type}) za ${reservation.unitName} / ${reservation.guestName} na kartici ${card.name} u checklisti "${checklist.name}"`
          );
          logText(`Obrisan checkbox (${type}): DOLAZAK: ${formatDate(reservation.arrivalDate)}, ODLAZAK: ${formatDate(reservation.departureDate)} - ${reservation.id}\nChecklist: ${checklist.name}\n${reservation.unitName} - ${reservation.guestName}`);
        }
      }
    }
  } catch (err) {
    console.error('❌ Greška kod brisanja rezervacije:', err.response?.data || err.message);
    logError(`Brisanje rezervacije ${formatDate(reservation.arrivalDate)} (${reservation.id}) \n${reservation.unitName} - ${reservation.guestName}`);
  }
}



async function handleModifyReservation(oldReservation, newReservation) {
  try {
    const baseNewItemName = `${newReservation.unitName} / ${newReservation.guestName} / ${getShortChannelName(newReservation.salesChannelName)} / ${newReservation.guestNumber}pax`;

    // Lista kartica za provjeru: prvo arrival, pa departure
    const datesToCheck = [oldReservation.arrivalDate, oldReservation.departureDate];

    for (const date of datesToCheck) {
      const card = await findCardByDate(date);
      if (!card) {
        console.warn(`⚠️ Kartica za datum ${formatDate(date)} ne postoji, preskačem.`);
        logError(`MODIFY: Kartica ne postoji za datum ${formatDate(date)} - ${oldReservation.id}`);
        continue;
      }

      // Dohvati sve checkliste na kartici
      const checklistsRes = await axios.get(
        `https://api.trello.com/1/cards/${card.id}/checklists`,
        { params: { key: TRELLO_KEY, token: TRELLO_TOKEN } }
      );

      const checklists = checklistsRes.data;

      for (const checklist of checklists) {
        for (const item of checklist.checkItems) {
          if (
            item.name.includes(oldReservation.unitName) &&
            item.name.includes(oldReservation.guestName)
          ) {
            // Izdvoji sve što je dodano iza "pax"
            const suffixMatch = item.name.match(/pax(.*)$/);
            const suffix = suffixMatch ? suffixMatch[1].trim() : "";

            // Spoji novi string sa starim dodatkom
            const finalNewName = suffix ? `${baseNewItemName} ${suffix}` : baseNewItemName;

            // Updateaj ime stavke
            await axios.put(
              `https://api.trello.com/1/cards/${card.id}/checkItem/${item.id}`,
              null,
              {
                params: {
                  key: TRELLO_KEY,
                  token: TRELLO_TOKEN,
                  name: finalNewName,
                },
              }
            );

            console.log(`🔄 Ažurirana rezervacija: ${newReservation.unitName} (${formatDate(date)}) pod checklistom "${checklist.name}"`);
            logText(`Azurirana rezervacija ${formatDate(date)} - ${newReservation.id}\nChecklist: ${checklist.name}\n${newReservation.unitName} - ${newReservation.guestName}`);
          }
        }
      }
    }

    // Ako se promijenio datum dolaska → prebaci na novu karticu
    if (oldReservation.arrivalDate !== newReservation.arrivalDate) {
      console.log(`📅 Datum promijenjen → premještam stavku na novu karticu`);
      logText(`Promjena dolaska, premjestam: ${formatDate(newReservation.arrivalDate)} - ${newReservation.id}\n${newReservation.unitName} - ${newReservation.guestName}`);
      await handleDeleteReservation(oldReservation, 'arrival');
      await handleNewReservation(newReservation, 'arrival');
    }

    // Ako se promijenio departureDate → update i u cleaning checklisti
    if (oldReservation.departureDate !== newReservation.departureDate) {
      console.log(`🧹 Promjena departure datuma → update cleaning`);
      logText(`Promjena odlaska, premjestam: ${formatDate(newReservation.arrivalDate)} - ${newReservation.id}\n${newReservation.unitName} - ${newReservation.guestName}`);
      await handleDeleteReservation(oldReservation, 'departure');
      await handleNewReservation(newReservation, 'departure');
    }
  } catch (err) {
    console.error("❌ Greška kod modify rezervacije:", err.response?.data || err.message);
  }
}


async function checkForUpdates(monthNumber, year = now().getFullYear()) {
  console.log(`🔄 Provjera updatea za mjesec ${monthNumber}/${year}`);

  // await fetchReservations("newData.json");

  const oldData = readJSONSafe("data.json", { reservations: [] });
  const newData = readJSONSafe("newData.json", { reservations: [] });

  const filterMonth = (res) => {
    const arrival = new Date(res.arrivalDate);
    const departure = new Date(res.departureDate);

    const m = monthNumber - 1;

    return (
      arrival.getMonth() === m ||
      departure.getMonth() === m
    );
  };

  const oldReservations = (oldData.reservations || []).filter(filterMonth);
  const newReservations = (newData.reservations || []).filter(filterMonth);

  const oldMap = new Map(oldReservations.map(r => [r.id, r]));
  const newMap = new Map(newReservations.map(r => [r.id, r]));

  // ➕ NEW
  for (const res of newReservations) {
    if (!oldMap.has(res.id)) {
      console.log(`🆕 Nova rezervacija (${monthNumber}): ${res.unitName}`);
      await handleNewReservation(res, monthNumber);
    }
  }

  // 🔄 MODIFIED
  for (const res of newReservations) {
    const oldRes = oldMap.get(res.id);
    if (!oldRes) continue;

    if (JSON.stringify(oldRes) !== JSON.stringify(res)) {
      console.log(`🔄 Promjena rezervacije (${monthNumber}): ${res.unitName}`);
      await handleModifyReservation(oldRes, res, monthNumber);
    }
  }

  // ❌ DELETED
  for (const oldRes of oldReservations) {
    if (!newMap.has(oldRes.id)) {
      console.log(`❌ Obrisana rezervacija (${monthNumber}): ${oldRes.unitName}`);
      await handleDeleteReservation(oldRes, monthNumber);
    }
  }

  writeJSONSafe("data.json", newData);
}


/* BRZI CREATE CARDS  */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


async function createCardsForMonth(monthNumber, year = now().getFullYear()) {
  console.log(`🃏 Kreiram kartice za mjesec ${monthNumber}/${year}`);

  await fetchReservations("data.json");

  const data = readJSONSafe("data.json", { reservations: [] });
  const reservations = data.reservations || [];

  const monthIndex = monthNumber - 1;

  const arrivalsGrouped = groupReservationsByArrivalDate(reservations, monthIndex, year);
  const departuresGrouped = groupReservationsByDepartureDate(reservations, monthIndex, year);

  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);

  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    await createCardForDay(new Date(d), arrivalsGrouped, departuresGrouped, monthNumber, year);
    await sleep(500);
  }

  console.log(`✅ Kartice kreirane za mjesec ${monthNumber}`);
}



async function createCardsForCurrentMonth() {
  await fetchReservations("data.json");
  const today = now();
  const year = today.getFullYear();
  const month = today.getMonth();

  const arrivalsGrouped = groupReservationsByArrivalDate(reservations, month, year);
  const departuresGrouped = groupReservationsByDepartureDate(reservations, month, year);

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    await createCardForDay(new Date(d), arrivalsGrouped, departuresGrouped);
    await sleep(500); // lagani delay između kartica
  }
}




//#endregion




const testReservation = {
      "id": 9195922,
      "unitNumber": 15,
      "unitName": "15 - AD Ilije Sarake",
      "guestName": "Tomas Ulf Gunnar Dahlberg",
      "salesChannelName": "BOOKING",
      "guestNumber": 2,
      "arrivalDate": 1759622400,
      "departureDate": 1759622400,
      "totalNights": 4,
      "note": "** THIS RESERVATION HAS BEEN PRE-PAID **\nBOOKING NOTE : Payment charge is EUR 8.0028\nApproximate time of arrival: between 22:00 and 23:00\nThis guest is interested in your airport shuttle service and would like to get more information from you.\nWe kindly request, if possible, to be placed in the apartment on the higher top floor (on level with neighbour roof tops), rather than the lower apartment facing the wall. Please confirm!\nSince we are staying for 5 nights, this would make our stay much more enjoyable.\nThank you very much in advance for your help!\n\nNon-Smoking",
      "checkedIn": "N",
      "checkedOut": "N",
      "status": 1
}

const testReservationNew = {
      "id": 9195922,
      "unitNumber": 15,
      "unitName": "15 - AD Ilije Sarake",
      "guestName": "Tomas Ulf Gunnar Dahlberg",
      "salesChannelName": "BOOKING",
      "guestNumber": 2,
      "arrivalDate": 1759276800,
      "departureDate": 1759622400,
      "totalNights": 4,
      "note": "** THIS RESERVATION HAS BEEN PRE-PAID **\nBOOKING NOTE : Payment charge is EUR 8.0028\nApproximate time of arrival: between 22:00 and 23:00\nThis guest is interested in your airport shuttle service and would like to get more information from you.\nWe kindly request, if possible, to be placed in the apartment on the higher top floor (on level with neighbour roof tops), rather than the lower apartment facing the wall. Please confirm!\nSince we are staying for 5 nights, this would make our stay much more enjoyable.\nThank you very much in advance for your help!\n\nNon-Smoking",
      "checkedIn": "N",
      "checkedOut": "N",
      "status": 1
}

//createCardsForCurrentMonth();
//handleModifyReservation(testReservation, testReservationNew);
//checkForUpdates();
//fetchReservations("newData.json");
//fetchReservations("data.json");



//previewRawAPI();

// 30 sek: "*/30 * * * * *"
//5min: "*/5 * * * *"
//10min: "*/10 * * * *"

// 🚀 Prva ručna sinkronizacija odmah pri pokretanju
/*(async () => {
  console.log('🚀 Prva sinkronizacija...');
  //await fetchReservations("data.json");
  await createCardsForCurrentMonth();
})();*/

//checkForUpdates();

//createCardsForCurrentMonth();
//fetchReservations("data.json");

//cron.schedule("*/10 * * * *", async () => {
  /*console.log('\n🔄 [CRON] Sinkronizacija u tijeku...');
  await checkForUpdates();
});*/

