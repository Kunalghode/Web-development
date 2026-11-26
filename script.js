// ===== SEAT BOOKING: 3-step flow + saving the data =====

const TOTAL_SEATS = 12;               // change this to add or remove tables

// Paste your Google Apps Script web app URL here (see Step 3).
// Leave it empty ('') to save only in this browser while testing.
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyXYx6nuWpJHMia5DrSPxMxyXIeVpaG244m6o0EaFK2NTnVoaxsaSCAvy2qlF0PabRIFA/exec';

const LOCAL_KEY = 'cafeBookingList';

// ----- Elements -----
const dateInput   = document.getElementById('booking-date');
const timeSelect  = document.getElementById('booking-time');
const nameInput   = document.getElementById('booking-name');
const phoneInput  = document.getElementById('booking-phone');

const step1 = document.getElementById('step-1');
const step2 = document.getElementById('step-2');
const step3 = document.getElementById('step-3');
const progressSteps = document.querySelectorAll('.progress-step');

const step1Message = document.getElementById('step1-message');
const step2Message = document.getElementById('step2-message');
const bookingSummary = document.getElementById('booking-summary');
const finalSummary = document.getElementById('final-summary');

const seatGrid = document.getElementById('seat-grid');
const selectedInfo = document.getElementById('selected-info');

const confirmDetailsBtn = document.getElementById('confirm-details-btn');
const backBtn = document.getElementById('back-btn');
const confirmSeatBtn = document.getElementById('confirm-seat-btn');
const newBookingBtn = document.getElementById('new-booking-btn');

// ----- State -----
let bookingDetails = null;            // saved after Step 1
let selectedSeats = [];               // tables clicked in Step 2
let bookedSeats = [];                 // tables already taken for this date + time
let isSaving = false;                 // stops double clicks while saving

// ----- Date setup: past dates cannot be chosen -----
function todayString() {
  const now = new Date();
  return now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
}

dateInput.min = todayString();
dateInput.value = todayString();

// ===== SAVING AND LOADING DATA =====

function slotKey(date, time) {
  return date + '|' + time;           // example: "2026-11-25|18:00"
}

function getLocalList() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY)) || [];
  } catch (error) {
    return [];
  }
}

// Returns the table numbers already booked for a date + time
async function loadBookedSeats(date, time) {
  if (SCRIPT_URL) {
    const response = await fetch(SCRIPT_URL + '?slot=' + encodeURIComponent(slotKey(date, time)));
    const data = await response.json();
    return data.booked || [];
  }

  const booked = [];
  getLocalList().forEach(function (b) {
    if (b.date === date && b.time === time) {
      b.seats.forEach(function (s) { booked.push(s); });
    }
  });
  return booked;
}

// Saves one full booking. Returns { ok: true } or { ok: false, clash: [...], error: '...' }
async function saveBooking(booking) {
  if (SCRIPT_URL) {
    // No headers on purpose: Google Apps Script accepts this simple request from any website
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(booking)
    });
    return await response.json();
  }

  // Browser-only saving
  const taken = await loadBookedSeats(booking.date, booking.time);
  const clash = booking.seats.filter(function (s) { return taken.includes(s); });
  if (clash.length > 0) {
    return { ok: false, clash: clash };
  }

  const list = getLocalList();
  list.push(booking);
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  } catch (error) {
    return { ok: false, error: 'Could not save. Please allow site storage and try again.' };
  }
  return { ok: true };
}

// ===== HELPERS =====

function showStep(number) {
  [step1, step2, step3].forEach(function (el, index) {
    el.classList.toggle('active', index === number - 1);
  });

  progressSteps.forEach(function (el, index) {
    el.classList.toggle('active', index === number - 1);
    el.classList.toggle('done', index < number - 1);
  });
}

function formatDate(dateString) {
  return new Date(dateString + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function seatNames(seats) {
  return seats
    .slice()
    .sort(function (a, b) { return a - b; })
    .map(function (s) { return 'T' + s; })
    .join(', ');
}

function timeLabel() {
  return timeSelect.options[timeSelect.selectedIndex].text;
}

function isPastSlot(dateString, timeString) {
  const parts = timeString.split(':');
  const slot = new Date(dateString + 'T00:00:00');
  slot.setHours(Number(parts[0]), Number(parts[1]), 0, 0);
  return slot < new Date();
}

function setMessage(element, text, isError) {
  element.textContent = text;
  element.className = isError ? 'booking-message error' : 'booking-message';
}

// ===== STEP 2: draw the tables =====

function drawSeats() {
  seatGrid.innerHTML = '';

  for (let i = 1; i <= TOTAL_SEATS; i++) {
    const seat = document.createElement('button');
    seat.type = 'button';
    seat.className = 'seat';
    seat.textContent = 'T' + i;

    if (bookedSeats.includes(i)) {
      seat.classList.add('booked');
      seat.disabled = true;
    } else if (selectedSeats.includes(i)) {
      seat.classList.add('selected');
    }

    seat.addEventListener('click', function () {
      setMessage(step2Message, '', false);
      if (selectedSeats.includes(i)) {
        selectedSeats = selectedSeats.filter(function (s) { return s !== i; });
      } else {
        selectedSeats.push(i);
      }
      drawSeats();
    });

    seatGrid.appendChild(seat);
  }

  selectedInfo.textContent = selectedSeats.length
    ? 'Selected: ' + seatNames(selectedSeats)
    : 'No table selected';
}

// Loads the booked tables, then draws them
async function loadAndDrawSeats() {
  seatGrid.textContent = 'Loading tables...';
  selectedInfo.textContent = '';

  try {
    bookedSeats = await loadBookedSeats(bookingDetails.date, bookingDetails.time);
  } catch (error) {
    seatGrid.textContent = '';
    setMessage(step2Message, 'Could not load the tables. Check your internet and try again.', true);
    return;
  }
  drawSeats();
}

// ===== STEP 1: Confirm Booking (details) =====
confirmDetailsBtn.addEventListener('click', function () {
  const name = nameInput.value.trim();
  const phone = phoneInput.value.trim();
  const date = dateInput.value;
  const time = timeSelect.value;

  if (!date) { setMessage(step1Message, 'Please choose a date.', true); return; }
  if (isPastSlot(date, time)) { setMessage(step1Message, 'That time has already passed. Please choose a later time.', true); return; }
  if (name === '') { setMessage(step1Message, 'Please enter your name.', true); return; }
  if (phone.replace(/\D/g, '').length !== 10) { setMessage(step1Message, 'Please enter a valid 10-digit phone number.', true); return; }

  bookingDetails = { name: name, phone: phone, date: date, time: time, timeText: timeLabel() };
  selectedSeats = [];

  setMessage(step1Message, '', false);
  setMessage(step2Message, '', false);
  bookingSummary.textContent =
    'Hello ' + name + '!\n' +
    formatDate(date) + ' at ' + bookingDetails.timeText + '\n' +
    'Choose your table below.';

  showStep(2);
  loadAndDrawSeats();
});

// ===== STEP 2: Back =====
backBtn.addEventListener('click', function () {
  showStep(1);
});

// ===== STEP 2: Confirm Seat (saves the data) =====
confirmSeatBtn.addEventListener('click', async function () {
  if (isSaving) { return; }

  if (selectedSeats.length === 0) {
    setMessage(step2Message, 'Please select at least one table.', true);
    return;
  }

  isSaving = true;
  confirmSeatBtn.disabled = true;
  confirmSeatBtn.textContent = 'Saving...';
  setMessage(step2Message, '', false);

  const booking = {
    id: 'KC' + Date.now().toString().slice(-6),
    name: bookingDetails.name,
    phone: bookingDetails.phone,
    date: bookingDetails.date,
    time: bookingDetails.time,
    timeText: bookingDetails.timeText,
    seats: selectedSeats.slice().sort(function (a, b) { return a - b; }),
    savedAt: new Date().toISOString()
  };

  try {
    const result = await saveBooking(booking);

    if (!result.ok) {
      if (result.clash && result.clash.length > 0) {
        // Someone took these tables first: refresh and ask again
        selectedSeats = selectedSeats.filter(function (s) { return !result.clash.includes(s); });
        await loadAndDrawSeats();
        setMessage(step2Message, 'Table ' + seatNames(result.clash) + ' was just booked. Please choose another.', true);
      } else {
        setMessage(step2Message, result.error || 'Could not save the booking. Please try again.', true);
      }
    } else {
      finalSummary.textContent =
        'Booking ID: ' + booking.id + '\n' +
        'Name: ' + booking.name + '\n' +
        'Date: ' + formatDate(booking.date) + '\n' +
        'Time: ' + booking.timeText + '\n' +
        'Table: ' + seatNames(booking.seats);
      showStep(3);
    }
  } catch (error) {
    setMessage(step2Message, 'Could not save the booking. Check your internet and try again.', true);
  }

  isSaving = false;
  confirmSeatBtn.disabled = false;
  confirmSeatBtn.textContent = 'Confirm Seat';
});

// ===== STEP 3: Book Another Seat =====
newBookingBtn.addEventListener('click', function () {
  bookingDetails = null;
  selectedSeats = [];
  nameInput.value = '';
  phoneInput.value = '';
  dateInput.value = todayString();
  timeSelect.selectedIndex = 0;
  setMessage(step1Message, '', false);
  showStep(1);
});