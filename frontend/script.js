// Startseite: Link prüfen, Vorschau zeigen und für nach der Anmeldung merken.

const HERO_FORM = document.getElementById("hero-form");
const HERO_URL = document.getElementById("hero-url");
const HERO_HINT = document.getElementById("hero-url-hint");
const HERO_PREVIEW = document.querySelector(".url-preview");

initFooter();

HERO_URL.addEventListener("input", () => updatePreview(false));

HERO_FORM.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!updatePreview(true)) {
    HERO_URL.focus();
    return;
  }
  setPendingUrl(HERO_URL.value.trim());
  // The library is protected: logged-in users stay there and the quiz is
  // created right away, everyone else is sent to the login first.
  window.location.href = "/pages/library.html";
});

/**
 * Shows the thumbnail for a recognised link. Error text only appears once the
 * user submits, so typing a URL is not interrupted by warnings.
 */
function updatePreview(showError) {
  const value = HERO_URL.value.trim();
  const id = getYouTubeId(value);

  if (id) {
    HERO_PREVIEW.querySelector("img").src = getYouTubeThumbnail(id);
    HERO_PREVIEW.hidden = false;
    HERO_URL.removeAttribute("aria-invalid");
    HERO_HINT.textContent = "";
    return true;
  }

  HERO_PREVIEW.hidden = true;
  if (showError) {
    HERO_URL.setAttribute("aria-invalid", "true");
    HERO_HINT.textContent = value
      ? "Das ist kein YouTube-Link. Kopiere die Adresse direkt aus YouTube."
      : "Bitte füge zuerst einen YouTube-Link ein.";
  }
  return false;
}
