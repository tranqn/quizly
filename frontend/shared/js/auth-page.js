// Login und Registrierung: Hinweise je nach Herkunft anzeigen.

initFooter();

(function showAuthNotice() {
  const notice = document.getElementById("auth-notice");
  if (!notice) return;
  const params = new URLSearchParams(window.location.search);
  let text = "";
  if (params.get("registriert") === "1") {
    text = "Dein Konto ist angelegt. Melde dich jetzt an.";
  } else if (getPendingUrl()) {
    text = "Nach der Anmeldung erstellen wir sofort das Quiz aus deinem Video.";
  }
  if (text) {
    notice.textContent = text;
    notice.hidden = false;
  }
})();
