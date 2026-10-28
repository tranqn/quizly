// Quiz-Übersicht: Video, Start, Titel und Beschreibung bearbeiten, weitere Quizze.

const MORE_QUIZZES_LIMIT = 5;

let currentQuiz = null;
let hasUnsavedEdits = false;

async function init() {
  initAppHeader();
  initFooter();

  const id = getQuizID();
  currentQuiz = id ? await loadQuizzes(id) : null;
  document.getElementById("overview-loading").hidden = true;

  if (!currentQuiz) {
    document.getElementById("overview-error").hidden = false;
    return;
  }

  renderQuiz();
  setupEditForm();
  document.getElementById("overview-content").hidden = false;
  renderMoreQuizzes(await loadQuizzes());
}

function renderQuiz() {
  document.title = `${currentQuiz.title} · Quizly`;
  document.getElementById("quiz-heading").textContent = currentQuiz.title;
  const description = document.getElementById("quiz-description");
  description.textContent = currentQuiz.description;
  description.hidden = !currentQuiz.description;

  const result = getResults()[currentQuiz.id];
  const resultText = result
    ? ` · zuletzt ${result.correct} von ${result.total} richtig`
    : "";
  document.getElementById("quiz-meta").textContent =
    `${currentQuiz.questions.length} Fragen · erstellt am ${formatDate(currentQuiz.created_at)}${resultText}`;

  document.getElementById("start-link").href = `/pages/quiz.html?id=${currentQuiz.id}`;
  document.getElementById("start-link").textContent = result ? "Nochmal lösen" : "Quiz starten";

  const video = document.getElementById("quiz-video");
  const videoId = getYouTubeId(currentQuiz.video_url);
  if (videoId) {
    // The no-cookie host sets no tracking cookies until the visitor presses play.
    video.src = `https://www.youtube-nocookie.com/embed/${videoId}`;
    video.title = `YouTube-Video: ${currentQuiz.title}`;
  } else {
    video.parentElement.hidden = true;
  }
}

/* ---------- Bearbeiten ---------- */

function setupEditForm() {
  const section = document.getElementById("edit-section");
  if (isGuest()) {
    section.remove();
    return;
  }
  document.getElementById("headline").value = currentQuiz.title;
  document.getElementById("description").value = currentQuiz.description;
  const form = document.getElementById("edit-form");
  form.addEventListener("submit", saveQuiz);
  form.addEventListener("input", () => (hasUnsavedEdits = true));
  window.addEventListener("beforeunload", (event) => {
    if (hasUnsavedEdits) event.preventDefault();
  });
}

async function saveQuiz(event) {
  event.preventDefault();
  const status = document.getElementById("edit-status");
  const title = document.getElementById("headline").value.trim();

  if (!title) {
    status.textContent = "Der Titel darf nicht leer sein.";
    document.getElementById("headline").focus();
    return;
  }

  status.textContent = "Wird gespeichert …";
  const updated = await updateQuiz(currentQuiz.id, {
    title,
    description: document.getElementById("description").value.trim(),
  });

  if (!updated) {
    status.textContent = "Speichern hat nicht geklappt. Bitte versuche es erneut.";
    return;
  }
  currentQuiz = { ...currentQuiz, ...updated };
  hasUnsavedEdits = false;
  renderQuiz();
  status.textContent = "Gespeichert.";
}

/* ---------- Weitere Quizze ---------- */

function renderMoreQuizzes(quizzes) {
  const others = (quizzes || []).filter((quiz) => quiz.id !== currentQuiz.id);
  const section = document.querySelector(".overview-more");
  if (!others.length) {
    section.hidden = true;
    return;
  }
  document.getElementById("more-quizzes").innerHTML = others
    .slice(0, MORE_QUIZZES_LIMIT)
    .map(
      (quiz) => `
        <li>
          <a href="/pages/quizoverview.html?id=${quiz.id}">${escapeHtml(quiz.title)}</a>
          <span>${quiz.questions.length} Fragen · ${formatDate(quiz.created_at)}</span>
        </li>`,
    )
    .join("");
}
