// Parse a response body as JSON without crashing on an empty / non-JSON body
// (e.g. a 502 from the proxy while the backend restarts, or a 204). Returns {}.
async function parseJsonSafe(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

const inputs = document.querySelectorAll(".auth-form input");
const checkboxTerms = document.querySelector('input[name="terms"]');
const pwToggle = document.getElementById("input-lock-password");
const repPwToggle = document.getElementById("input-lock-repeated-pw");

inputs.forEach((input) => {
  if (input.type !== "checkbox") {
    input.addEventListener("blur", () => validateFormElements(input));
  }
});

if (checkboxTerms) {
  checkboxTerms.addEventListener("change", function () {
    const errorDiv = document.getElementById("checkbox-error");

    if (this.checked) {
      errorDiv.textContent = "";
      errorDiv.classList.remove("visible");
    } else {
      errorDiv.textContent = "Bitte akzeptiere die Datenschutzerklärung.";
      errorDiv.classList.add("visible");
    }
  });
}

if (pwToggle) {
  pwToggle.onclick = function () {
    const input = document.getElementById("input-password");
    togglePasswordVisibility(input, pwToggle);
  };
}

if (repPwToggle) {
  repPwToggle.onclick = function () {
    const input = document.getElementById("input-rep-password");
    togglePasswordVisibility(input, repPwToggle);
  };
}

function getFormData(form, reference) {
  const formData = new FormData(form);
  const bodyData = {
    username: formData.get("username")?.trim(),
    password: formData.get("password")?.trim(),
  };
  if (reference === "login") {
    return bodyData;
  }
  if (reference === "signup") {
    bodyData.email = formData.get("email")?.trim();
    bodyData.confirmed_password = formData.get("repeated-password")?.trim();
    return bodyData;
  }
}

async function loginUser(event) {
  event.preventDefault();
  const form = event.target;
  const allValid = validateAllFields(form);

  if (!allValid) {
    focusFirstError(form);
    return;
  }
  const body = getFormData(form, "login");
  setSubmitting(form, true);

  try {
    const response = await fetch(`${API_BASE_URL}${LOGIN_URL}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const message =
        response.status === 401
          ? "Benutzername oder Passwort stimmen nicht."
          : `Anmeldung fehlgeschlagen (Fehler ${response.status}).`;
      showToastMessage(true, message);
      setSubmitting(form, false);
      return;
    }

    setGuest(false);
    window.location.href = "/pages/library.html";
  } catch (error) {
    showToastMessage(true, "Keine Verbindung zum Server. Bitte versuche es gleich noch einmal.");
    setSubmitting(form, false);
  }
}

/** Disables the submit button while a request runs, so it cannot fire twice. */
function setSubmitting(form, submitting) {
  const button = form.querySelector('[type="submit"]');
  button.disabled = submitting;
  button.setAttribute("aria-busy", String(submitting));
}

function focusFirstError(form) {
  const invalid =
    form.querySelector('[aria-invalid="true"]') ||
    (document.getElementById("checkbox-error")?.textContent && form.querySelector('[name="terms"]'));
  if (invalid) invalid.focus();
}

async function loginAsGuest() {
  try {
    const response = await fetch(`${API_BASE_URL}${GUEST_LOGIN_URL}`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      const message =
        response.status === 429
          ? "Zu viele Gast-Anmeldungen. Bitte versuche es später noch einmal."
          : "Der Gastzugang ist gerade nicht verfügbar.";
      showToastMessage(true, message);
      return;
    }

    setGuest(true);
    window.location.href = "/pages/library.html";
  } catch (error) {
    showToastMessage(true, "Keine Verbindung zum Server. Bitte versuche es gleich noch einmal.");
  }
}

async function signUpUser(event) {
  event.preventDefault();
  const form = event.target;
  const allValid = validateAllFields(form);

  if (!allValid) {
    focusFirstError(form);
    return;
  }
  const body = getFormData(form, "signup");
  setSubmitting(form, true);

  try {
    const response = await fetch(`${API_BASE_URL}${REGISTER_URL}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await parseJsonSafe(response);

    if (!response.ok) {
      const reason =
        data.detail ||
        data.username ||
        data.email ||
        data.password ||
        data.confirmed_password ||
        `Fehler ${response.status}`;
      showToastMessage(true, `Registrierung fehlgeschlagen: ${reason}`);
      setSubmitting(form, false);
      return;
    }

    window.location.href = "/pages/login.html?registriert=1";
  } catch (error) {
    showToastMessage(true, "Keine Verbindung zum Server. Bitte versuche es gleich noch einmal.");
    setSubmitting(form, false);
  }
}

async function logOut() {
  setGuest(false);
  try {
    // The access token lives 5 minutes. After a pause the first attempt is a
    // 401; refresh once and retry, so the refresh token really gets revoked
    // and both cookies are cleared.
    let response = await postLogout();
    if (response.status === 401 && (await refreshToken())) {
      response = await postLogout();
    }
  } finally {
    window.location.href = "/index.html";
  }
}

function postLogout() {
  return fetch(`${API_BASE_URL}${LOGOUT_URL}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
}

function validateAllFields(form) {
  const inputs = form.querySelectorAll(
    'input[name="email"], input[name="username"], input[name="password"], input[name="repeated-password"], input[name="terms"]',
  );

  let isValid = true;

  inputs.forEach((input) => {
    const result = validateFormElements(input);
    if (result === false) {
      isValid = false;
    }
  });

  return isValid;
}

function validateFormElements(input) {
  const name = input.name;
  const value = input.type === "checkbox" ? input.checked : input.value.trim();
  const form = input.form;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
  let passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;

  switch (name) {
    case "email":
      if (!emailRegex.test(value)) {
        showError(input, "Bitte eine gültige Mail-Adresse eingeben.");
        return false;
      }
      break;

    case "username":
      if (value.length < 3) {
        showError(input, "Der Name muss mindestens 3 Zeichen haben.");
        return false;
      }
      break;

    case "password":
      if (window.location.href.includes("login.html")) {
        if (value.length === 0) {
          showError(input, "Bitte Passwort eingeben.");
          return false;
        }
        break;
      }
      if (!passwordRegex.test(value)) {
        showError(input, "Mindestens 6 Zeichen, davon ein Groß- und ein Kleinbuchstabe und eine Ziffer.");
        return false;
      }
      break;

    case "repeated-password":
      const passwordValue = form
        .querySelector('input[name="password"]')
        .value.trim();
      if (value !== passwordValue) {
        showError(input, "Die Passwörter stimmen nicht überein.");
        return false;
      }
      break;

    case "terms":
      const errorDiv = document.getElementById("checkbox-error");
      if (!value) {
        errorDiv.textContent = "Bitte akzeptiere die Datenschutzerklärung.";
        errorDiv.classList.add("visible");
        return false;
      } else {
        errorDiv.textContent = "";
        errorDiv.classList.remove("visible");
        return true;
      }
  }

  clearError(input);
  return true;
}

function showError(input, message) {
  const errorDiv = input.parentElement.querySelector(".error-message");
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.classList.add("visible");
  }
  input.setAttribute("aria-invalid", "true");
}

function clearError(input) {
  const errorDiv = input.parentElement.querySelector(".error-message");
  if (errorDiv) {
    errorDiv.textContent = "";
    errorDiv.classList.remove("visible");
  }
  input.removeAttribute("aria-invalid");
}

function togglePasswordVisibility(input, icon) {
  if (input.type === "password") {
    input.type = "text";
    icon.querySelector("img").src = "/assets/icons/visibility.svg";
    icon.setAttribute("aria-pressed", "true");
  } else {
    input.type = "password";
    icon.querySelector("img").src = "/assets/icons/visibility_off.svg";
    icon.setAttribute("aria-pressed", "false");
  }
}

async function refreshToken() {
  try {
    const response = await fetch(`${API_BASE_URL}${TOKENREFRESH_URL}`, {
      method: "POST",
      credentials: "include",
    });

    return response.ok;
  } catch (error) {
    return false;
  }
}

async function apiFetch(endpoint, options = {}) {
  const doRequest = () =>
    fetch(`${API_BASE_URL}${endpoint}`, {
      credentials: "include",
      method: options.method || "GET",
      body: options.body,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

  let response = await doRequest();

  // Only 401 means "not logged in". A 403 is a permission answer (e.g. the
  // read-only guest account) and goes back to the caller unchanged.
  if (response.status === 401) {
    const refreshed = await refreshToken();
    if (!refreshed) {
      window.location.href = "/pages/login.html";
      return null;
    }

    response = await doRequest();

    if (response.status === 401) {
      window.location.href = "/pages/login.html";
      return null;
    }
  }

  return response;
}
