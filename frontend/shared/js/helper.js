function getFormData(form) {
  const formData = new FormData(form);
  return Object.fromEntries(formData.entries());
}

function showFormErrors(array) {
  array.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.classList.remove("d_none");
    }
  });
}

function hideFormErrors(array) {
  array.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.classList.add("d_none");
    }
  });
}

function showToastMessage(error = true, msg = []) {
  const toast = document.createElement("div");
  toast.className = "toast_msg d_flex_cc_ac";
  toast.innerHTML = getToastHTML(msg, error);
  toast.setAttribute("error", error);
  toast.setAttribute("role", error ? "alert" : "status");
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

function showToastHint(msg = []) {
  const toast = document.createElement("div");
  toast.className = "toast_msg d_flex_cc_ac";
  toast.innerHTML = getToastHintHTML(msg);
  toast.setAttribute("role", "status");
  document.body.appendChild(toast);
  toast.setAttribute("hint", true);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

function getToastHintHTML(msg) {
  return `<div class="toast_msg_left d_flex_cc_ac">
            </div>
            <div class="toast_msg_hint">
                <h3>Hinweis</h3>
                <p class="w_full">
                    ${msg}
                </p>
            </div>`;
}

function getToastHTML(msg, error) {
  let msglist = "";

  if (typeof msg === "string") {
    msg = [msg];
  }

  if (msg.length <= 0) {
    msglist = error
      ? "<li>Es ist ein Fehler aufgetreten</li>"
      : "<li>Das hat geklappt!</li>";
  }
  for (let i = 0; i < msg.length; i++) {
    msglist += `<li>${msg[i]}</li>`;
  }

  return `<div class="toast_msg_left d_flex_cc_ac">
            </div>
            <div class="toast_msg_right">
                <h3 error="false">Erledigt</h3>
                <h3 error="true">Fehler</h3>
                <ul class="w_full">
                    ${msglist}
                </ul>
            </div>`;
}

/** Escapes text before it goes into an HTML template string. */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML.replaceAll('"', "&quot;");
}

function formatDate(isoString) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(isoString));
}

function getQuizID() {
  let params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  return id;
}

function goBack() {
  window.history.back();
}
