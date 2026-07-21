const ATELIER_KEY = "atelie-da-mirna:v1";

const seed = {
  missions: [
    { id: crypto.randomUUID(), text: "Preparar a aula mais importante do dia", done: false },
    { id: crypto.randomUUID(), text: "Concluir uma prioridade da faculdade", done: false },
    { id: crypto.randomUUID(), text: "Dar um pequeno passo para a futura escola", done: false }
  ],
  classes: [
    { id: crypto.randomUUID(), title: "Baby Class", focus: "Musicalidade e coordenação", duration: "50 min" },
    { id: crypto.randomUUID(), title: "GR", focus: "Flexibilidade, manejo e série", duration: "90 min" }
  ],
  dreamSteps: [
    { id: crypto.randomUUID(), text: "Definir missão e valores da escola", done: true },
    { id: crypto.randomUUID(), text: "Criar biblioteca de métodos e referências", done: false },
    { id: crypto.randomUUID(), text: "Pesquisar piso, barras e espelhos", done: false },
    { id: crypto.randomUUID(), text: "Montar primeira projeção financeira", done: false }
  ]
};

function loadAtelier(){
  try{return {...seed,...JSON.parse(localStorage.getItem(ATELIER_KEY))};}catch{return structuredClone(seed);}
}
let atelierState=loadAtelier();
const save=()=>localStorage.setItem(ATELIER_KEY,JSON.stringify(atelierState));

function createAtelier(){
  const css=document.createElement("link");css.rel="stylesheet";css.href="/atelier.css?v=1";document.head.append(css);
  const section=document.createElement("section");
  section.className="atelier-shell";section.id="atelie";
  section.innerHTML=`
    <div class="atelier-intro">
      <p class="eyebrow">Ateliê da Mirna</p>
      <h2>O dia de hoje construindo a professora e a escola de amanhã.</h2>
      <p>Organize apenas o essencial, prepare aulas com intenção e transforme o sonho de uma escola inspirada na excelência do Bolshoi em um plano possível.</p>
      <div class="atelier-main-action">
        <button class="button button-primary" id="organize-day" type="button">✨ Organizar meu dia</button>
        <button class="button button-ghost soft-music" id="soft-music" type="button"><span class="music-dot"></span><span>Iniciar música suave</span></button>
      </div>
    </div>
    <div class="atelier-tabs" role="tablist" aria-label="Áreas do Ateliê">
      <button class="atelier-tab" role="tab" aria-selected="true" data-pane="today">🌷 Meu dia</button>
      <button class="atelier-tab" role="tab" aria-selected="false" data-pane="teacher">🩰 Professora</button>
      <button class="atelier-tab" role="tab" aria-selected="false" data-pane="school">🏛️ Minha escola</button>
    </div>
    <div class="atelier-pane active" id="pane-today">
      <div class="atelier-grid">
        <article class="atelier-card wide"><p class="eyebrow">Missão do dia</p><h3>As três coisas que realmente importam</h3><div class="mission-list" id="mission-list"></div></article>
        <article class="atelier-card"><p class="eyebrow">Próximo passo</p><h3>0,01% mais perto</h3><p>Escolha uma ação pequena que aproxime a Mirna da escola que sonha construir.</p><button class="atelier-mini-button primary" id="dream-nudge" type="button">Sugerir um passo</button></article>
        <article class="atelier-card full"><p class="atelier-quote">“Pode deixar comigo. Eu organizei seu dia. Agora é só viver.”</p></article>
      </div>
    </div>
    <div class="atelier-pane" id="pane-teacher">
      <div class="atelier-grid">
        <article class="atelier-card wide"><p class="eyebrow">Planejamento de aulas</p><h3>Aulas preparadas com intenção</h3><div class="class-list" id="class-list"></div></article>
        <article class="atelier-card"><p class="eyebrow">Nova aula</p><h3>Planejar rapidamente</h3><form class="atelier-form stack" id="class-form"><input name="title" placeholder="Turma ou nível" required><input name="focus" placeholder="Objetivo principal" required><select name="duration"><option>50 min</option><option>60 min</option><option>90 min</option><option>120 min</option></select><button class="atelier-mini-button primary" type="submit">Adicionar aula</button></form></article>
        <article class="atelier-card full"><p class="eyebrow">Estrutura sugerida</p><h3>Barra → centro → diagonal → criação → fechamento</h3><p>O histórico das aulas será a base para sugerir progressões, evitar repetições e acompanhar a evolução de cada turma.</p></article>
      </div>
    </div>
    <div class="atelier-pane" id="pane-school">
      <div class="atelier-grid">
        <article class="atelier-card wide"><p class="eyebrow">Projeto da escola</p><h3>Uma escola inspirada em excelência, disciplina e acolhimento</h3><div class="dream-progress"><span id="dream-progress"></span></div><div class="dream-list" id="dream-list"></div><form class="atelier-form" id="dream-form"><input name="step" placeholder="Novo passo para o sonho" required><button class="atelier-mini-button primary" type="submit">Adicionar</button></form></article>
        <article class="atelier-card"><p class="eyebrow">Roadmap</p><h3>Da professora à escola</h3><div class="roadmap"><div class="roadmap-step"><strong>Agora</strong><small>Fortalecer aulas, método e repertório</small></div><div class="roadmap-step"><strong>Próxima fase</strong><small>Identidade, plano pedagógico e finanças</small></div><div class="roadmap-step"><strong>Primeiro espaço</strong><small>Sala equipada, turmas e experiência das famílias</small></div><div class="roadmap-step"><strong>Visão maior</strong><small>Escola de referência com cultura própria</small></div></div></article>
      </div>
    </div>
    <div class="atelier-toast" id="atelier-toast" role="status" aria-live="polite"></div>`;
  document.querySelector(".hero")?.insertAdjacentElement("afterend",section);
  bindAtelier();renderAtelier();
}

function toast(text){const el=document.querySelector("#atelier-toast");el.textContent=text;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2400)}
function renderAtelier(){
  const missions=document.querySelector("#mission-list");missions.innerHTML="";
  atelierState.missions.slice(0,3).forEach(item=>{const row=document.createElement("label");row.className=`mission-item ${item.done?"done":""}`;row.innerHTML=`<input type="checkbox" ${item.done?"checked":""}><span>${item.text}</span>`;row.querySelector("input").onchange=e=>{item.done=e.target.checked;save();renderAtelier()};missions.append(row)});
  const classes=document.querySelector("#class-list");classes.innerHTML="";
  atelierState.classes.forEach(item=>{const row=document.createElement("div");row.className="class-item";row.innerHTML=`<div><strong>${item.title}</strong><div class="class-meta"><span class="class-tag">${item.duration}</span><span>${item.focus}</span></div></div><button class="atelier-mini-button" aria-label="Remover ${item.title}">×</button>`;row.querySelector("button").onclick=()=>{atelierState.classes=atelierState.classes.filter(x=>x.id!==item.id);save();renderAtelier()};classes.append(row)});
  const dream=document.querySelector("#dream-list");dream.innerHTML="";
  atelierState.dreamSteps.forEach(item=>{const row=document.createElement("label");row.className=`dream-item ${item.done?"done":""}`;row.innerHTML=`<input type="checkbox" ${item.done?"checked":""}><span>${item.text}</span>`;row.querySelector("input").onchange=e=>{item.done=e.target.checked;save();renderAtelier()};dream.append(row)});
  const done=atelierState.dreamSteps.filter(x=>x.done).length;document.querySelector("#dream-progress").style.width=`${atelierState.dreamSteps.length?done/atelierState.dreamSteps.length*100:0}%`;
}

function bindAtelier(){
  document.querySelectorAll(".atelier-tab").forEach(tab=>tab.onclick=()=>{document.querySelectorAll(".atelier-tab").forEach(x=>x.setAttribute("aria-selected","false"));document.querySelectorAll(".atelier-pane").forEach(x=>x.classList.remove("active"));tab.setAttribute("aria-selected","true");document.querySelector(`#pane-${tab.dataset.pane}`).classList.add("active")});
  document.querySelector("#organize-day").onclick=()=>{atelierState.missions=atelierState.missions.slice(0,3).map((x,i)=>({...x,done:false,text:["Preparar a aula prioritária e separar as músicas","Resolver a principal pendência da faculdade","Dar um passo pequeno para o projeto da escola"][i]}));save();renderAtelier();toast("Dia organizado com foco no que realmente importa 🌷")};
  document.querySelector("#dream-nudge").onclick=()=>{const ideas=["Pesquisar um modelo de piso adequado para dança","Escrever três valores essenciais da futura escola","Salvar uma referência de sala de ballet","Reservar 20 minutos para estudar metodologia","Estimar o custo inicial de barras e espelhos"];const text=ideas[Math.floor(Math.random()*ideas.length)];atelierState.dreamSteps.push({id:crypto.randomUUID(),text,done:false});save();renderAtelier();toast(text)};
  document.querySelector("#class-form").onsubmit=e=>{e.preventDefault();const data=new FormData(e.currentTarget);atelierState.classes.push({id:crypto.randomUUID(),title:data.get("title"),focus:data.get("focus"),duration:data.get("duration")});save();renderAtelier();e.currentTarget.reset();toast("Aula adicionada ao planejamento 🩰")};
  document.querySelector("#dream-form").onsubmit=e=>{e.preventDefault();const data=new FormData(e.currentTarget);atelierState.dreamSteps.push({id:crypto.randomUUID(),text:data.get("step"),done:false});save();renderAtelier();e.currentTarget.reset();toast("Mais um passo entrou no roadmap ✨")};
  const music=document.querySelector("#soft-music");music.onclick=()=>{const playing=music.dataset.playing==="true";music.dataset.playing=String(!playing);music.querySelector("span:last-child").textContent=playing?"Iniciar música suave":"Música suave ativada";toast(playing?"Música pausada":"Ambiente suave ativado. O Spotify pode ser conectado aqui 🎵")};
}

document.readyState==="loading"?document.addEventListener("DOMContentLoaded",createAtelier):createAtelier();
