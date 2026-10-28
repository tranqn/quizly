// Bibliothek: Quiz aus einem Link erstellen, eigene Quizze anzeigen und löschen.

// The backend answers in one long request, so the steps only follow typical
// durations. The note under the list says that it takes one to three minutes.
const PROGRESS_STEP_DELAYS = [0, 15000, 60000];

let progressTimers = [];
let quizToDelete = null;

async function init() {
  initAppHeader();
  initFooter();
  setupCreateForm();
  document.addEventListener("click", closeMenusOnOutsideClick);
  document.addEventListener("keydown", closeMenusOnEscape);
  document.getElementById("delete-dialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDeleteDialog();
  });
  await loadLibrary();
}

/** Also used by "Erneut versuchen" after a failed load. */
async function loadLibrary() {
  // Without a session apiFetch is already redirecting to the login; the
  // pending link must survive until the user is back here.
  if (await renderLibrary()) handlePendingUrl();
}

/* ---------- Quiz erstellen ---------- */

function setupCreateForm() {
  const form = document.getElementById("create-form");
  const input = document.getElementById("url");

  if (isGuest()) {
    document.getElementById("guest-notice").hidden = false;
    form.querySelector("fieldset").disabled = true;
    return;
  }

  input.addEventListener("input", () => updateUrlPreview(false));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    startCreation();
  });
}

function updateUrlPreview(showError) {
  const input = document.getElementById("url");
  const hint = document.getElementById("url-hint");
  const preview = document.querySelector(".url-preview");
  const value = input.value.trim();
  const id = getYouTubeId(value);

  if (id) {
    preview.querySelector("img").src = getYouTubeThumbnail(id);
    preview.hidden = false;
    input.removeAttribute("aria-invalid");
    hint.textContent = "";
    return true;
  }

  preview.hidden = true;
  if (showError) {
    input.setAttribute("aria-invalid", "true");
    hint.textContent = value
      ? "Das ist kein YouTube-Link. Kopiere die Adresse direkt aus YouTube."
      : "Bitte füge zuerst einen YouTube-Link ein.";
  }
  return false;
}

async function startCreation() {
  if (!updateUrlPreview(true)) {
    document.getElementById("url").focus();
    return;
  }
  const url = document.getElementById("url").value.trim();
  showProgress(true);
  const result = await createQuiz(url);

  if (result.data) {
    window.location.href = `/pages/quizoverview.html?id=${result.data.id}`;
    return;
  }

  showProgress(false);
  const hint = document.getElementById("url-hint");
  hint.textContent = result.error;
  showToastMessage(true, result.error);
}

function showProgress(running) {
  const progress = document.getElementById("create-progress");
  const fieldset = document.querySelector("#create-form fieldset");
  const steps = progress.querySelectorAll(".progress__steps li");

  progressTimers.forEach(clearTimeout);
  progressTimers = [];
  fieldset.disabled = running;
  progress.hidden = !running;
  steps.forEach((step) => step.removeAttribute("aria-current"));
  if (!running) return;

  PROGRESS_STEP_DELAYS.forEach((delay, index) => {
    progressTimers.push(
      setTimeout(() => {
        steps.forEach((step, i) => {
          step.classList.toggle("is-done", i < index);
          if (i === index) step.setAttribute("aria-current", "step");
          else step.removeAttribute("aria-current");
        });
      }, delay),
    );
  });
}

/** A link entered on the start page before login is created right away. */
function handlePendingUrl() {
  const pending = getPendingUrl();
  if (!pending) return;
  setPendingUrl(null);
  document.getElementById("url").value = pending;
  updateUrlPreview(false);
  // Guests cannot create quizzes; the notice above the form explains why.
  if (!isGuest()) startCreation();
}

/* ---------- Liste ---------- */

async function renderLibrary() {
  const list = document.getElementById("quiz-list");
  const empty = document.getElementById("library-empty");
  const error = document.getElementById("library-error");

  empty.hidden = true;
  error.hidden = true;
  list.setAttribute("aria-busy", "true");
  list.innerHTML = getSkeletonCards(3);

  const quizzes = await loadQuizzes();
  list.setAttribute("aria-busy", "false");

  if (!quizzes) {
    list.innerHTML = "";
    error.hidden = false;
    return false;
  }

  updateCount(quizzes.length);
  list.innerHTML = quizzes.map(getQuizCardTemplate).join("");
  empty.hidden = quizzes.length > 0;
  return true;
}

function updateCount(count) {
  document.getElementById("library-count").textContent =
    count === 1 ? "1 Quiz" : `${count} Quizze`;
}

function getSkeletonCards(count) {
  return Array.from(
    { length: count },
    () => `<li class="quiz-card quiz-card--skeleton" aria-hidden="true">
             <div class="quiz-card__thumb"></div>
             <div class="skeleton-line"></div>
             <div class="skeleton-line skeleton-line--short"></div>
           </li>`,
  ).join("");
}

function getQuizCardTemplate(quiz) {
  const videoId = getYouTubeId(quiz.video_url);
  const thumb = videoId ? getYouTubeThumbnail(videoId) : "/assets/img/thumbnail.png";
  const title = escapeHtml(quiz.title);
  const count = quiz.questions.length;
  const result = getResults()[quiz.id];
  const score = result
    ? `Zuletzt ${result.correct} von ${result.total} richtig`
    : "Noch nicht gelöst";

  return `
    <li class="quiz-card" id="quiz-card-${quiz.id}">
      <a class="quiz-card__link" href="/pages/quizoverview.html?id=${quiz.id}">
        <img class="quiz-card__thumb" src="${thumb}" alt="" width="320" height="180" loading="lazy" />
        <h3 class="quiz-card__title">${title}</h3>
      </a>
      <p class="quiz-card__meta">${count} Fragen · ${formatDate(quiz.created_at)}</p>
      <p class="quiz-card__score${result ? " has-result" : ""}">${score}</p>
      ${isGuest() ? "" : getCardMenuTemplate(quiz.id, title)}
    </li>`;
}

function getCardMenuTemplate(id, title) {
  return `
    <div class="quiz-card__menu">
      <button type="button" class="quiz-card__menu-button" aria-expanded="false"
              aria-controls="quiz-menu-${id}" aria-label="Aktionen für „${title}“"
              onclick="toggleMenu(this)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      <ul id="quiz-menu-${id}" class="quiz-card__menu-list" hidden>
        <li><a href="/pages/quizoverview.html?id=${id}">Titel bearbeiten</a></li>
        <li><button type="button" onclick="openDeleteDialog(${id})">Löschen</button></li>
      </ul>
    </div>`;
}

/* ---------- Kartenmenü ---------- */

function toggleMenu(button) {
  const open = button.getAttribute("aria-expanded") === "true";
  closeAllMenus();
  if (open) return;
  button.setAttribute("aria-expanded", "true");
  const list = document.getElementById(button.getAttribute("aria-controls"));
  list.hidden = false;
  list.querySelector("a, button").focus();
}

function closeAllMenus() {
  document.querySelectorAll(".quiz-card__menu-button[aria-expanded='true']").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
    document.getElementById(button.getAttribute("aria-controls")).hidden = true;
  });
}

function closeMenusOnOutsideClick(event) {
  if (!event.target.closest(".quiz-card__menu")) closeAllMenus();
}

function closeMenusOnEscape(event) {
  if (event.key !== "Escape") return;
  const openButton = document.querySelector(".quiz-card__menu-button[aria-expanded='true']");
  closeAllMenus();
  if (openButton) openButton.focus();
}

/* ---------- Löschen ---------- */

function openDeleteDialog(id) {
  closeAllMenus();
  quizToDelete = id;
  const title = document.querySelector(`#quiz-card-${id} .quiz-card__title`).textContent;
  document.getElementById("delete-name").textContent = title;
  document.getElementById("delete-dialog").showModal();
}

function closeDeleteDialog() {
  document.getElementById("delete-dialog").close();
  const menuButton = document.querySelector(`#quiz-card-${quizToDelete} .quiz-card__menu-button`);
  if (menuButton) menuButton.focus();
  quizToDelete = null;
}

async function confirmDelete() {
  const id = quizToDelete;
  document.getElementById("delete-dialog").close();
  quizToDelete = null;

  if (!(await removeQuiz(id))) {
    showToastMessage(true, "Das Quiz konnte nicht gelöscht werden. Bitte versuche es erneut.");
    document.querySelector(`#quiz-card-${id} .quiz-card__menu-button`)?.focus();
    return;
  }

  document.getElementById(`quiz-card-${id}`).remove();
  const remaining = document.querySelectorAll("#quiz-list .quiz-card").length;
  updateCount(remaining);
  document.getElementById("library-empty").hidden = remaining > 0;
  showToastMessage(false, "Quiz gelöscht.");
  document.getElementById("library-title").focus();
}
