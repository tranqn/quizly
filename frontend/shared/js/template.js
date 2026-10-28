/** Kopf für alle eingeloggten Seiten. */
function getAppHeaderTemplate() {
  const guestBadge = isGuest()
    ? `<span class="app-header__badge">Gastmodus</span>`
    : "";
  return `
    <a href="/pages/library.html" class="app-header__logo">
      <img src="/assets/icons/logoheader.png" alt="Quizly, zur Bibliothek" width="150" height="43" />
    </a>
    <div class="app-header__actions">
      ${guestBadge}
      <button type="button" class="button button--text app-header__logout" onclick="logOut()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" x2="9" y1="12" y2="12" />
        </svg>
        Abmelden
      </button>
    </div>
  `;
}

function initAppHeader() {
  const header = document.getElementById("app-header");
  if (header) header.innerHTML = getAppHeaderTemplate();
}

function getFooterTemplate() {
  const year = new Date().getFullYear();
  return `
    <a href="/pages/legalnotice.html">Impressum</a>
    <a href="/pages/privacy.html">Datenschutz</a>
    <span>© ${year} Portfolio-Projekt von Quóc Nam Tràn</span>
    <a href="https://github.com/tranqn/quizly" rel="noopener">Quellcode auf GitHub</a>
  `;
}

function initFooter() {
  const footer = document.getElementById("footer");
  if (footer) footer.innerHTML = getFooterTemplate();
}
