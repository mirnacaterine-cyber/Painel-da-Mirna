export const APP_CONFIG = {
  ownerName: "Mirna",
  appName: "Ateliê da Mirna",
  eyebrow: "Meu espaço pessoal",
  subtitle: "Rotina tranquila, aulas com intenção e um sonho de escola sendo construído.",
  folders: [
    { id: "00", label: "Painel & Entrada", icon: "🌷", description: "Ponto de partida e arquivos recém-chegados.", href: "https://drive.google.com/drive/folders/1Q5mZcx0EBPmfkexPASF-rDg7iYs0qyqu", tone: "rose" },
    { id: "01", label: "Ballet, GR & Aulas", icon: "🩰", description: "Planejamentos, alunas, aulas e materiais.", href: "https://drive.google.com/drive/folders/1IjBmecLfpkBe6gGMarsnHavwr8jte2Nw", tone: "lilac" },
    { id: "02", label: "Faculdade", icon: "🎓", description: "Direito, Dança, trabalhos e prazos.", href: "https://drive.google.com/drive/folders/1lPp2fteIIzrN9-bMxdVNQ2aOigJVb0Ny", tone: "blue" },
    { id: "03", label: "Trabalho & Financeiro", icon: "💼", description: "Trabalho, gastos, comprovantes e organização.", href: "https://drive.google.com/drive/folders/1R_tWPf2xOnDCykpRHstIY3GIRZlQQB-c", tone: "sand" },
    { id: "04", label: "Documentos Pessoais", icon: "🔐", description: "Documentos importantes e registros privados.", href: "https://drive.google.com/drive/folders/1cVzIyachF1ScHMCbxKubXw84ibdBi_do", tone: "slate", sensitive: true },
    { id: "05", label: "Casinha compartilhada", icon: "🏡", description: "Listas, ideias e decisões da casa.", href: "https://drive.google.com/drive/folders/1t_Lopcp7WOn71hWej0GFHY_lkb2bkHhC", tone: "green" },
    { id: "06", label: "Viagens & Festivais", icon: "✈️", description: "Roteiros, reservas, festivais e memórias.", href: "https://drive.google.com/drive/folders/1UJ0YrqKHyfnj1ySqjdkAR7lyEJ8tiM5w", tone: "sky" },
    { id: "07", label: "Família & Memórias", icon: "💛", description: "Fotos, histórias e momentos especiais.", href: "https://drive.google.com/drive/folders/1hdaMYfsyafA41yrkHQ9k3rF4z8zSuUF-", tone: "yellow" },
    { id: "08", label: "Livros, Cursos & Referências", icon: "📚", description: "Leituras, formações e repertório.", href: "https://drive.google.com/drive/folders/1anqk9isSvnzatZir6QawE2h6B-g77jYW", tone: "plum" },
    { id: "99", label: "Arquivo Histórico", icon: "🗄️", description: "Materiais encerrados que ainda merecem ser guardados.", href: "https://drive.google.com/drive/folders/1hPFDPGVkrMzKrQVxfwTseQylf1xy6m6N", tone: "gray" }
  ],
  dailyTasks: [
    "Conferir a agenda e os deslocamentos do dia.",
    "Separar materiais das aulas.",
    "Verificar prazos das faculdades.",
    "Registrar gastos e comprovantes.",
    "Colocar arquivos novos na Entrada."
  ],
  weeklyTasks: [
    "Planejar GR, Ballet e Martin Luther.",
    "Revisar Direito e Dança.",
    "Preparar refeições, academia, missa e viagens.",
    "Atualizar a lista da Casinha.",
    "Registrar um passo para a futura escola de ballet."
  ],
  vision: [
    { label: "Formação", icon: "🌱", text: "Evoluir em Direito e Dança sem perder a recuperação corporal." },
    { label: "Profissão", icon: "✨", text: "Melhorar aulas, acompanhar alunas e consolidar materiais." },
    { label: "Sonho", icon: "🩰", text: "Construir uma escola de ballet acolhedora, organizada e sustentável." },
    { label: "Vida", icon: "🤍", text: "Preservar tempo para fé, saúde, família, Vinicius e descanso." }
  ]
};

if (typeof window !== "undefined") {
  queueMicrotask(async () => {
    try {
      await import("./sidebar-v7.js");
      await import("./atelier.js");
      await import("./atelier-nav.js");
      await import("./workspace.js");
      await import("./calendar-v6.js");
      await import("./auto-sync.js");
      await import("./auto-fix.js");
      await import("./data-hub.js");
      await import("./runtime-v5.js");
    } catch (error) {
      console.error("Falha ao iniciar o espaço pessoal da Mirna", error);
    }
  });
}
