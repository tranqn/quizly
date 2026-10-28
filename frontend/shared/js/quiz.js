// Quiz lösen: eine Frage nach der anderen, danach Auswertung pro Frage.

const ANSWER_KEYS = ["A", "B", "C", "D"];

let currentQuiz = null;
let currentIndex = 0;
let chosenAnswers = [];

async function initQuiz() {
  initAppHeader();
  initFooter();

  const id = getQuizID();
  document.getElementById("back-link").href = `/pages/quizoverview.html?id=${id}`;
  currentQuiz = id ? await loadQuizzes(id) : null;
  document.getElementById("quiz-loading").hidden = true;

  if (!currentQuiz || !currentQuiz.questions?.length) {
    document.getElementById("quiz-error").hidden = false;
    return;
  }

  document.title = `${currentQuiz.title} · Quizly`;
  document.getElementById("quiz-title").textContent = currentQuiz.title;
  document.getElementById("prev-button").addEventListener("click", previousQuestion);
  document.getElementById("next-button").addEventListener("click", nextQuestion);
  document.addEventListener("keydown", handleShortcut);
  restartQuiz();
}

function restartQuiz() {
  currentIndex = 0;
  chosenAnswers = [];
  document.getElementById("quiz-result").hidden = true;
  document.getElementById("quiz-play").hidden = false;
  renderQuestion(false);
}

/* ---------- Frage ---------- */

function renderQuestion(moveFocus = true) {
  const questions = currentQuiz.questions;
  const question = questions[currentIndex];
  const total = questions.length;

  document.getElementById("question-amount").textContent = `Frage ${currentIndex + 1} von ${total}`;
  const bar = document.getElementById("quiz-progress-bar");
  bar.setAttribute("aria-valuemax", total);
  bar.setAttribute("aria-valuenow", currentIndex + 1);
  bar.style.setProperty("--progress", `${((currentIndex + 1) / total) * 100}%`);

  document.getElementById("question-title").textContent = question.question_title;
  document.getElementById("answers").innerHTML = question.question_options
    .map((option, i) => getAnswerTemplate(option, i))
    .join("");
  document
    .querySelectorAll("#answers input")
    .forEach((input) => input.addEventListener("change", updateNavigation));

  document.getElementById("prev-button").hidden = currentIndex === 0;
  document.getElementById("next-button").textContent =
    currentIndex === total - 1 ? "Auswerten" : "Weiter";
  updateNavigation();

  if (moveFocus) document.getElementById("question-title").focus();
}

function getAnswerTemplate(option, index) {
  const checked = chosenAnswers[currentIndex] === option ? "checked" : "";
  return `
    <label class="answer">
      <input type="radio" name="answer" value="${escapeHtml(option)}" ${checked} />
      <span class="answer__key" aria-hidden="true">${ANSWER_KEYS[index]}</span>
      <span class="answer__text">${escapeHtml(option)}</span>
    </label>`;
}

function getSelectedAnswer() {
  return document.querySelector("#answers input:checked")?.value ?? null;
}

function updateNavigation() {
  document.getElementById("next-button").disabled = getSelectedAnswer() === null;
}

function nextQuestion() {
  const answer = getSelectedAnswer();
  if (answer === null) return;
  chosenAnswers[currentIndex] = answer;

  if (currentIndex < currentQuiz.questions.length - 1) {
    currentIndex++;
    renderQuestion();
  } else {
    showResult();
  }
}

function previousQuestion() {
  const answer = getSelectedAnswer();
  if (answer !== null) chosenAnswers[currentIndex] = answer;
  if (currentIndex === 0) return;
  currentIndex--;
  renderQuestion();
}

/** 1 to 4 or A to D pick an answer, Enter moves on. */
function handleShortcut(event) {
  if (document.getElementById("quiz-play").hidden) return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;

  const key = event.key.toUpperCase();
  const index = ["1", "2", "3", "4"].includes(key) ? Number(key) - 1 : ANSWER_KEYS.indexOf(key);
  const inputs = document.querySelectorAll("#answers input");

  if (index >= 0 && index < inputs.length) {
    event.preventDefault();
    inputs[index].checked = true;
    inputs[index].focus();
    updateNavigation();
    return;
  }

  if (event.key === "Enter" && event.target.closest?.("#answers, .question__title")) {
    event.preventDefault();
    nextQuestion();
  }
}

/* ---------- Ergebnis ---------- */

function showResult() {
  const questions = currentQuiz.questions;
  const correct = questions.filter((q, i) => chosenAnswers[i] === q.answer).length;
  const total = questions.length;
  const percent = Math.round((correct / total) * 100);

  saveResult(currentQuiz.id, correct, total);

  document.getElementById("quiz-play").hidden = true;
  document.getElementById("quiz-result").hidden = false;

  const ring = document.getElementById("score-ring");
  ring.style.setProperty("--score", percent);
  ring.classList.toggle("is-low", percent < 50);
  document.getElementById("score-percent").textContent = `${percent} %`;
  document.getElementById("result-title").textContent = getResultHeadline(percent);
  document.getElementById("result-text").textContent =
    `Du hast ${correct} von ${total} Fragen richtig beantwortet.`;
  document.getElementById("answer-review").innerHTML = questions
    .map((q, i) => getReviewTemplate(q, i))
    .join("");

  document.getElementById("result-title").focus();
}

function getResultHeadline(percent) {
  if (percent >= 80) return "Stark, fast alles gewusst!";
  if (percent >= 50) return "Gut gemacht!";
  return "Da geht noch mehr.";
}

function getReviewTemplate(question, index) {
  const chosen = chosenAnswers[index];
  const isCorrect = chosen === question.answer;
  const status = isCorrect ? "Richtig" : "Falsch";
  const correctLine = isCorrect
    ? ""
    : `<p class="review__correct">${getStatusIcon(true)}Richtig wäre: ${escapeHtml(question.answer)}</p>`;

  return `
    <li class="review__item ${isCorrect ? "is-correct" : "is-wrong"}">
      <p class="review__question">${escapeHtml(question.question_title)}</p>
      <p class="review__answer">
        ${getStatusIcon(isCorrect)}<span class="sr-only">${status}. </span>Deine Antwort: ${escapeHtml(chosen)}
      </p>
      ${correctLine}
    </li>`;
}

function getStatusIcon(isCorrect) {
  const path = isCorrect ? '<path d="M20 6 9 17l-5-5" />' : '<path d="M18 6 6 18" /><path d="m6 6 12 12" />';
  return `<svg class="review__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}
