const $ = (selector) => document.querySelector(selector);
const statusBox = $("#login-status");
const loginForm = $("#login-form");
const setupForm = $("#setup-form");
const nextUrl = new URLSearchParams(location.search).get("next") || "/";

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
  if (!response.ok) throw new Error(payload.message || "Nao foi possivel concluir o acesso.");
  return payload;
}

function setBusy(form, busy) {
  for (const control of form.elements) control.disabled = busy;
}

function showLogin() {
  $("#login-kicker").textContent = "Bem-vinda de volta";
  $("#login-title").textContent = "Entre no seu Ateliê";
  $("#login-intro").textContent = "Use o e-mail e a senha escolhidos no primeiro acesso.";
  setupForm.hidden = true;
  loginForm.hidden = false;
  const remembered = localStorage.getItem("painel-da-mirna:login-email:v1");
  if (remembered) loginForm.elements.email.value = remembered;
  message("Acesso protegido e sincronizacao ativa.");
}

function showSetup() {
  $("#login-kicker").textContent = "Primeiro acesso";
  $("#login-title").textContent = "Crie o acesso da Mirna";
  $("#login-intro").textContent = "Este cadastro sera o unico acesso principal do Atelie. Depois, basta entrar normalmente em qualquer dispositivo.";
  loginForm.hidden = true;
  setupForm.hidden = false;
  setupForm.elements.name.value = "Mirna";
  const token = localStorage.getItem("painel-da-mirna:cloud-token:v1") || "";
  if (token) setupForm.elements.activationCode.value = token;
  message("Use o codigo privado configurado anteriormente no painel.");
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
  message("Entrando no seu Atelie...");
  try {
    const email = loginForm.elements.email.value.trim();
    await api("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email, password: loginForm.elements.password.value })
    });
    localStorage.setItem("painel-da-mirna:login-email:v1", email);
    message("Tudo certo. Abrindo o Atelie...", "success");
    location.replace(nextUrl.startsWith("/") ? nextUrl : "/");
  } catch (error) {
    message(error.message, "error");
    setBusy(loginForm, false);
  }
});

setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = setupForm.elements.password.value;
  if (password !== setupForm.elements.confirmPassword.value) {
    message("As senhas nao sao iguais.", "error");
    return;
  }
  setBusy(setupForm, true);
  message("Criando o acesso e preparando a sincronizacao...");
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
    location.replace(nextUrl.startsWith("/") ? nextUrl : "/");
  } catch (error) {
    message(error.message, "error");
    setBusy(setupForm, false);
  }
});

(async () => {
  try {
    const data = await api("/api/auth?mode=status");
    if (data.user) {
      location.replace(nextUrl.startsWith("/") ? nextUrl : "/");
      return;
    }
    data.configured ? showLogin() : showSetup();
  } catch (error) {
    message(error.message, "error");
  }
})();
