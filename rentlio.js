const axios = require('axios');
const fs = require('fs');

const API_TOKEN = 'NFpi5hJ11jSUL9Efq0Z8eoQYRaJ0hlDY';
const API_BASE = 'https://api.rentl.io/v1';

/*async function fetchData() {
  try {
    // --- Dohvat properties ---
    const propRes = await axios.get(`${API_BASE}/properties?apikey=${API_TOKEN}`);
    const propertiesRaw = propRes.data.data;

    const properties = propertiesRaw.map(property => ({
      id: property.id,
      name: property.name,
      address: property.address,
      city: property.city
    }));

    // --- Dohvat reservations ---
    const resRes = await axios.get(`${API_BASE}/reservations?apikey=${API_TOKEN}`);
    const reservationsRaw = resRes.data.data;

    const reservations = reservationsRaw.map(reservation => ({
      id: reservation.id,
      guestName: reservation.guestName,
      unitName: reservation.unitName,
      note: reservation.note || ''
    }));

    // --- Zajednički zapis ---
    const output = {
      properties,
      reservations
    };

    fs.writeFileSync('data.json', JSON.stringify(output, null, 2), 'utf8');
    console.log('✅ Podaci spremljeni u data.json');

  } catch (error) {
    console.error('❌ Greška:', error.response?.data || error.message);
  }
}

fetchData();*/

async function fetchAndSaveAllData() {
  // 👉 dohvati properties
  const propertiesResponse = await axios.get(`${API_BASE}/properties?apikey=${API_TOKEN}`);
  const propertiesRaw = propertiesResponse.data.data;

  const properties = propertiesRaw.slice(0, 5).map(p => ({
    id: p.id,
    name: p.name,
    address: p.address,
    city: p.city
  }));

  // 👉 dohvati rezervacije
  const reservationsResponse = await axios.get(`${API_BASE}/reservations?apikey=${API_TOKEN}`);
  const reservationsRaw = reservationsResponse.data.data;

  const reservations = reservationsRaw.slice(0, 5).map(r => ({
    id: r.id,
    guestName: r.guestName,
    unitName: r.unitName,
    note: r.note
  }));

  // 👉 upiši u file
  fs.writeFileSync('data.json', JSON.stringify({ properties, reservations }, null, 2));
  console.log('✅ Rentlio podaci spremljeni u data.json (5 properties + 5 reservations)');
}

async function previewDataFromAPI() {
  try {
    // 👉 PROPERTIES
    const propertiesResponse = await axios.get(`${API_BASE}/properties?apikey=${API_TOKEN}`);
    const properties = propertiesResponse.data.data;

    console.log('\n🏨 PROPERTIES:');
    properties.forEach(p => {
      console.log('------------------------------');
      console.log(`ID:      ${p.id}`);
      console.log(`Name:    ${p.name}`);
      console.log(`Address: ${p.address}`);
      console.log(`City:    ${p.city}`);
    });

    // 👉 RESERVATIONS
    const reservationsResponse = await axios.get(`${API_BASE}/reservations?apikey=${API_TOKEN}`);
    const reservations = reservationsResponse.data.data;

    console.log('\n📅 RESERVATIONS:');
    reservations.forEach(r => {
      const readable = new Date(r.arrivalDate * 1000).toLocaleString("hr-HR", {
          timeZone: "Europe/Zagreb"
        });
      console.log('------------------------------');
      console.log(`ID:        ${r.id}`);
      console.log(`Guest:     ${r.guestName}`);
      console.log(`Unit:      ${r.unitName}`);
      console.log(`Note:      ${r.note || '—'}`);
      console.log(`Note:      ${readable || '—'}`);
    });

  } catch (err) {
    console.error('❌ Greška kod dohvata podataka:', err.response?.data || err.message);
  }
}

async function previewRawAPI() {
  try {
    // 👉 PROPERTIES
    const propertiesResponse = await axios.get(`${API_BASE}/properties?apikey=${API_TOKEN}`);
    console.log('\n🏨 PRVA 3 PROPERTIJA:');
    console.log(JSON.stringify(propertiesResponse.data.data.slice(0, 3), null, 2));

    // 👉 RESERVATIONS
    const reservationsResponse = await axios.get(`${API_BASE}/reservations?apikey=${API_TOKEN}`);
    console.log('\n📅 PRVE 3 REZERVACIJE:');
    console.log(JSON.stringify(reservationsResponse.data.data.slice(0, 3), null, 2));

  } catch (err) {
    console.error('❌ Greška kod dohvata podataka:', err.response?.data || err.message);
  }
}

/*async function previewRawAPI() {
  try {
    const reservationsResponse = await axios.get(`${API_BASE}/reservations?apikey=${API_TOKEN}`);
    const reservationsRaw = reservationsResponse.data.data;

    // timestamp za početak 2025 (1.1.2025 u 00:00h)
    const start2025 = Math.floor(new Date("2025-01-01T00:00:00Z").getTime() / 1000);

    // filtriraj rezervacije
    const reservations = reservationsRaw.filter(r => (r.arrivalDate || 0) >= start2025);

    console.log("\n📅 --- RESERVATIONS FROM 2025 ---");
    reservations.forEach(r => {
      console.log(JSON.stringify(r, null, 2));
      if (r.arrivalDate) {
        const readable = new Date(r.arrivalDate * 1000).toLocaleString("hr-HR", {
          timeZone: "Europe/Zagreb"
        });
        console.log(`   📆 Arrival (readable): ${readable}`);
      }
      console.log('-------------------------');
    });

  } catch (err) {
    console.error('❌ Greška kod dohvaćanja rezervacija:', err.response?.data || err.message);
  }
}*/


async function previewReservationsByDate(targetDateStr) {
  try {
    // 📅 Pretvori zadani datum (npr. "2023-05-20") u timestamp bez vremena
    const targetDate = new Date(targetDateStr);
    const targetStart = new Date(targetDate.setHours(0, 0, 0, 0)).getTime();
    const targetEnd = new Date(targetDate.setHours(23, 59, 59, 999)).getTime();
    const dateFrom = '2025-09-01';
    const dateTo = '2025-09-30';

    // 👉 Dohvati rezervacije sa API-ja
    const response = await axios.get(`${API_BASE}/reservations`, {
      params: {
        apikey: API_TOKEN,
        perPage: 100,       // koliko rezervacija po stranici
        page: 1,
        dateFrom: dateFrom,
        dateTo: dateTo
      }
    });
    const reservations = response.data.data;

    // 👉 Filtriraj
    const filtered = reservations.filter(r => {
      const arrival = r.arrivalDate * 1000; // pretvori u ms
      return arrival >= targetStart && arrival <= targetEnd;
    });

    console.log(`\n📅 Rezervacije za ${targetDateStr}:`);
    console.log(JSON.stringify(filtered, null, 2));

  } catch (err) {
    console.error('❌ Greška kod dohvaćanja rezervacija:', err.response?.data || err.message);
  }
}

function getUnitNumber(unitName) {
  const match = unitName.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

async function fetchReservationsSeptember2025() {
  try {
    // Definiramo dateFrom i dateTo za 9. mjesec 2025.
    const dateFrom = '2025-09-01';
    const dateTo = '2025-09-30';

    const response = await axios.get(`${API_BASE}/reservations`, {
      params: {
        apikey: API_TOKEN,
        perPage: 100,       // koliko rezervacija po stranici
        page: 1,
        dateFrom: dateFrom,
        dateTo: dateTo
      }
    });

    const reservations = response.data.data;

    console.log(`📌 Rezervacije u rujnu 2025: ${reservations.length}\n`);
    reservations.forEach(r => {
      console.log(r);  // Ispisujemo cijeli objekt
      console.log('--------------------------');
    });

  } catch (err) {
    console.error('❌ Greška:', err.response?.data || err.message);
  }
}

async function fetchReservations(fileName) {
  try {
    // 📅 Odredi početak i kraj trenutnog mjeseca
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split('T')[0];

    console.log(`📅 Dohvaćam rezervacije od ${firstDay} do ${lastDay}...`);

    let allReservations = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      console.log(`📄 Stranica: ${page}`);
      const response = await axios.get(`${API_BASE}/reservations`, {
        params: {
          apikey: API_TOKEN,
          perPage,
          page,
          dateFrom: firstDay,
          dateTo: lastDay
        }
      });

      const data = response.data.data || [];
      if (data.length === 0) break; // više nema rezultata

      allReservations = allReservations.concat(data);
      if (data.length < perPage) break; // zadnja stranica
      page++;
    }

    allReservations = allReservations.filter(r => [1, 4].includes(r.status));
    
    const reservations = allReservations.map(r => ({
      id: r.id,
      unitNumber: getUnitNumber(r.unitName),
      unitName: r.unitName,
      guestName: r.guestName,
      salesChannelName: r.salesChannelName,
      guestNumber: (r.adults || 0) + (r.childrenAbove12 || 0) + (r.childrenUnder12 || 0),
      arrivalDate: r.arrivalDate,
      departureDate: r.departureDate,
      totalNights: r.totalNights,
      note: r.note,
      checkedIn: r.checkedIn,
      checkedOut: r.checkedOut,
      status: r.status
    }));

    // ✅ Sigurno učitaj data.json
    let existingData = { reservations: [] };
    if (fs.existsSync(fileName)) {
      try {
        const content = fs.readFileSync(fileName, 'utf-8');
        if (content.trim()) {
          existingData = JSON.parse(content);
        }
      } catch (e) {
        console.warn(`⚠️ Neispravan ${fileName}, kreiram novi.`, e.message);
      }
    }

    // Zamijeni rezervacije
    const newData = {
      ...existingData,
      reservations
    };

    fs.writeFileSync(fileName, JSON.stringify(newData, null, 2));
    console.log(`✅ Spremljeno ${reservations.length} rezervacija u ${fileName}`);

  } catch (error) {
    console.error('❌ Greška prilikom dohvaćanja rezervacija:', error.response?.data || error.message);
  }
}

module.exports = { fetchReservations, previewDataFromAPI, previewRawAPI };

