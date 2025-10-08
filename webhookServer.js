// webhook-server.js
import express from "express";
import fs from "fs";
import axios from "axios";
import bodyParser from "body-parser";
import FormData from "form-data";
import { createCardForDay } from "./createCards.js"; // tvoja funkcija za kreiranje/izmjenu kartica
import { toLocalDateKey, handleNewReservation, handleCheckIn, handleDeleteReservation } from "./trello.js";

const app = express();
const PORT = 3000;

app.use(bodyParser.json());

// --- Webhook endpoint ---
app.post("/webhook/reservations", async (req, res) => {
  try {
    const payload = req.body;
    console.log("📩 Primljen webhook:", payload);

    if (!payload || payload.type !== "reservation.created") {
      console.log("ℹ️ Ignoriram jer nije nova rezervacija.");
      return res.status(200).send("ignored");
    }

    const r = payload.data; // rentlio šalje podatke unutar data

    // Kreiraj novu rezervaciju u istom formatu kao u fetchReservations
    const newRes = {
      id: r.id,
      unitName: r.unitName,
      unitNumber: parseInt(r.unitName.match(/^(\d+)/)?.[1] ?? null, 10),
      guestName: r.guestName,
      salesChannelName: r.salesChannelName,
      guestNumber:
        (r.adults || 0) + (r.childrenAbove12 || 0) + (r.childrenUnder12 || 0),
      arrivalDate: r.arrivalDate,
      departureDate: r.departureDate,
      totalNights: r.totalNights,
      note: r.note,
      checkedIn: r.checkedIn,
      checkedOut: r.checkedOut,
      canceledAt: r.canceledAt,
    };

    // --- Učitaj postojeći data.json ---
    let existingData = { reservations: [] };
    if (fs.existsSync("data.json")) {
      try {
        const content = fs.readFileSync("data.json", "utf-8");
        if (content.trim()) existingData = JSON.parse(content);
      } catch (err) {
        console.warn("⚠️ Neispravan data.json, kreiram novi.", err.message);
      }
    }

    // --- Dodaj novu rezervaciju ---
    existingData.reservations.push(newRes);

    // --- Spremi natrag ---
    fs.writeFileSync("data.json", JSON.stringify(existingData, null, 2));
    console.log(`✅ Dodana nova rezervacija ${newRes.id} u data.json`);

    // --- Ažuriraj Trello karticu za taj dan ---
    const arrivalDateKey = toLocalDateKey(newRes.arrivalDate);
    console.log(`📅 Trebam ažurirati karticu za ${arrivalDateKey}`);

    // ❗ Ovdje koristimo createCardForDay kako bi ili stvorili novu karticu
    // ili dohvatili postojeću i samo dodali stavku
    await createCardForDay(
      new Date(newRes.arrivalDate * 1000),
      { [arrivalDateKey]: [newRes] }, // šaljemo samo ovu rezervaciju
      {} // departures ne diramo
    );

    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Greška u webhook handleru:", err.message);
    res.status(500).send("error");
  }
});

app.post("/webhook", async (req, res) => {
  try {
    const event = req.body;

    // 🔑 Provjera da li je checkin
    if (!event.reservation || !event.reservation.checkedIn) {
      return res.status(200).send("Nije check-in događaj");
    }

    const reservationId = event.reservation.id;
    const data = JSON.parse(fs.readFileSync("data.json", "utf-8"));
    const reservation = data.reservations.find(r => r.id === reservationId);

    if (!reservation) {
      console.warn("Rezervacija nije pronađena u data.json:", reservationId);
      return res.status(404).send("Rezervacija nije pronađena");
    }

    // Pronađi karticu prema arrivalDate
    const card = await findCardByDate(reservation.arrivalDate);
    if (!card) {
      console.warn("Kartica za checkin ne postoji:", reservation.arrivalDate);
      return res.status(404).send("Kartica ne postoji");
    }

    // Pronađi checklist (transferi, normalni, evisitor)
    const checklistsRes = await axios.get(
      `https://api.trello.com/1/cards/${card.id}/checklists`,
      { params: { key: TRELLO_KEY, token: TRELLO_TOKEN } }
    );

    const checklists = checklistsRes.data;

    for (const checklist of checklists) {
      const item = checklist.checkItems.find(ci => ci.name.includes(reservation.unitName) && ci.name.includes(reservation.guestName));
      if (item) {
        // Označi kao checkirano
        await axios.put(
          `https://api.trello.com/1/cards/${card.id}/checklist/${checklist.id}/checkItem/${item.id}`,
          null,
          { params: { key: TRELLO_KEY, token: TRELLO_TOKEN, state: "complete" } }
        );
        console.log(`✅ Rezervacija checkirana: ${reservation.unitName} / ${reservation.guestName}`);
      }
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Greška webhook:", err.message);
    res.status(500).send("Error");
  }
});


// Endpoint za Rentlio webhook
app.post('/rentlio-webhook', async (req, res) => {
  const payload = req.body;

  // Provjeri tip događaja
  switch (payload.event) {
    case 'reservation.created':
      await handleNewReservation(payload.data);
      break;

    case 'reservation.checkedIn':
      await handleCheckIn(payload.data);
      break;

    case 'reservation.cancelled':
    case 'reservation.deleted':
      await handleDeleteReservation(payload.data);
      break;

    default:
      console.log('Neobrađen event:', payload.event);
  }

  res.status(200).send('OK');
});

app.listen(PORT, () => {
  console.log(`🚀 Webhook server sluša na http://localhost:${PORT}`);
});




