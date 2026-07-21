const ATELIER_KEY = "atelie-da-mirna:v3";
const LEGACY_ATELIER_KEYS = ["atelie-da-mirna:v2", "atelie-da-mirna:v1"];
const WORKSPACE_KEY = "painel-da-mirna:workspace:v3";
const TOKEN_KEY = "painel-da-mirna:cloud-token:v1";
const CLOUD_CONFIG_KEY = "painel-da-mirna:cloud-config:v1";
const CLOUD_STATE_ID = "atelie-da-mirna-v3";
const SPOTIFY_PLAYLIST = "https://open.spotify.com/playlist/1DgRQ20bvrC01pUtSR4yzC";
const SPOTIFY_PROFILE = "https://open.spotify.com/user/21qezo47xxwofexkvodibgt6i";
const CHANNEL_NAME = "painel-da-mirna-workspace";
const channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;

let cloudTimer = null;
let cloudSyncing = false;
let remoteSyncTimer = null;

const uid = (prefix = "item") => `${prefix}-${typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
const q = (selector, scope = document) => scope.querySelector(selector);
const qa = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const safeJson = (value, fallback = null) => {
  try { return JSON.parse(value); } catch { return fallback; }
};
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const seed = {
  version: 3,
  updatedAt: new Date().toISOString(),
  missions: [
    { id: uid("mission"), text: "Preparar a aula mais importante do dia", done: false },
    { id: uid("mission"), text: "Concluir uma prioridade da faculdade", done: false },
    { id: uid("mission"), text: "Dar um pequeno passo para a futura escola", done: false }
  ],
  classes: [
    { id: uid("class"), title: "Baby Class", focus: "Musicalidade e coordenação", duration: "50 min", structure: "Acolhida • chão • deslocamentos • criação", date: "", musicUrl: "" },
    { id: uid("class"), title: "GR", focus: "Flexibilidade, manejo e série", duration: "90 min", structure: "Aquecimento • técnica • aparelhos • série", date: "", musicUrl: "" }
  ],
  students: [
    { id: uid("student"), name: "Sofia", group: "Baby Class", focus: "Confiança e musicalidade", attendance: 92 },
    { id: uid("student"), name: "Helena", group: "GR", focus: "Equilíbrio e manejo", attendance: 88 }
  ],
  productions: [
    { id: uid("production"), title: "Coreografia de encerramento", kind: "Coreografia", date: "", status: "Ideia", note: "Escolher trilha e tema." },
    { id: uid("production"), title: "Próximo festival", kind: "Festival", date: "", status: "Planejamento", note: "Mapear inscrição, figurino e ensaios." }
  ],
  dreamSteps: [
    { id: uid("dream"), text: "Definir missão e valores da escola", done: true },
    { id: uid("dream"), text: "Criar biblioteca de métodos e referências", done: false },
    { id: uid("dream"), text: "Pesquisar piso, barras e espelhos", done: false },
    { id: uid("dream"), text: "Montar primeira projeção financeira", done: false }
  ],
  inspirations: ["Excelência técnica com acolhimento", "Ambiente bonito, limpo e disciplinado", "Formação artística completa"],
  school: {
    mission: "Formar bailarinas com excelência técnica, sensibilidade artística, disciplina e acolhimento.",
    values: ["Excelência", "Disciplina", "Acolhimento", "Arte", "Respeito"],
    savingsGoal: 50000,
    savings: 2500,
    costs: [
      { id: uid("cost"), name: "Piso adequado para dança", estimate: 15000, done: false },
      { id: uid("cost"), name: "Espelhos e barras", estimate: 12000, done: false },
      { id: uid("cost"), name: "Som, iluminação e recepção", estimate: 8000, done: false }
    ]
  }
};

function normalizeState(candidate) {
  const value = candidate && typeof candidate === "object" ? candidate : {};
  return {
    ...structuredClone(seed),
    ...value,
    version: 3,
    missions: Array.isArray(value.missions) ? value.missions : structuredClone(seed.missions),
    classes: Array.isArray(value.classes) ? value.classes : structuredClone(seed.classes),
    students: Array.isArray(value.students) ? value.students : structuredClone(seed.students),
    productions: Array.isArray(value.productions) ? value.productions : structuredClone(seed.productions),
    dreamSteps: Array.isArray(value.dreamSteps) ? value.dreamSteps : structuredClone(seed.dreamSteps),
    inspirations: Array.isArray(value.inspirations) ? value.inspirations : structuredClone(seed.inspirations),
    school: {
      ...structuredClone(seed.school),
      ...(value.school || {}),
      values: Array.isArray(value.school?.values) ? value.school.values : structuredClone(seed.school.values),
      costs: Array.isArray(value.school?.costs) ? value.school.costs : structuredClone(seed.school.costs)
    }
  };
}

function loadAtelier() {
  const current = safeJson(localStorage.getItem(ATELIER_KEY));
  if (current) return normalizeState(current);
  for (const key of LEGACY_ATELIER_KEYS) {
    const legacy = safeJson(localStorage.getItem(key));
    if (legacy) {
      const migrated = normalizeState(legacy);
      localStorage.setItem(ATELIER_KEY, JSON.stringify(migrated));
      return migrated;
    }
  }
  return normalizeState(seed);
}

let atelierState = loadAtelier();

function cloudToken() {
  const direct = localStorage.getItem(TOKEN_KEY)?.trim();
  if (direct) return direct;
  const config = safeJson(localStorage.getItem(CLOUD_CONFIG_KEY), {});
  return typeof config?.cloudToken === "string" ? config.cloudToken.trim() : "";
}

function authHeaders(extra = {}) {
  const token = cloudToken();
  return token ? { ...extra, "x-painel-token": token } : extra;
}

function mergeById(remoteItems = [], localItems = []) {
  const map = new Map();
  for (const item of remoteItems) if (item?.id) map.set(item.id, item);
  for (const item of localItems) if (item?.id) map.set(item.id, { ...map.get(item.id), ...item });
  return [...map.values()];
}

function mergeStates(remote, local) {
  const a = normalizeState(remote);
  const b = normalizeState(local);
  return normalizeState({
    ...a,
    ...b,
    missions: mergeById(a.missions, b.missions),
    classes: mergeById(a.classes, b.classes),
    students: mergeById(a.students, b.students),
    productions: mergeById(a.productions, b.productions),
    dreamSteps: mergeById(a.dreamSteps, b.dreamSteps),
    inspirations: [...new Set([...a.inspirations, ...b.inspirations])],
    school: {
      ...a.school,
      ...b.school,
      values: [...new Set([...(a.school.values || []), ...(b.school.values || [])])],
      costs: mergeById(a.school.costs, b.school.costs)
    }
  });
}

function save({ sync = true, render = false } = {}) {
  atelierState.updatedAt = new Date().toISOString();
  localStorage.setItem(ATELIER_KEY, JSON.stringify(atelierState));
  if (sync) scheduleCloudSync();
  if (render) renderAtelier();
}

function scheduleCloudSync(delay = 700) {
  window.clearTimeout(cloudTimer);
  cloudTimer = window.setTimeout(syncAtelierCloud, delay);
}

async function syncAtelierCloud() {
  const token = cloudToken();
  if (!token || cloudSyncing || !navigator.onLine) {
    updateCloudBadge("Modo local");
    return false;
  }
  cloudSyncing = true;
  updateCloudBadge("Sincronizando…");
  try {
    const response = await fetch(`/api/state?id=${encodeURIComponent(CLOUD_STATE_ID)}`, {
      headers: authHeaders({ Accept: "application/json" }),
      cache: "no-store"
    });
    if (response.ok) {
      const remote = await response.json();
      atelierState = mergeStates(remote?.payload, atelierState);
      save({ sync: false });
      renderAtelier();
    } else if (response.status !== 404) {
      throw new Error("Não foi possível ler o Ateliê na nuvem.");
    }
    const saveResponse = await fetch("/api/state", {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
      body: JSON.stringify({ id: CLOUD_STATE_ID, payload: atelierState, clientUpdatedAt: atelierState.updatedAt })
    });
    if (!saveResponse.ok) throw new Error("Não foi possível salvar o Ateliê na nuvem.");
    updateCloudBadge("Nuvem alinhada");
    return true;
  } catch {
    updateCloudBadge("Modo local");
    return false;
  } finally {
    cloudSyncing = false;
  }
}

function updateCloudBadge(text) {
  const badge = q("#atelier-cloud-status");
  if (badge) badge.textContent = text;
}

function workspaceState() {
  return safeJson(localStorage.getItem(WORKSPACE_KEY), {}) || {};
}

function publishWorkspace(next) {
  next.updatedAt = new Date().toISOString();
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(next));
  channel?.postMessage(next);
}

function formatTime(value) {
  return value ? String(value).slice(0, 5) : "";
}

function buildSmartMissions() {
  const workspace = workspaceState();
  const today = dateKey();
  const events = (workspace.events || [])
    .filter((event) => event.date === today)
    .sort((a, b) => String(a.start || "99:99").localeCompare(String(b.start || "99:99")));
  const cards = (workspace.cards || [])
    .filter((card) => card.column !== "done" && (card.dueDate === today || card.column === "doing"));
  const pendingDream = atelierState.dreamSteps.find((step) => !step.done);
  const balletEvent = events.find((event) => String(event.category) === "01") || events[0];
  const facultyCard = cards.find((card) => String(card.category) === "02") || cards[0];
  const missions = [];

  if (balletEvent) {
    missions.push({ id: uid("mission"), text: `${formatTime(balletEvent.start) ? `${formatTime(balletEvent.start)} · ` : ""}${balletEvent.title}`, done: false });
  } else {
    missions.push({ id: uid("mission"), text: "Preparar a aula prioritária e separar as músicas", done: false });
  }

  if (facultyCard) {
    missions.push({ id: uid("mission"), text: facultyCard.title, done: false });
  } else {
    missions.push({ id: uid("mission"), text: "Resolver a principal pendência da Faculdade de Dança", done: false });
  }

  missions.push({ id: uid("mission"), text: pendingDream?.text || "Registrar o próximo passo da futura escola", done: false });
  return missions.slice(0, 3);
}

function createAtelier() {
  if (q("#atelie")) return;
  if (!q('link[href^="/atelier.css"]')) {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "/atelier.css?v=3";
    document.head.append(css);
  }

  const section = document.createElement("section");
  section.className = "atelier-shell";
  section.id = "atelie";
  section.innerHTML = `
    <div class="atelier-intro">
      <div class="atelier-intro-copy">
        <div class="atelier-kicker-row"><p class="eyebrow">Ateliê da Mirna</p><span id="atelier-cloud-status">Modo local</span></div>
        <h2>O dia de hoje construindo a professora e a escola de amanhã.</h2>
        <p>Organize o essencial, prepare aulas com intenção e transforme o sonho de uma escola inspirada na excelência do Bolshoi em um projeto vivo.</p>
        <div class="atelier-main-action">
          <button class="button button-primary" id="organize-day" type="button">✨ Organizar meu dia</button>
          <button class="button button-ghost soft-music" id="soft-music" type="button"><span class="music-dot"></span><span>Abrir música suave</span></button>
          <button class="button button-ghost" id="atelier-backup" type="button">Exportar Ateliê</button>
        </div>
      </div>
      <div class="atelier-purpose" aria-label="Propósito do Ateliê"><span>🩰</span><strong>Cada aula dada hoje constrói a escola de amanhã.</strong></div>
    </div>

    <div class="atelier-tabs" role="tablist" aria-label="Áreas do Ateliê">
      <button class="atelier-tab" role="tab" aria-selected="true" data-pane="today">🌷 Meu dia</button>
      <button class="atelier-tab" role="tab" aria-selected="false" data-pane="teacher">🩰 Professora</button>
      <button class="atelier-tab" role="tab" aria-selected="false" data-pane="students">👧 Alunas</button>
      <button class="atelier-tab" role="tab" aria-selected="false" data-pane="productions">🎭 Produções</button>
      <button class="atelier-tab" role="tab" aria-selected="false" data-pane="school">🏛️ Minha escola</button>
      <button class="atelier-tab" role="tab" aria-selected="false" data-pane="mentor">✨ Mentora</button>
    </div>

    <div class="atelier-pane active" id="pane-today">
      <div class="atelier-grid">
        <article class="atelier-card wide"><p class="eyebrow">Missão do dia</p><h3>As três coisas que realmente importam</h3><div class="mission-list" id="mission-list"></div></article>
        <article class="atelier-card"><p class="eyebrow">Próximo passo</p><h3>0,01% mais perto</h3><p>Uma ação pequena e possível para aproximar a Mirna da escola que deseja construir.</p><button class="atelier-mini-button primary" id="dream-nudge" type="button">Sugerir um passo</button></article>
        <article class="atelier-card full atelier-quote-card"><p class="atelier-quote">“Pode deixar comigo. Eu organizei seu dia. Agora é só viver.”</p></article>
      </div>
    </div>

    <div class="atelier-pane" id="pane-teacher">
      <div class="atelier-grid">
        <article class="atelier-card wide"><p class="eyebrow">Planejamento de aulas</p><h3>Aulas preparadas com intenção</h3><div class="class-list" id="class-list"></div></article>
        <article class="atelier-card"><p class="eyebrow">Nova aula</p><h3>Planejar rapidamente</h3><form class="atelier-form stack" id="class-form"><input name="title" placeholder="Turma ou nível" required><input name="focus" placeholder="Objetivo principal" required><input name="structure" placeholder="Estrutura da aula"><input name="date" type="date"><input name="musicUrl" type="url" placeholder="Link opcional do Spotify"><select name="duration"><option>50 min</option><option>60 min</option><option>90 min</option><option>120 min</option></select><button class="atelier-mini-button primary" type="submit">Adicionar aula</button></form></article>
        <article class="atelier-card"><p class="eyebrow">Biblioteca pedagógica</p><h3>Estruturas prontas</h3><div class="method-list"><button class="method-chip" data-method="Baby Class">Baby Class</button><button class="method-chip" data-method="Ballet iniciante">Ballet iniciante</button><button class="method-chip" data-method="GR técnica">GR técnica</button><button class="method-chip" data-method="Ensaio coreográfico">Ensaio coreográfico</button></div></article>
        <article class="atelier-card wide"><p class="eyebrow">Processo de aula</p><h3>Preparar → ensinar → observar → registrar → evoluir</h3><p>Cada planejamento pode carregar objetivo, sequência, música e data. Depois da aula, as observações das alunas ajudam a orientar a próxima progressão.</p></article>
      </div>
    </div>

    <div class="atelier-pane" id="pane-students">
      <div class="atelier-grid">
        <article class="atelier-card wide"><p class="eyebrow">Acompanhamento</p><h3>Alunas vistas como pessoas, não como números</h3><div class="student-list" id="student-list"></div></article>
        <article class="atelier-card"><p class="eyebrow">Nova aluna</p><h3>Registrar acompanhamento</h3><form class="atelier-form stack" id="student-form"><input name="name" placeholder="Nome" required><input name="group" placeholder="Turma" required><input name="focus" placeholder="Ponto de atenção" required><input name="attendance" type="number" min="0" max="100" value="100" required><button class="atelier-mini-button primary" type="submit">Adicionar aluna</button></form></article>
        <article class="atelier-card full"><p class="eyebrow">Princípio pedagógico</p><h3>Registrar evolução para ensinar melhor</h3><p>Presença, confiança, musicalidade, coordenação, técnica e bem-estar podem ser acompanhados com delicadeza, sem transformar o ensino em pressão.</p></article>
      </div>
    </div>

    <div class="atelier-pane" id="pane-productions">
      <div class="atelier-grid">
        <article class="atelier-card wide"><p class="eyebrow">Coreografias e festivais</p><h3>Produções em andamento</h3><div class="production-list" id="production-list"></div></article>
        <article class="atelier-card"><p class="eyebrow">Nova produção</p><h3>Registrar projeto</h3><form class="atelier-form stack" id="production-form"><input name="title" placeholder="Nome do projeto" required><select name="kind"><option>Coreografia</option><option>Festival</option><option>Apresentação</option><option>Ensaio</option></select><input name="date" type="date"><select name="status"><option>Ideia</option><option>Planejamento</option><option>Em ensaio</option><option>Pronto</option></select><textarea name="note" placeholder="Música, figurino, transporte, inscrições…"></textarea><button class="atelier-mini-button primary" type="submit">Adicionar produção</button></form></article>
        <article class="atelier-card full"><p class="eyebrow">Checklist essencial</p><div class="production-checklist"><span>✓ Música e versão final</span><span>✓ Figurino e medidas</span><span>✓ Ensaios e presença</span><span>✓ Inscrição e documentos</span><span>✓ Transporte e cronograma</span></div></article>
      </div>
    </div>

    <div class="atelier-pane" id="pane-school">
      <div class="atelier-grid">
        <article class="atelier-card wide"><p class="eyebrow">Projeto da escola</p><h3>Uma escola inspirada em excelência, disciplina e acolhimento</h3><div class="dream-progress"><span id="dream-progress"></span></div><div class="dream-list" id="dream-list"></div><form class="atelier-form" id="dream-form"><input name="step" placeholder="Novo passo para o sonho" required><button class="atelier-mini-button primary" type="submit">Adicionar</button></form></article>
        <article class="atelier-card"><p class="eyebrow">Identidade</p><h3>O coração da futura escola</h3><label class="atelier-field"><span>Missão</span><textarea id="school-mission"></textarea></label><div class="value-list" id="value-list"></div><form class="atelier-form" id="value-form"><input name="value" placeholder="Novo valor"><button class="atelier-mini-button" type="submit">+</button></form></article>
        <article class="atelier-card"><p class="eyebrow">Estrutura financeira</p><h3>Fundo da escola</h3><div class="money-value" id="money-value"></div><div class="dream-progress finance"><span id="finance-progress"></span></div><form class="atelier-form stack" id="finance-form"><input name="amount" type="number" min="1" step="1" placeholder="Valor para guardar" required><button class="atelier-mini-button primary" type="submit">Registrar aporte</button></form></article>
        <article class="atelier-card"><p class="eyebrow">Orçamento inicial</p><h3>Estrutura física</h3><div class="cost-list" id="cost-list"></div></article>
        <article class="atelier-card"><p class="eyebrow">Inspirações</p><h3>Vibes da futura escola</h3><div class="inspiration-list" id="inspiration-list"></div><form class="atelier-form" id="inspiration-form"><input name="idea" placeholder="Nova referência"><button class="atelier-mini-button" type="submit">+</button></form></article>
        <article class="atelier-card wide"><p class="eyebrow">Roadmap</p><h3>Da professora à escola de referência</h3><div class="roadmap"><div class="roadmap-step"><strong>Agora</strong><small>Fortalecer aulas, método e repertório</small></div><div class="roadmap-step"><strong>Próxima fase</strong><small>Identidade, plano pedagógico e finanças</small></div><div class="roadmap-step"><strong>Primeiro espaço</strong><small>Sala equipada, turmas e experiência das famílias</small></div><div class="roadmap-step"><strong>Visão maior</strong><small>Escola de referência com cultura própria</small></div></div></article>
      </div>
    </div>

    <div class="atelier-pane" id="pane-mentor">
      <div class="atelier-grid">
        <article class="atelier-card wide mentor-card"><p class="eyebrow">Mentora do Ateliê</p><h3>O que precisa de atenção agora?</h3><div class="mentor-message" id="mentor-message"></div><button class="atelier-mini-button primary" id="mentor-refresh" type="button">Nova orientação</button></article>
        <article class="atelier-card"><p class="eyebrow">Pergunta rápida</p><h3>Preparar uma aula</h3><form class="atelier-form stack" id="mentor-form"><input name="group" placeholder="Turma ou faixa etária" required><input name="goal" placeholder="Objetivo da aula" required><button class="atelier-mini-button primary" type="submit">Montar sugestão</button></form></article>
        <article class="atelier-card full" id="mentor-plan" hidden></article>
      </div>
    </div>

    <div class="atelier-toast" id="atelier-toast" role="status" aria-live="polite"></div>`;

  q(".hero")?.insertAdjacentElement("afterend", section);
  bindAtelier();
  renderAtelier();
  syncAtelierCloud();
}

function toast(text) {
  const el = q("#atelier-toast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), 2600);
}

function renderAtelier() {
  if (!q("#atelie")) return;
  const missions = q("#mission-list");
  missions.innerHTML = "";
  atelierState.missions.slice(0, 3).forEach(item => {
    const row = document.createElement("label");
    row.className = `mission-item ${item.done ? "done" : ""}`;
    row.innerHTML = `<input type="checkbox" ${item.done ? "checked" : ""}><span>${escapeHtml(item.text)}</span>`;
    q("input", row).onchange = event => { item.done = event.target.checked; save(); renderAtelier(); };
    missions.append(row);
  });

  const classes = q("#class-list");
  classes.innerHTML = "";
  atelierState.classes.forEach(item => {
    const row = document.createElement("div");
    row.className = "class-item";
    row.innerHTML = `<div><strong>${escapeHtml(item.title)}</strong><div class="class-meta"><span class="class-tag">${escapeHtml(item.duration)}</span>${item.date ? `<span>${escapeHtml(item.date.split("-").reverse().join("/"))}</span>` : ""}<span>${escapeHtml(item.focus)}</span></div><small>${escapeHtml(item.structure || "Estrutura a definir")}</small></div><div class="atelier-row-actions">${item.musicUrl ? `<a class="atelier-mini-button" href="${escapeHtml(item.musicUrl)}" target="_blank" rel="noopener noreferrer">♫</a>` : ""}<button class="atelier-mini-button" data-remove-class="${item.id}" aria-label="Remover ${escapeHtml(item.title)}">×</button></div>`;
    classes.append(row);
  });

  const students = q("#student-list");
  students.innerHTML = "";
  atelierState.students.forEach(item => {
    const row = document.createElement("article");
    row.className = "student-item";
    row.innerHTML = `<div class="student-avatar">${escapeHtml(item.name.charAt(0).toUpperCase())}</div><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.group)}</small><p>${escapeHtml(item.focus)}</p></div><div class="attendance"><strong>${Number(item.attendance || 0)}%</strong><small>presença</small><div class="attendance-actions"><button data-attendance="${item.id}" data-delta="-5" type="button">−</button><button data-attendance="${item.id}" data-delta="5" type="button">+</button></div></div>`;
    students.append(row);
  });

  const productions = q("#production-list");
  productions.innerHTML = "";
  atelierState.productions.forEach(item => {
    const row = document.createElement("article");
    row.className = "production-item";
    row.innerHTML = `<div><span class="production-kind">${escapeHtml(item.kind)}</span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.status)}${item.date ? ` · ${escapeHtml(item.date.split("-").reverse().join("/"))}` : ""}</small><p>${escapeHtml(item.note || "Sem observações.")}</p></div><button class="atelier-mini-button" data-remove-production="${item.id}" type="button">×</button>`;
    productions.append(row);
  });

  const dream = q("#dream-list");
  dream.innerHTML = "";
  atelierState.dreamSteps.forEach(item => {
    const row = document.createElement("label");
    row.className = `dream-item ${item.done ? "done" : ""}`;
    row.innerHTML = `<input type="checkbox" ${item.done ? "checked" : ""}><span>${escapeHtml(item.text)}</span>`;
    q("input", row).onchange = event => { item.done = event.target.checked; save(); renderAtelier(); };
    dream.append(row);
  });

  const done = atelierState.dreamSteps.filter(x => x.done).length;
  q("#dream-progress").style.width = `${atelierState.dreamSteps.length ? done / atelierState.dreamSteps.length * 100 : 0}%`;
  q("#school-mission").value = atelierState.school.mission;
  q("#value-list").innerHTML = atelierState.school.values.map(value => `<span>${escapeHtml(value)}</span>`).join("");
  q("#money-value").textContent = `${Number(atelierState.school.savings || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} de ${Number(atelierState.school.savingsGoal || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`;
  q("#finance-progress").style.width = `${Math.min(100, Number(atelierState.school.savings || 0) / Math.max(1, Number(atelierState.school.savingsGoal || 1)) * 100)}%`;
  q("#cost-list").innerHTML = atelierState.school.costs.map(cost => `<label class="cost-item ${cost.done ? "done" : ""}"><input type="checkbox" data-cost="${cost.id}" ${cost.done ? "checked" : ""}><span><strong>${escapeHtml(cost.name)}</strong><small>${Number(cost.estimate || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</small></span></label>`).join("");
  q("#inspiration-list").innerHTML = atelierState.inspirations.map((idea, index) => `<div class="inspiration-item"><span>${escapeHtml(idea)}</span><button data-remove-inspiration="${index}" type="button">×</button></div>`).join("");
  renderMentor();
}

function renderMentor() {
  const pendingMissions = atelierState.missions.filter(item => !item.done).length;
  const pendingDream = atelierState.dreamSteps.filter(item => !item.done).length;
  const datedClasses = atelierState.classes.filter(item => item.date).length;
  const messages = [
    pendingMissions > 2 ? "Hoje está com muitas frentes abertas. Escolha uma aula, uma pendência e um passo do sonho. O resto pode esperar." : "Seu dia está ficando mais leve. Preserve espaço entre os compromissos.",
    datedClasses === 0 ? "Nenhuma aula está com data definida. Vincular data e objetivo deixa a preparação bem mais tranquila." : "Você já tem aulas com data. Revise objetivo, música e sequência antes de criar algo novo.",
    pendingDream > 3 ? "O sonho tem vários passos abertos. Conclua um pequeno antes de adicionar outro." : "O projeto da escola está avançando com consistência. Continue um passo por vez."
  ];
  q("#mentor-message").textContent = messages[Math.floor(Math.random() * messages.length)];
}

function activatePane(name, { updateHash = true } = {}) {
  qa(".atelier-tab").forEach(tab => tab.setAttribute("aria-selected", String(tab.dataset.pane === name)));
  qa(".atelier-pane").forEach(pane => pane.classList.toggle("active", pane.id === `pane-${name}`));
  if (updateHash) history.replaceState(null, "", `#pane-${name}`);
}

function exportAtelier() {
  const blob = new Blob([JSON.stringify({ app: "Ateliê da Mirna", exportedAt: new Date().toISOString(), data: atelierState }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `atelie-da-mirna-${dateKey()}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  toast("Cópia do Ateliê exportada");
}

function openSpotify() {
  const workspace = workspaceState();
  publishWorkspace({ ...workspace, spotify: { profileUrl: SPOTIFY_PROFILE, contentUrl: SPOTIFY_PLAYLIST } });
  toast("Playlist suave conectada. Aperte play no Spotify 🎵");
  q("#spotify")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function bindAtelier() {
  qa(".atelier-tab").forEach(tab => tab.addEventListener("click", () => activatePane(tab.dataset.pane)));

  q("#organize-day").addEventListener("click", () => {
    atelierState.missions = buildSmartMissions();
    save({ render: true });
    activatePane("today");
    toast("Dia organizado com agenda, prioridades e um passo do sonho 🌷");
  });

  q("#soft-music").addEventListener("click", openSpotify);
  q("#atelier-backup").addEventListener("click", exportAtelier);

  q("#dream-nudge").addEventListener("click", () => {
    const ideas = ["Pesquisar um modelo de piso adequado para dança", "Escrever três valores essenciais da futura escola", "Salvar uma referência de sala de ballet", "Reservar 20 minutos para estudar metodologia", "Estimar o custo inicial de barras e espelhos"];
    const text = ideas[Math.floor(Math.random() * ideas.length)];
    atelierState.dreamSteps.push({ id: uid("dream"), text, done: false });
    save({ render: true });
    toast(text);
  });

  q("#class-form").addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    atelierState.classes.push({ id: uid("class"), title: String(data.get("title") || "").trim(), focus: String(data.get("focus") || "").trim(), structure: String(data.get("structure") || "").trim(), date: String(data.get("date") || ""), musicUrl: String(data.get("musicUrl") || "").trim(), duration: String(data.get("duration") || "50 min") });
    save({ render: true });
    event.currentTarget.reset();
    toast("Aula adicionada ao planejamento 🩰");
  });

  q("#class-list").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-class]");
    if (!button) return;
    atelierState.classes = atelierState.classes.filter(item => item.id !== button.dataset.removeClass);
    save({ render: true });
  });

  q("#student-form").addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    atelierState.students.push({ id: uid("student"), name: String(data.get("name") || "").trim(), group: String(data.get("group") || "").trim(), focus: String(data.get("focus") || "").trim(), attendance: Number(data.get("attendance")) });
    save({ render: true });
    event.currentTarget.reset();
    toast("Aluna adicionada ao acompanhamento 💛");
  });

  q("#student-list").addEventListener("click", event => {
    const button = event.target.closest("[data-attendance]");
    if (!button) return;
    const student = atelierState.students.find(item => item.id === button.dataset.attendance);
    if (!student) return;
    student.attendance = Math.max(0, Math.min(100, Number(student.attendance || 0) + Number(button.dataset.delta || 0)));
    save({ render: true });
  });

  q("#production-form").addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    atelierState.productions.push({ id: uid("production"), title: String(data.get("title") || "").trim(), kind: String(data.get("kind") || "Coreografia"), date: String(data.get("date") || ""), status: String(data.get("status") || "Ideia"), note: String(data.get("note") || "").trim() });
    save({ render: true });
    event.currentTarget.reset();
    toast("Produção adicionada ao cronograma 🎭");
  });

  q("#production-list").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-production]");
    if (!button) return;
    atelierState.productions = atelierState.productions.filter(item => item.id !== button.dataset.removeProduction);
    save({ render: true });
  });

  q("#dream-form").addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    atelierState.dreamSteps.push({ id: uid("dream"), text: String(data.get("step") || "").trim(), done: false });
    save({ render: true });
    event.currentTarget.reset();
    toast("Mais um passo entrou no roadmap ✨");
  });

  q("#school-mission").addEventListener("change", event => { atelierState.school.mission = event.target.value; save(); toast("Missão da escola atualizada"); });
  q("#value-form").addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = String(data.get("value") || "").trim();
    if (value && !atelierState.school.values.includes(value)) atelierState.school.values.push(value);
    save({ render: true });
    event.currentTarget.reset();
  });

  q("#finance-form").addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    atelierState.school.savings += Number(data.get("amount"));
    save({ render: true });
    event.currentTarget.reset();
    toast("Aporte registrado no fundo da escola 🌸");
  });

  q("#cost-list").addEventListener("change", event => {
    const input = event.target.closest("[data-cost]");
    if (!input) return;
    const cost = atelierState.school.costs.find(item => item.id === input.dataset.cost);
    if (cost) cost.done = input.checked;
    save({ render: true });
  });

  q("#inspiration-form").addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const idea = String(data.get("idea") || "").trim();
    if (idea) atelierState.inspirations.push(idea);
    save({ render: true });
    event.currentTarget.reset();
  });

  q("#inspiration-list").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-inspiration]");
    if (!button) return;
    atelierState.inspirations.splice(Number(button.dataset.removeInspiration), 1);
    save({ render: true });
  });

  qa(".method-chip").forEach(button => button.addEventListener("click", () => {
    const presets = {
      "Baby Class": ["Acolhida lúdica", "Coordenação no chão", "Deslocamentos", "Improvisação guiada", "Despedida"],
      "Ballet iniciante": ["Aquecimento", "Barra", "Centro", "Diagonal", "Alongamento"],
      "GR técnica": ["Aquecimento", "Flexibilidade", "Manejo", "Elementos corporais", "Série"],
      "Ensaio coreográfico": ["Marcação", "Limpeza", "Transições", "Expressão", "Passada final"]
    };
    q('#class-form input[name="title"]').value = button.dataset.method;
    q('#class-form input[name="structure"]').value = presets[button.dataset.method].join(" • ");
    toast("Estrutura aplicada ao planejamento");
  }));

  q("#mentor-refresh").addEventListener("click", renderMentor);
  q("#mentor-form").addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const group = escapeHtml(data.get("group"));
    const goal = escapeHtml(data.get("goal"));
    const plan = q("#mentor-plan");
    plan.hidden = false;
    plan.innerHTML = `<p class="eyebrow">Sugestão de aula</p><h3>${group}: ${goal}</h3><ol class="lesson-plan"><li>Acolhida e ativação corporal</li><li>Exercício técnico ligado ao objetivo</li><li>Progressão em deslocamento</li><li>Aplicação musical ou coreográfica</li><li>Fechamento com registro de observações</li></ol>`;
    toast("Sugestão de aula preparada 🩰");
  });

  window.addEventListener("storage", event => {
    if (event.key === ATELIER_KEY) {
      atelierState = normalizeState(safeJson(event.newValue, atelierState));
      renderAtelier();
    }
  });
  channel?.addEventListener("message", () => {
    if (q("#pane-today.active")) renderAtelier();
  });
  window.addEventListener("online", syncAtelierCloud);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncAtelierCloud();
  });
}

function initAtelier() {
  createAtelier();
  const hashPane = location.hash.match(/^#pane-(today|teacher|students|productions|school|mentor)$/)?.[1];
  if (hashPane) activatePane(hashPane, { updateHash: false });
  remoteSyncTimer = window.setInterval(syncAtelierCloud, 10 * 60 * 1000);
  window.__mirnaAtelier = {
    getState: () => structuredClone(atelierState),
    save: () => save({ render: true }),
    sync: syncAtelierCloud,
    open: activatePane,
    organizeDay: () => q("#organize-day")?.click()
  };
}

document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", initAtelier, { once: true }) : initAtelier();
window.addEventListener("beforeunload", () => {
  window.clearTimeout(cloudTimer);
  window.clearInterval(remoteSyncTimer);
  channel?.close();
});
