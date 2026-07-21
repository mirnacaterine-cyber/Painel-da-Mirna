const ATELIER_KEY = "atelie-da-mirna:v2";

const uid = () => crypto.randomUUID();
const seed = {
  missions: [
    { id: uid(), text: "Preparar a aula mais importante do dia", done: false },
    { id: uid(), text: "Concluir uma prioridade da faculdade", done: false },
    { id: uid(), text: "Dar um pequeno passo para a futura escola", done: false }
  ],
  classes: [
    { id: uid(), title: "Baby Class", focus: "Musicalidade e coordenação", duration: "50 min", structure: "Acolhida • chão • deslocamentos • criação" },
    { id: uid(), title: "GR", focus: "Flexibilidade, manejo e série", duration: "90 min", structure: "Aquecimento • técnica • aparelhos • série" }
  ],
  students: [
    { id: uid(), name: "Sofia", group: "Baby Class", focus: "Confiança e musicalidade", attendance: 92 },
    { id: uid(), name: "Helena", group: "GR", focus: "Equilíbrio e manejo", attendance: 88 }
  ],
  dreamSteps: [
    { id: uid(), text: "Definir missão e valores da escola", done: true },
    { id: uid(), text: "Criar biblioteca de métodos e referências", done: false },
    { id: uid(), text: "Pesquisar piso, barras e espelhos", done: false },
    { id: uid(), text: "Montar primeira projeção financeira", done: false }
  ],
  school: {
    mission: "Formar bailarinas com excelência técnica, sensibilidade artística, disciplina e acolhimento.",
    values: ["Excelência", "Disciplina", "Acolhimento", "Arte", "Respeito"],
    savingsGoal: 50000,
    savings: 2500
  }
};

function loadAtelier() {
  try {
    const saved = JSON.parse(localStorage.getItem(ATELIER_KEY));
    return {
      ...structuredClone(seed),
      ...saved,
      school: { ...seed.school, ...(saved?.school || {}) }
    };
  } catch {
    return structuredClone(seed);
  }
}

let atelierState = loadAtelier();
const save = () => localStorage.setItem(ATELIER_KEY, JSON.stringify(atelierState));
const q = (selector, scope = document) => scope.querySelector(selector);
const qa = (selector, scope = document) => [...scope.querySelectorAll(selector)];

function createAtelier() {
  if (q("#atelie")) return;
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "/atelier.css?v=2";
  document.head.append(css);

  const section = document.createElement("section");
  section.className = "atelier-shell";
  section.id = "atelie";
  section.innerHTML = `
    <div class="atelier-intro">
      <div class="atelier-intro-copy">
        <p class="eyebrow">Ateliê da Mirna</p>
        <h2>O dia de hoje construindo a professora e a escola de amanhã.</h2>
        <p>Organize o essencial, prepare aulas com intenção e transforme o sonho de uma escola inspirada na excelência do Bolshoi em um projeto vivo.</p>
        <div class="atelier-main-action">
          <button class="button button-primary" id="organize-day" type="button">✨ Organizar meu dia</button>
          <button class="button button-ghost soft-music" id="soft-music" type="button"><span class="music-dot"></span><span>Iniciar música suave</span></button>
        </div>
      </div>
      <div class="atelier-purpose" aria-label="Propósito do Ateliê">
        <span>🩰</span>
        <strong>Cada aula dada hoje constrói a escola de amanhã.</strong>
      </div>
    </div>

    <div class="atelier-tabs" role="tablist" aria-label="Áreas do Ateliê">
      <button class="atelier-tab" role="tab" aria-selected="true" data-pane="today">🌷 Meu dia</button>
      <button class="atelier-tab" role="tab" aria-selected="false" data-pane="teacher">🩰 Professora</button>
      <button class="atelier-tab" role="tab" aria-selected="false" data-pane="students">👧 Alunas</button>
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
        <article class="atelier-card"><p class="eyebrow">Nova aula</p><h3>Planejar rapidamente</h3><form class="atelier-form stack" id="class-form"><input name="title" placeholder="Turma ou nível" required><input name="focus" placeholder="Objetivo principal" required><input name="structure" placeholder="Estrutura da aula"><select name="duration"><option>50 min</option><option>60 min</option><option>90 min</option><option>120 min</option></select><button class="atelier-mini-button primary" type="submit">Adicionar aula</button></form></article>
        <article class="atelier-card"><p class="eyebrow">Biblioteca pedagógica</p><h3>Estruturas prontas</h3><div class="method-list"><button class="method-chip" data-method="Baby Class">Baby Class</button><button class="method-chip" data-method="Ballet iniciante">Ballet iniciante</button><button class="method-chip" data-method="GR técnica">GR técnica</button><button class="method-chip" data-method="Ensaio coreográfico">Ensaio coreográfico</button></div></article>
        <article class="atelier-card wide"><p class="eyebrow">Estrutura sugerida</p><h3>Barra → centro → diagonal → criação → fechamento</h3><p>O histórico das aulas será a base para sugerir progressões, evitar repetições e acompanhar a evolução de cada turma.</p></article>
      </div>
    </div>

    <div class="atelier-pane" id="pane-students">
      <div class="atelier-grid">
        <article class="atelier-card wide"><p class="eyebrow">Acompanhamento</p><h3>Alunas vistas como pessoas, não como números</h3><div class="student-list" id="student-list"></div></article>
        <article class="atelier-card"><p class="eyebrow">Nova aluna</p><h3>Registrar acompanhamento</h3><form class="atelier-form stack" id="student-form"><input name="name" placeholder="Nome" required><input name="group" placeholder="Turma" required><input name="focus" placeholder="Ponto de atenção" required><input name="attendance" type="number" min="0" max="100" value="100" required><button class="atelier-mini-button primary" type="submit">Adicionar aluna</button></form></article>
        <article class="atelier-card full"><p class="eyebrow">Princípio pedagógico</p><h3>Registrar evolução para ensinar melhor</h3><p>Presença, confiança, musicalidade, coordenação, técnica e bem-estar podem ser acompanhados com delicadeza, sem transformar o ensino em pressão.</p></article>
      </div>
    </div>

    <div class="atelier-pane" id="pane-school">
      <div class="atelier-grid">
        <article class="atelier-card wide"><p class="eyebrow">Projeto da escola</p><h3>Uma escola inspirada em excelência, disciplina e acolhimento</h3><div class="dream-progress"><span id="dream-progress"></span></div><div class="dream-list" id="dream-list"></div><form class="atelier-form" id="dream-form"><input name="step" placeholder="Novo passo para o sonho" required><button class="atelier-mini-button primary" type="submit">Adicionar</button></form></article>
        <article class="atelier-card"><p class="eyebrow">Identidade</p><h3>O coração da futura escola</h3><label class="atelier-field"><span>Missão</span><textarea id="school-mission"></textarea></label><div class="value-list" id="value-list"></div></article>
        <article class="atelier-card"><p class="eyebrow">Estrutura financeira</p><h3>Fundo da escola</h3><div class="money-value" id="money-value"></div><div class="dream-progress finance"><span id="finance-progress"></span></div><form class="atelier-form stack" id="finance-form"><input name="amount" type="number" min="1" step="1" placeholder="Valor para guardar" required><button class="atelier-mini-button primary" type="submit">Registrar aporte</button></form></article>
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
}

function toast(text) {
  const el = q("#atelier-toast");
  el.textContent = text;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2400);
}

function renderAtelier() {
  const missions = q("#mission-list");
  missions.innerHTML = "";
  atelierState.missions.slice(0, 3).forEach(item => {
    const row = document.createElement("label");
    row.className = `mission-item ${item.done ? "done" : ""}`;
    row.innerHTML = `<input type="checkbox" ${item.done ? "checked" : ""}><span>${item.text}</span>`;
    q("input", row).onchange = event => { item.done = event.target.checked; save(); renderAtelier(); };
    missions.append(row);
  });

  const classes = q("#class-list");
  classes.innerHTML = "";
  atelierState.classes.forEach(item => {
    const row = document.createElement("div");
    row.className = "class-item";
    row.innerHTML = `<div><strong>${item.title}</strong><div class="class-meta"><span class="class-tag">${item.duration}</span><span>${item.focus}</span></div><small>${item.structure || "Estrutura a definir"}</small></div><button class="atelier-mini-button" aria-label="Remover ${item.title}">×</button>`;
    q("button", row).onclick = () => { atelierState.classes = atelierState.classes.filter(x => x.id !== item.id); save(); renderAtelier(); };
    classes.append(row);
  });

  const students = q("#student-list");
  students.innerHTML = "";
  atelierState.students.forEach(item => {
    const row = document.createElement("article");
    row.className = "student-item";
    row.innerHTML = `<div class="student-avatar">${item.name.charAt(0)}</div><div><strong>${item.name}</strong><small>${item.group}</small><p>${item.focus}</p></div><div class="attendance"><strong>${item.attendance}%</strong><small>presença</small></div>`;
    students.append(row);
  });

  const dream = q("#dream-list");
  dream.innerHTML = "";
  atelierState.dreamSteps.forEach(item => {
    const row = document.createElement("label");
    row.className = `dream-item ${item.done ? "done" : ""}`;
    row.innerHTML = `<input type="checkbox" ${item.done ? "checked" : ""}><span>${item.text}</span>`;
    q("input", row).onchange = event => { item.done = event.target.checked; save(); renderAtelier(); };
    dream.append(row);
  });

  const done = atelierState.dreamSteps.filter(x => x.done).length;
  q("#dream-progress").style.width = `${atelierState.dreamSteps.length ? done / atelierState.dreamSteps.length * 100 : 0}%`;
  q("#school-mission").value = atelierState.school.mission;
  q("#value-list").innerHTML = atelierState.school.values.map(value => `<span>${value}</span>`).join("");
  q("#money-value").textContent = `${atelierState.school.savings.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} de ${atelierState.school.savingsGoal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`;
  q("#finance-progress").style.width = `${Math.min(100, atelierState.school.savings / atelierState.school.savingsGoal * 100)}%`;
  renderMentor();
}

function renderMentor() {
  const pendingMissions = atelierState.missions.filter(item => !item.done).length;
  const pendingDream = atelierState.dreamSteps.filter(item => !item.done).length;
  const messages = [
    pendingMissions > 2 ? "Hoje está com muitas frentes abertas. Escolha uma aula, uma pendência e um passo do sonho. O resto pode esperar." : "Seu dia está ficando mais leve. Preserve espaço entre os compromissos.",
    atelierState.classes.length < 2 ? "Seu planejamento de aulas está enxuto. Registre as próximas turmas para visualizar melhor a semana." : "Você já tem aulas planejadas. Revise objetivos antes de criar novas atividades.",
    pendingDream > 3 ? "O sonho tem vários passos abertos. Conclua um pequeno antes de adicionar outro." : "O projeto da escola está avançando com consistência. Continue um passo por vez."
  ];
  q("#mentor-message").textContent = messages[Math.floor(Math.random() * messages.length)];
}

function bindAtelier() {
  qa(".atelier-tab").forEach(tab => tab.onclick = () => {
    qa(".atelier-tab").forEach(x => x.setAttribute("aria-selected", "false"));
    qa(".atelier-pane").forEach(x => x.classList.remove("active"));
    tab.setAttribute("aria-selected", "true");
    q(`#pane-${tab.dataset.pane}`).classList.add("active");
  });

  q("#organize-day").onclick = () => {
    atelierState.missions = [
      { id: uid(), text: "Preparar a aula prioritária e separar as músicas", done: false },
      { id: uid(), text: "Resolver a principal pendência da faculdade", done: false },
      { id: uid(), text: "Dar um passo pequeno para o projeto da escola", done: false }
    ];
    save(); renderAtelier(); toast("Dia organizado com foco no que realmente importa 🌷");
  };

  q("#dream-nudge").onclick = () => {
    const ideas = ["Pesquisar um modelo de piso adequado para dança", "Escrever três valores essenciais da futura escola", "Salvar uma referência de sala de ballet", "Reservar 20 minutos para estudar metodologia", "Estimar o custo inicial de barras e espelhos"];
    const text = ideas[Math.floor(Math.random() * ideas.length)];
    atelierState.dreamSteps.push({ id: uid(), text, done: false });
    save(); renderAtelier(); toast(text);
  };

  q("#class-form").onsubmit = event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    atelierState.classes.push({ id: uid(), title: data.get("title"), focus: data.get("focus"), structure: data.get("structure"), duration: data.get("duration") });
    save(); renderAtelier(); event.currentTarget.reset(); toast("Aula adicionada ao planejamento 🩰");
  };

  q("#student-form").onsubmit = event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    atelierState.students.push({ id: uid(), name: data.get("name"), group: data.get("group"), focus: data.get("focus"), attendance: Number(data.get("attendance")) });
    save(); renderAtelier(); event.currentTarget.reset(); toast("Aluna adicionada ao acompanhamento 💛");
  };

  q("#dream-form").onsubmit = event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    atelierState.dreamSteps.push({ id: uid(), text: data.get("step"), done: false });
    save(); renderAtelier(); event.currentTarget.reset(); toast("Mais um passo entrou no roadmap ✨");
  };

  q("#school-mission").onchange = event => { atelierState.school.mission = event.target.value; save(); toast("Missão da escola atualizada"); };
  q("#finance-form").onsubmit = event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    atelierState.school.savings += Number(data.get("amount")); save(); renderAtelier(); event.currentTarget.reset(); toast("Aporte registrado no fundo da escola 🌸");
  };

  qa(".method-chip").forEach(button => button.onclick = () => {
    const presets = {
      "Baby Class": ["Acolhida lúdica", "Coordenação no chão", "Deslocamentos", "Improvisação guiada", "Despedida"],
      "Ballet iniciante": ["Aquecimento", "Barra", "Centro", "Diagonal", "Alongamento"],
      "GR técnica": ["Aquecimento", "Flexibilidade", "Manejo", "Elementos corporais", "Série"],
      "Ensaio coreográfico": ["Marcação", "Limpeza", "Transições", "Expressão", "Passada final"]
    };
    const sequence = presets[button.dataset.method].join(" • ");
    q('#class-form input[name="title"]').value = button.dataset.method;
    q('#class-form input[name="structure"]').value = sequence;
    toast("Estrutura aplicada ao planejamento");
  });

  q("#mentor-refresh").onclick = () => renderMentor();
  q("#mentor-form").onsubmit = event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const group = data.get("group"); const goal = data.get("goal");
    const plan = q("#mentor-plan");
    plan.hidden = false;
    plan.innerHTML = `<p class="eyebrow">Sugestão de aula</p><h3>${group}: ${goal}</h3><ol class="lesson-plan"><li>Acolhida e ativação corporal</li><li>Exercício técnico ligado ao objetivo</li><li>Progressão em deslocamento</li><li>Aplicação musical ou coreográfica</li><li>Fechamento com registro de observações</li></ol>`;
    toast("Sugestão de aula preparada 🩰");
  };

  const music = q("#soft-music");
  music.onclick = () => {
    const playing = music.dataset.playing === "true";
    music.dataset.playing = String(!playing);
    q("span:last-child", music).textContent = playing ? "Iniciar música suave" : "Música suave ativada";
    toast(playing ? "Música pausada" : "Ambiente suave ativado. O Spotify pode assumir daqui 🎵");
  };
}

document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", createAtelier) : createAtelier();
