// Small client-side session state. The auth tokens themselves live in HttpOnly
// cookies; this only remembers what the UI needs to know between pages.

const GUEST_KEY = "quizly:guest";
const PENDING_URL_KEY = "quizly:pending-url";
const RESULTS_KEY = "quizly:results";

function readStorage(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage, key, value) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the UI simply forgets the value.
  }
}

/** True while the shared read-only demo account is logged in. */
function isGuest() {
  return readStorage(localStorage, GUEST_KEY) === "1";
}

function setGuest(guest) {
  writeStorage(localStorage, GUEST_KEY, guest ? "1" : null);
}

/** A YouTube URL entered before login, created as quiz right after it. */
function getPendingUrl() {
  return readStorage(sessionStorage, PENDING_URL_KEY);
}

function setPendingUrl(url) {
  writeStorage(sessionStorage, PENDING_URL_KEY, url);
}

/** Last result per quiz id: { correct, total, date }. Stored per device only. */
function getResults() {
  try {
    return JSON.parse(readStorage(localStorage, RESULTS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveResult(quizId, correct, total) {
  const results = getResults();
  results[quizId] = { correct, total, date: new Date().toISOString() };
  writeStorage(localStorage, RESULTS_KEY, JSON.stringify(results));
}
