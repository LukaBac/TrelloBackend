This Node.js application automates Trello board management for apartment complexes in Dubrovnik.

It connects to Rentlio and Trello APIs to automatically:
  Create and update daily Trello cards for arrivals, departures, and cleaning schedules
  Sync reservations in real time — adding, modifying, or removing checklist items as bookings change
  Refresh monthly boards at the start of each month
  Maintain logs and configuration for fully unattended operation

The system runs continuously, refreshing on a configurable interval to ensure Trello always reflects the current state of reservations.
