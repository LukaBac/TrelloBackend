require('dotenv').config();
const axios = require("./node_modules/axios/dist/node/axios.cjs");const fs = require('fs');
const log  = require('console');
const path = require('path');
const FormData = require('form-data');

const TRELLO_KEY = process.env.TRELLO_API_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const LIST_ID = process.env.TRELLO_LIST_ID;
const BOARD_ID = process.env.TRELLO_BOARD_ID;

const { reservations } = JSON.parse(fs.readFileSync('data.json'));
const logFile = getDataPath("log.txt");
const configPath = getDataPath("config.json");

const cron = require('node-cron');
const readline = require('readline');
const _ = require('lodash');
const { fetchReservations, previewDataFromAPI, previewRawAPI } = require('./rentlio');

function updateConfig(newConfig) {
  fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), "utf8");
  config = newConfig; // ažuriraj u memoriji
}

// 📖 UČITAJ CONFIG
let config = loadConfig();
let isCreatingCards = false; // sprječava overlap

// 🧠 PROVJERI MJESEC I ODRADI POTREBNO
async function autoSync() {
  try {
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    config = loadConfig();
    const trackedMonth = config.monthTracker;

    if (currentMonth !== trackedMonth && !isCreatingCards) {
      console.log(`🗓️ Novi mjesec (${currentMonth}) otkriven! - Kreiram kartice`);
      logText(`🗓️ Novi mjesec (${currentMonth}) otkriven — pokrećem izradu kartica...`);

      isCreatingCards = true;

      // 📁 Arhiviraj stare kartice + preimenuj listu
      await archiveAndRenameList(currentMonth);

      // 🃏 Kreiraj nove kartice
      await createCardsForCurrentMonth();

      // 🔁 Ažuriraj config
      config.monthTracker = currentMonth;
      updateConfig(config);

      isCreatingCards = false;

      console.log("✅ Novi mjesec kreiran i config ažuriran.");
      logText(`✅ Novi mjesec kreiran i config ažuriran na ${currentMonth}.`);
    } else {
      // 🔄 Samo provjeri updatee (ako nije novi mjesec)
      console.log("🔄 Pokrećem sinkronizaciju s Rentlio API-jem...");
      await checkForUpdates();
    }
  } catch (err) {
    console.error("❌ Greška u autoSync:", err.message);
    logText(`❌ Greška u autoSync: ${err.message}`);
    isCreatingCards = false;
  }
}

function loadConfig() {
  try {
    const data = fs.readFileSync("config.json", "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("❌ Greška pri čitanju config.json:", err);
    return { trackerMonth: 0, refreshMinutes: 3 };
  }
}

// 📦 Dummy funkcija (preimenuj listu + arhiviraj stare kartice)
async function archiveAndRenameList(currentMonth) {
  try {
    const monthName = new Date().toLocaleString("en-US", { month: "long" });
    const year = new Date().getFullYear();

    console.log(`📦 Arhiviram sve kartice i preimenujem listu na "${monthName}"...`);
    //logText(`📦 Arhiviram sve kartice i preimenujem listu na "${monthName} ${year}"...`);

    // 🔹 1️⃣ Dohvati sve kartice u listi
    const cardsRes = await axios.get(
      `https://api.trello.com/1/lists/${LIST_ID}/cards`,
      { params: { key: TRELLO_KEY, token: TRELLO_TOKEN } }
    );

    const cards = cardsRes.data;
    console.log(`📋 Pronađeno ${cards.length} kartica za arhiviranje...`);

    // 🔹 2️⃣ Arhiviraj svaku karticu (staviti closed=true)
    for (const card of cards) {
      await axios.put(
        `https://api.trello.com/1/cards/${card.id}/closed`,
        null,
        {
          params: {
            key: TRELLO_KEY,
            token: TRELLO_TOKEN,
            value: true,
          },
        }
      );
      console.log(`🗃️ Arhivirana kartica: ${card.name}`);
      await new Promise((res) => setTimeout(res, 300)); // mali delay da izbjegnemo 429
    }

    // 🔹 3️⃣ Preimenuj listu
    await axios.put(
      `https://api.trello.com/1/lists/${LIST_ID}/name`,
      null,
      {
        params: {
          key: TRELLO_KEY,
          token: TRELLO_TOKEN,
          value: `${monthName}`,
        },
      }
    );

    console.log(`✅ Lista preimenovana u "${monthName.toUpperCase()}" i sve kartice arhivirane.`);
    logText(`✅ Lista preimenovana u "${monthName.toUpperCase()}" i sve kartice arhivirane.`);
  } catch (err) {
    console.error("❌ Greška kod arhiviranja ili preimenovanja liste:", err.response?.data || err.message);
    logText(`❌ Greška kod arhiviranja ili preimenovanja liste: ${err.response?.data || err.message}`);
  }
}


// 🕒 SCHEDULE
console.log(`🚀 Program pokrenut! Refresh svakih ${config.refreshMinutes} minuta.`);

// Pokreni odmah pri startu
//autoSync();

// Zatim svaka X minuta (iz config.json)
//cron.schedule(`*/${config.refreshMinutes} * * * *`, async () => {
  /*if (!isCreatingCards) {
    await autoSync();
  } else {
    console.log("⏸️ Pauzirano — izrada kartica u tijeku.");
  }
});*/

fetchReservations("data.json");



// STARA SINKRONIZACIJA
/*
let syncInterval = 3;
let syncJob = null; 

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function startSync() {
  console.log(`🚀 Pokrećem prvi sync...`);
  await checkForUpdates();
  console.log(`✅ Prvi sync završen. Pokrećem automatsku sinkronizaciju svakih ${syncInterval} minute/a.`);*/

  //const cronExp = `*/${syncInterval} * * * *`;
  /*syncJob = cron.schedule(cronExp, async () => {
    console.log(`⏳ Automatski sync (${new Date().toLocaleTimeString()})...`);
    await checkForUpdates();
  });
}

function showMenu() {
  console.log("\n==============================");
  console.log("   🧠 Evisitor & Trello Sync");
  console.log("==============================");
  console.log("1️⃣  Kreiraj kartice za trenutni mjesec");
  console.log(`2️⃣  Sinkronizacija svakih ${syncInterval} minute/a`);
  console.log("3️⃣  Promijeni vrijeme sinkronizacije (u minutama)");
  console.log("==============================");

  rl.question("Odaberi opciju (1-3): ", async (choice) => {
    switch (choice.trim()) {
      case "1":
        console.log("🚀 Pokrećem kreiranje kartica...");
        rl.close(); // zatvara meni
        await createCardsForCurrentMonth();
        console.log("✅ Gotovo. Možeš zatvoriti aplikaciju.");
        break;

      case "2":
        console.log(`🚀 Pokrećem sinkronizaciju svakih ${syncInterval} minute/a...`);
        rl.close(); // zatvara meni
        await startSync();
        break;

      case "3":
        rl.question("⏱️  Unesi novi interval u minutama: ", (min) => {
          const num = parseInt(min);
          if (isNaN(num) || num <= 0) {
            console.log("❌ Nevažeći unos. Pokušaj ponovno.");
          } else {
            syncInterval = num;
            console.log(`✅ Interval postavljen na ${syncInterval} minute/a.`);
          }
          showMenu();
        });
        return;

      default:
        console.log("⚠️ Nevažeći unos, pokušaj ponovno.");
        showMenu();
        return;
    }
  });
}

// 🟢 Pokreni izbornik pri startu
showMenu();*/


/*

  MEETING:
  DONE - NOVI CHECKLIST ZA DOLAZNI I ODLAZNI
  DONE - ako je sta nadopisano, provjerit da se ne rusi
  DONE - evisitor - kopija checkina
  DONE - mj dana najduze trajanje



  TODO: 
    DONE - RIJESITI NOVIGOSTI, NOTEOVE, PROVJERITI ISPRAVNOST, EVISITOR?

    WEBHOOKS

    DONE - RIJESITI REZERVACIJE KOJE NISU UBACENE JER API NE DOHVACA IZ TRENUTNOG MJESECA

    POPRAVITI AKO SE PROMJENI DATUM REZERVACIJE NA KARTICU KOJA NE POSTOJI, I VRATI NA STARU. 



  NASLOV (OBJEKT / NAMJENA)
    natuknice - Broj, Naziv, Gost, Slovo, Pax, jesu li novi ili ne

    Objekt iz data.json
    {
      "id": 8083320,
      "unitName": "31 - NORA",
      "guestName": "Leticia Briz Fernandez",
      "salesChannelName": "BOOKING",
      "guestNumber": 6,
      "arrivalDate": 1756684800,
      "departureDate": 1757203200
      
  totalNights
  note
  checkedIn
  checkedOut
  canceledAt??
    },


    OLD TOWN / Check-in 🛎️:
      MONTE SANTO
      Grey Nest
      AD Ilije Sarake
      Kaštela
      AD Pobijana
      Panorama
      Hidden Gem
      Sweet Room
      Kaleta
      Rafael
      Lincun


    VILLA SPINDLER / Check-in 🛎️:
      71 - 78


    KALA LUXURY ROOMS / OUTER APARTMENTS / Check-in 🛎️:
    101 - 108
      

    EVISITOR ✍🏻


    B BOOKING
    E EXPEDIA
    EA Airbnb
*/

// Pomoćne funkcije
function loadJSON(file) {
  return JSON.parse(fs.readFileSync(file));
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function timestamp() {
  const now = new Date();
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


/*
async function syncData() {
  const current = loadJSON('data.json');
  const last = loadJSON('last_synced.json');

  // === REZERVACIJE ===
  const newReservations = _.differenceBy(current.reservations, last.reservations, 'id');
  const deletedReservations = _.differenceBy(last.reservations, current.reservations, 'id');

  for (const res of newReservations) {
    await createCardReservation(res);
  }

  for (const res of deletedReservations) {
    await deleteCardByReservationId(res.id);
  }

  // === PROPERTIES ===
  const newProperties = _.differenceBy(current.properties, last.properties, 'id');
  const deletedProperties = _.differenceBy(last.properties, current.properties, 'id');

  for (const prop of newProperties) {
    await createCardForProperty(prop);
  }

  for (const prop of deletedProperties) {
    await deleteCardByPropertyId(prop.id);
  }

    // 🔁 Provjera izmjena kod postojećih rezervacija
  const commonReservations = _.intersectionBy(current.reservations, last.reservations, 'id');
  for (const res of commonReservations) {
    await updateCardIfChanged(res);
  }

  // 🔁 Provjera izmjena kod postojećih objekata
  const commonProperties = _.intersectionBy(current.properties, last.properties, 'id');
  for (const prop of commonProperties) {
    await updateCardIfChangedProperty(prop);
  }


  // Ažuriraj lokalni snapshot
  saveJSON('last_synced.json', current);
}


async function deleteCardByReservationId(reservationId) {
  try {
    const res = await axios.get(`https://api.trello.com/1/lists/${RESERVATIONS_ID}/cards`, {
      params: {
        key: TRELLO_KEY,
        token: TRELLO_TOKEN
      }
    });

    const card = res.data.find(c => c.desc.includes(`Rez ID: ${reservationId}`));
    if (card) {
      await axios.delete(`https://api.trello.com/1/cards/${card.id}`, {
        params: {
          key: TRELLO_KEY,
          token: TRELLO_TOKEN
        }
      });
      console.log(`🗑️ Obrisana kartica za Rez ID: ${reservationId}`);
    } else {
      console.log(`⚠️ Nema kartice za Rez ID: ${reservationId}`);
    }
  } catch (err) {
    console.error('❌ Greška kod brisanja:', err.response?.data || err.message);
  }
}

async function updateCardIfChanged(reservation) {
  try {
    const res = await axios.get(`https://api.trello.com/1/lists/${RESERVATIONS_ID}/cards`, {
      params: {
        key: TRELLO_KEY,
        token: TRELLO_TOKEN
      }
    });

    const card = res.data.find(c => c.desc.includes(`Rez ID: ${reservation.id}`));

    if (!card) return; // nema kartice za ovaj ID

    const propertyName = getPropertyNameById(reservation.property_id);
    const newName = `${reservation.guestName} – ${reservation.unitName}`;
    const newDesc = `📌 Napomena: ${reservation.note || '—'}\n🔑 Rez ID: ${reservation.id}`;


    // Usporedi ime i opis
    if (card.name !== newName || card.desc !== newDesc) {
      await axios.put(`https://api.trello.com/1/cards/${card.id}`, null, {
        params: {
          key: TRELLO_KEY,
          token: TRELLO_TOKEN,
          name: newName,
          desc: newDesc
        }
      });
      console.log(`✏️ Ažurirana kartica za ${reservation.guestName}`);
    }
  } catch (err) {
    console.error('❌ Greška kod ažuriranja kartice (rez):', err.response?.data || err.message);
  }
}





// pomoćna funkcija za dohvat imena objekta po ID-u
function getPropertyNameById(id) {
  const prop = properties.find(p => p.id === id);
  return prop ? `${prop.name} (${prop.city})` : 'Nepoznat objekt';
}


async function createCardReservation(reservation) {
  const name = `${reservation.guestName} – ${reservation.unitName}`;
  const desc = `📌 Napomena: ${reservation.note || '—'}\n🔑 Rez ID: ${reservation.id}`;

  try {
    const response = await axios.post('https://api.trello.com/1/cards', null, {
      params: {
        key: TRELLO_KEY,
        token: TRELLO_TOKEN,
        idList: RESERVATIONS_ID,
        name: name,
        desc: desc
      }
    });

    console.log(`✅ Dodana karta za ${reservation.guestName}`);
  } catch (error) {
    console.error(`❌ Greška za ${reservation.guestName}:`, error.response?.data || error.message);
  }
}


async function createCardForProperty(property) {
  const name = property.name;
  const desc = `📍 Adresa: ${property.address}\n🏙️ Grad: ${property.city}\n🏨 Property ID: ${property.id}`;

  try {
    const response = await axios.post('https://api.trello.com/1/cards', null, {
      params: {
        key: TRELLO_KEY,
        token: TRELLO_TOKEN,
        idList: PROPERTIES_ID,
        name: name,
        desc: desc
      }
    });

    console.log(`✅ Dodana karta za objekt: ${property.name}`);
  } catch (error) {
    console.error(`❌ Greška za objekt ${property.name}:`, error.response?.data || error.message);
  }
}


async function deleteCardByPropertyId(propertyId) {
  try {
    const res = await axios.get(`https://api.trello.com/1/lists/${PROPERTIES_ID}/cards`, {
      params: {
        key: TRELLO_KEY,
        token: TRELLO_TOKEN
      }
    });

    const card = res.data.find(c => c.desc.includes(`Property ID: ${propertyId}`));
    if (card) {
      await axios.delete(`https://api.trello.com/1/cards/${card.id}`, {
        params: {
          key: TRELLO_KEY,
          token: TRELLO_TOKEN
        }
      });
      console.log(`🗑️ Obrisana kartica za Property ID: ${propertyId}`);
    } else {
      console.log(`⚠️ Nema kartice za Property ID: ${propertyId}`);
    }
  } catch (err) {
    console.error('❌ Greška kod brisanja property kartice:', err.response?.data || err.message);
  }
}

async function updateCardIfChangedProperty(property) {
  try {
    const res = await axios.get(`https://api.trello.com/1/lists/${PROPERTIES_ID}/cards`, {
      params: {
        key: TRELLO_KEY,
        token: TRELLO_TOKEN
      }
    });

    const card = res.data.find(c => c.desc.includes(`Property ID: ${property.id}`));
    if (!card) return;

    const newName = property.name;
    const newDesc = `📍 Adresa: ${property.address}\n🏙️ Grad: ${property.city}\n🏨 Property ID: ${property.id}`;

    if (card.name !== newName || card.desc !== newDesc) {
      await axios.put(`https://api.trello.com/1/cards/${card.id}`, null, {
        params: {
          key: TRELLO_KEY,
          token: TRELLO_TOKEN,
          name: newName,
          desc: newDesc
        }
      });
      console.log(`✏️ Ažurirana kartica za objekt: ${property.name}`);
    }
  } catch (err) {
    console.error('❌ Greška kod ažuriranja kartice (objekt):', err.response?.data || err.message);
  }
}



async function listAllLists() {
  try {
    const response = await axios.get(`https://api.trello.com/1/boards/${process.env.TRELLO_BOARD_ID}/lists`, {
      params: {
        key: TRELLO_KEY,
        token: TRELLO_TOKEN
      }
    });

    console.log('📋 Sve liste na boardu:\n');
    response.data.forEach(list => {
      console.log(`🆔 ID: ${list.id}`);
      console.log(`📛 Naziv: ${list.name}`);
      console.log('--------------------------');
    });
  } catch (error) {
    console.error('❌ Greška kod dohvaćanja lista:', error.response?.data || error.message);
  }
}*/

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
function getDataPath(filename = "data.json") {
  return path.join(getAppDir(), filename);
}


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



/*async function createCardsForCurrentMonth() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-11

  const arrivalsGrouped = groupReservationsByArrivalDate(reservations, month, year);
  const departuresGrouped = groupReservationsByDepartureDate(reservations, month, year);

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    await createCardForDay(new Date(d), arrivalsGrouped, departuresGrouped);
  }
}*/




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

/*async function handleCheckIn(reservation) {
  try {
    const card = await findCardByDate(reservation.arrivalDate);
    if (!card) {
      console.warn("Kartica za checkin ne postoji:", reservation.arrivalDate);
      return;
    }

    // Dohvati sve checkliste na toj kartici
    const checklistsRes = await axios.get(
      `https://api.trello.com/1/cards/${card.id}/checklists`,
      {
        params: { key: TRELLO_KEY, token: TRELLO_TOKEN },
      }
    );

    const checklists = checklistsRes.data;

    for (const checklist of checklists) {
      // preskoči cleaning liste
      if (checklist.name.toLowerCase().includes("cleaning")) continue;

      const item = checklist.checkItems.find(
        ci =>
          ci.name.includes(reservation.unitName) &&
          ci.name.includes(reservation.guestName)
      );

      if (item) {
        const state = reservation.checkedIn === "Y" ? "complete" : "incomplete";

        await axios.put(
          `https://api.trello.com/1/cards/${card.id}/checklist/${checklist.id}/checkItem/${item.id}`,
          null,
          {
            params: {
              key: TRELLO_KEY,
              token: TRELLO_TOKEN,
              state,
            },
          }
        );

        console.log(
          `${state === "complete" ? "✅" : "⬜"} Check-in ${
            state === "complete" ? "označen" : "poništen"
          } za ${reservation.unitName} / ${reservation.guestName} (${checklist.name})`
        );
      }
    }
  } catch (err) {
    console.error("❌ Greška kod check-ina:", err.response?.data || err.message);
  }
}*/

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


async function checkForUpdates() {
  // 1️⃣ Povuci svježe rezervacije i spremi u newData.json
  await fetchReservations("newData.json");

  // 2️⃣ Učitaj stare i nove podatke
  const oldData = fs.existsSync("data.json")
    ? JSON.parse(fs.readFileSync("data.json", "utf-8"))
    : { reservations: [] };

  const newData = fs.existsSync("newData.json")
    ? JSON.parse(fs.readFileSync("newData.json", "utf-8"))
    : { reservations: [] };

  const oldReservations = oldData.reservations || [];
  const newReservations = newData.reservations || [];

  // Pretvori u mape radi lakšeg uspoređivanja
  const oldMap = new Map(oldReservations.map(r => [r.id, r]));
  const newMap = new Map(newReservations.map(r => [r.id, r]));

  // 3️⃣ Detekcija promjena
  // ➕ NOVE rezervacije
  for (const res of newReservations) {
    if (!oldMap.has(res.id)) {
      console.log(`🆕 Nova rezervacija: ${res.unitName} (${res.id})`);
      await handleNewReservation(res);
    }
  }

  // 🔄 MODIFICIRANE rezervacije
  for (const res of newReservations) {
  const oldRes = oldMap.get(res.id);
  if (oldRes) {
    // Usporedi polja
    const changes = [];
    for (const key of Object.keys(res)) {
      if (JSON.stringify(oldRes[key]) !== JSON.stringify(res[key])) {
        changes.push(`${key}: "${oldRes[key]}" → "${res[key]}"`);
      }
    }

    if (changes.length > 0) {
      // Ako su promjene samo checkin/checkout — preskoči
      const relevantChanges = changes.filter(change => {
        return !change.startsWith("checkedIn") && !change.startsWith("checkedOut");
      });

      if (relevantChanges.length > 0) {
        console.log(`🔄 Promijenjena rezervacija: ${res.unitName} (${res.id})`);
        console.log("   Promjene:", relevantChanges.join(", "));
        await handleModifyReservation(oldRes, res);
      } else {
        console.log(`⚙️ Promjena samo check-in/out statusa → preskačem modify (${res.unitName})`);
      }
    }
  }
}

  // ❌ OBRISANE rezervacije
  for (const oldRes of oldReservations) {
    if (!newMap.has(oldRes.id)) {
      console.log(`❌ Obrisana rezervacija: ${oldRes.unitName} (${oldRes.id})`);
      await handleDeleteReservation(oldRes);
    }
  }

  // ✅ CHECK-IN statusi
  /*for (const res of newReservations) {
    const oldRes = oldMap.get(res.id);
    if (oldRes && oldRes.checkedIn !== res.checkedIn) {
      console.log(
        `✔️ Promjena check-in statusa za ${res.unitName} (${res.id}): ${oldRes.checkedIn} → ${res.checkedIn}`
      );
      await handleCheckIn(res);
    }
  }*/

  // 4️⃣ Na kraju, zamijeni data.json novim stanjem
  fs.writeFileSync(getDataPath("data.json"), JSON.stringify(newData, null, 2));
  console.log("✅ data.json ažuriran");
}


/* BRZI CREATE CARDS  */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/*async function createCardForDay(dateObj, arrivalsGrouped, departuresGrouped) {
  const dayName = dateObj.toLocaleDateString("en-US", { weekday: "long" });
  const dateFormatted = dateObj.toLocaleDateString("en-GB").replace(/\//g, "/");

  // 1️⃣ Kreiraj karticu
  const cardName = `DAY TO DAY - ${dateFormatted} - ${dayName}`;
  const cardRes = await axios.post(`https://api.trello.com/1/cards`, null, {
    params: { key: TRELLO_KEY, token: TRELLO_TOKEN, idList: LIST_ID, name: cardName },
  });
  const cardId = cardRes.data.id;
  console.log(`✅ Kreirana kartica: ${cardName}`);

  // 2️⃣ Dodaj naslovnu sliku (ako postoji)
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
  let arrivalsForDay = (arrivalsGrouped[dateKey] || []).sort((a, b) => a.unitNumber - b.unitNumber);
  let departuresForDay = (departuresGrouped[dateKey] || []).sort((a, b) => a.unitNumber - b.unitNumber);

  // --- 3️⃣ Definiraj sve checkliste koje moraju postojati ---
  const checklistNames = [
    "OLD TOWN / Check-in 🛎️",
    "VILLA SPINDLER / Check-in 🛎️",
    "KALA LUXURY ROOMS/ OUTER APARTMENTS / Check-in 🛎️",
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

  const checklistMap = {};
  for (const name of checklistNames) {
    const checklistRes = await axios.post(
      `https://api.trello.com/1/cards/${cardId}/checklists`,
      null,
      { params: { key: TRELLO_KEY, token: TRELLO_TOKEN, name } }
    );
    checklistMap[name] = checklistRes.data.id;
    await sleep(150); // lagani delay da izbjegnemo 429
  }

  // --- 4️⃣ Popuni check-in ---
  for (const res of arrivalsForDay) {
    const checklistGroup = getChecklistGroup(res.unitNumber, false);
    if (!checklistGroup) continue;
    const checklistId = checklistMap[checklistGroup];
    const itemName = `${res.unitName} / ${res.guestName} / ${getShortChannelName(res.salesChannelName)} / ${res.guestNumber}pax`;

    const itemRes = await axios.post(
      `https://api.trello.com/1/checklists/${checklistId}/checkItems`,
      null,
      { params: { key: TRELLO_KEY, token: TRELLO_TOKEN, name: itemName } }
    );

    if (res.checkedIn === "Y") {
      await axios.put(
        `https://api.trello.com/1/cards/${cardId}/checkItem/${itemRes.data.id}`,
        null,
        { params: { key: TRELLO_KEY, token: TRELLO_TOKEN, state: "complete" } }
      );
    }
  }

  // --- 5️⃣ Transferi (samo u svoje checkliste) ---
  const transfersDolazni = arrivalsForDay.filter(r => r.unitName.toLowerCase().includes("transfer dolazni"));
  const transfersOdlazni = arrivalsForDay.filter(r => r.unitName.toLowerCase().includes("transfer odlazni"));

  for (const res of transfersDolazni) {
    const itemName = `${res.unitName} / ${res.guestName} / ${getShortChannelName(res.salesChannelName)} / ${res.guestNumber}pax`;
    await axios.post(
      `https://api.trello.com/1/checklists/${checklistMap["TRANSFER DOLAZNI 🚐"]}/checkItems`,
      null,
      { params: { key: TRELLO_KEY, token: TRELLO_TOKEN, name: itemName } }
    );
  }

  for (const res of transfersOdlazni) {
    const itemName = `${res.unitName} / ${res.guestName} / ${getShortChannelName(res.salesChannelName)} / ${res.guestNumber}pax`;
    await axios.post(
      `https://api.trello.com/1/checklists/${checklistMap["TRANSFER ODLAZNI 🚐"]}/checkItems`,
      null,
      { params: { key: TRELLO_KEY, token: TRELLO_TOKEN, name: itemName } }
    );
  }

  // --- 6️⃣ eVisitor ---
  const evisitorEntries = arrivalsForDay.map(res => ({
    unitNumber: res.unitNumber,
    itemName: `${res.unitName} / ${res.guestName} / ${getShortChannelName(res.salesChannelName)} / ${res.guestNumber}pax`,
    checkedIn: res.checkedIn,
  })).sort((a, b) => (a.unitNumber || 9999) - (b.unitNumber || 9999));

  for (const entry of evisitorEntries) {
    const itemRes = await axios.post(
      `https://api.trello.com/1/checklists/${checklistMap["EVISITOR ✍🏻"]}/checkItems`,
      null,
      { params: { key: TRELLO_KEY, token: TRELLO_TOKEN, name: entry.itemName } }
    );
    if (entry.checkedIn === "Y") {
      await axios.put(
        `https://api.trello.com/1/cards/${cardId}/checkItem/${itemRes.data.id}`,
        null,
        { params: { key: TRELLO_KEY, token: TRELLO_TOKEN, state: "complete" } }
      );
    }
  }

  // --- 7️⃣ Cleaning ---
  for (const res of departuresForDay) {
    const checklistGroup = getChecklistGroup(res.unitNumber, true);
    if (!checklistGroup) continue;
    const checklistId = checklistMap[checklistGroup];
    const itemName = `${res.unitName} / ${res.guestName} / ${getShortChannelName(res.salesChannelName)} / ${res.guestNumber}pax`;

    await axios.post(
      `https://api.trello.com/1/checklists/${checklistId}/checkItems`,
      null,
      { params: { key: TRELLO_KEY, token: TRELLO_TOKEN, name: itemName } }
    );
  }

  console.log(`📋 Gotova kartica: ${cardName}`);
}*/




async function createCardsForCurrentMonth() {
  await fetchReservations("data.json");
  const today = new Date();
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

