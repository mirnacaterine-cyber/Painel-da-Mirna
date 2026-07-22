const $ = (selector) => document.querySelector(selector);
const statusBox = $("#login-status");
const loginForm = $("#login-form");
const setupForm = $("#setup-form");
const switcher = $(".login-switch");
const nextUrl = new URLSearchParams(location.search).get("next") || "/";
let configured = false;

function safeNext() {
  return nextUrl.startsWith("/") && !nextUrl.startsWith("//") ? nextUrl : "/";
}

function message(text, type = "") {
  statusBox.textContent = text;
  statusBox.className = `login-status${type ? ` ${type}` : ""}`;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: { Accept: "application/json", ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "Não foi possível concluir o acesso.");
  return payload;
}

function setBusy(form, busy) {
  for (const control of form.elements) control.disabled = busy;
}

function setView(view, { announce = true } = {}) {
  const loginActive = view === "login";
  switcher.dataset.view = view;
  document.querySelectorAll("[data-auth-view]").forEach((button) => {
    const active = button.dataset.authView === view;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  loginForm.hidden = !loginActive;
  setupForm.hidden = loginActive;
  loginForm.classList.toggle("is-active", loginActive);
  setupForm.classList.toggle("is-active", !loginActive);
  $("#login-kicker").textContent = loginActive ? "Bem-vinda de volta" : "Primeiro acesso";
  $("#login-title").textContent = loginActive ? "Entre no seu Ateliê" : "Crie o acesso da Mirna";
  $("#login-intro").textContent = loginActive
    ? "Use o e-mail e a senha da conta principal."
    : "Crie a conta que ativará a sincronização entre os dispositivos.";
  if (announce) {
    message(loginActive
      ? (configured ? "A conta principal já está disponível." : "Ainda não há conta criada. Você pode trocar para Criar conta ou continuar localmente.")
      : (configured ? "O primeiro cadastro já foi realizado. Use a aba Entrar." : "Use o código privado configurado anteriormente no painel."));
  }
  window.setTimeout(() => {
    const input = (loginActive ? loginForm : setupForm).querySelector("input:not([type=hidden])");
    input?.focus({ preventScroll: true });
  }, 220);
}

for (const button of document.querySelectorAll("[data-auth-view]")) {
  button.addEventListener("click", () => setView(button.dataset.authView));
  button.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    setView(button.dataset.authView === "login" ? "setup" : "login");
  });
}

for (const button of document.querySelectorAll("[data-toggle-password]")) {
  button.addEventListener("click", () => {
    const input = button.closest(".password-wrap").querySelector("input");
    input.type = input.type === "password" ? "text" : "password";
    button.setAttribute("aria-label", input.type === "password" ? "Mostrar senha" : "Ocultar senha");
  });
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(loginForm, true);
  message("Entrando no seu Ateliê...");
  try {
    const email = loginForm.elements.email.value.trim();
    await api("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email, password: loginForm.elements.password.value })
    });
    localStorage.setItem("painel-da-mirna:login-email:v1", email);
    message("Tudo certo. Abrindo o Ateliê...", "success");
    location.replace(safeNext());
  } catch (error) {
    message(error.message, "error");
    setBusy(loginForm, false);
  }
});

setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = setupForm.elements.password.value;
  if (password !== setupForm.elements.confirmPassword.value) {
    message("As senhas não são iguais.", "error");
    return;
  }
  setBusy(setupForm, true);
  message("Criando o acesso e preparando a sincronização...");
  try {
    const email = setupForm.elements.email.value.trim();
    await api("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "register",
        name: setupForm.elements.name.value,
        email,
        password,
        activationCode: setupForm.elements.activationCode.value
      })
    });
    localStorage.setItem("painel-da-mirna:login-email:v1", email);
    message("Acesso criado. Levando seus dados para a nuvem...", "success");
    location.replace(safeNext());
  } catch (error) {
    message(error.message, "error");
    setBusy(setupForm, false);
  }
});

$("#login-local").href = safeNext();

(async () => {
  const remembered = localStorage.getItem("painel-da-mirna:login-email:v1");
  if (remembered) loginForm.elements.email.value = remembered;
  setupForm.elements.name.value = "Mirna";
  const token = localStorage.getItem("painel-da-mirna:cloud-token:v1") || "";
  if (token) setupForm.elements.activationCode.value = token;
  try {
    const data = await api("/api/auth?mode=status");
    if (data.user) {
      location.replace(safeNext());
      return;
    }
    configured = Boolean(data.configured);
    setView(configured ? "login" : "setup", { announce: false });
    message(configured
      ? "Conta encontrada. Entre ou continue localmente."
      : "Ainda não existe conta. Crie quando estiver pronta ou continue localmente.");
  } catch (error) {
    setView("login", { announce: false });
    message(`${error.message} Você ainda pode continuar localmente.`, "error");
  }
})();