/**
 * Generates a quiz from a YouTube URL. Returns { data } on success or
 * { error } with a message the UI can show as is.
 */
async function createQuiz(url) {
  try {
    const response = await apiFetch(CREATE_QUIZ_URL, {
      method: "POST",
      body: JSON.stringify({ url: url.trim() }),
    });
    if (!response) return { error: "Bitte melde dich erneut an." };
    if (response.ok) return { data: await response.json() };
    return { error: await getCreateErrorMessage(response) };
  } catch (error) {
    return { error: "Keine Verbindung zum Server. Bitte versuche es gleich noch einmal." };
  }
}

async function getCreateErrorMessage(response) {
  if (response.status === 400) {
    return "Das ist kein gültiger Link. Kopiere die Adresse direkt aus YouTube.";
  }
  if (response.status === 403) {
    return "Im Gastmodus kannst du keine eigenen Quizze erstellen.";
  }
  const body = await parseJsonSafe(response);
  if (body.code === "audio_download_failed") {
    return "Das Video konnte nicht geladen werden. Ist es öffentlich und nicht altersbeschränkt?";
  }
  if (body.code === "quiz_generation_failed") {
    return "Die KI ist gerade ausgelastet. Bitte versuche es in einer Minute noch einmal.";
  }
  // No JSON from the app: the proxy answered (timeout, restart during deploy).
  return "Der Server hat nicht rechtzeitig geantwortet. Bitte versuche es in ein paar Minuten noch einmal.";
}

async function removeQuiz(id) {
  try {
    const response = await apiFetch(`${GET_QUIZ_URL}${id}/`, { method: "DELETE" });
    return Boolean(response && response.ok);
  } catch (error) {
    return false;
  }
}

async function loadQuizzes(id) {
  let endpoint = GET_QUIZ_URL;
  if (id) {
    endpoint = `${GET_QUIZ_URL}${id}/`;
  }

  try {
    let response = await apiFetch(endpoint, { method: "GET" });
    if (!response || !response.ok) return null;
    return await response.json();
  } catch (error) {
    showToastMessage(true, ["Das Quiz konnte nicht geladen werden."]);
    return null;
  }
}

async function updateQuiz(id, quiz) {
  let endpoint = GET_QUIZ_URL;
  if (id) {
    endpoint = `${GET_QUIZ_URL}${id}/`;
  }

  try {
    let response = await apiFetch(endpoint, {
      method: "PATCH",
      body: JSON.stringify({
        title: quiz.title,
        description: quiz.description,
      }),
    });

    if (!response || !response.ok) return null;
    return await response.json();
  } catch (error) {
    showToastMessage(true, ["Das Quiz konnte nicht gespeichert werden."]);
    return null;
  }
}
