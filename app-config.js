export const APP_CONFIG = {
  ownerName: "Mirna",
  appName: "Painel da Mirna",
  eyebrow: "Ateliê da Mirna",
  subtitle: "Rotina, estudos, ballet, saúde e planos em um só lugar.",
  timezone: "America/Sao_Paulo",
  defaultCity: "Marechal Cândido Rondon, Paraná",
  folders: [
    {
      id: "00",
      slug: "painel-entrada",
      label: "Painel & Entrada",
      icon: "🌷",
      description: "Ponto de partida e arquivos recém-chegados.",
      href: "https://drive.google.com/drive/folders/1Q5mZcx0EBPmfkexPASF-rDg7iYs0qyqu",
      tone: "rose"
    },
    {
      id: "01",
      slug: "ballet-gr-aulas",
      label: "Ballet, GR & Aulas",
      icon: "🩰",
      description: "Planejamentos, alunas, aulas e materiais.",
      href: "https://drive.google.com/drive/folders/1IjBmecLfpkBe6gGMarsnHavwr8jte2Nw",
      tone: "lilac"
    },
    {
      id: "02",
      slug: "faculdade",
      label: "Faculdade",
      icon: "🎓",
      description: "Direito, Dança, trabalhos e prazos.",
      href: "https://drive.google.com/drive/folders/1lPp2fteIIzrN9-bMxdVNQ2aOigJVb0Ny",
      tone: "blue"
    },
    {
      id: "03",
      slug: "trabalho-financeiro",
      label: "Trabalho & Financeiro",
      icon: "💼",
      description: "Trabalho, gastos, comprovantes e organização.",
      href: "https://drive.google.com/drive/folders/1R_tWPf2xOnDCykpRHstIY3GIRZlQQB-c",
      tone: "sand"
    },
    {
      id: "04",
      slug: "documentos-pessoais",
      label: "Documentos Pessoais",
      icon: "🔐",
      description: "Documentos importantes e registros privados.",
      href: "https://drive.google.com/drive/folders/1cVzIyachF1ScHMCbxKubXw84ibdBi_do",
      tone: "slate",
      sensitive: true
    },
    {
      id: "05",
      slug: "casinha-compartilhada",
      label: "Casinha compartilhada",
      icon: "🏡",
      description: "Listas, ideias e decisões da casa.",
      href: "",
      tone: "green"
    },
    {
      id: "06",
      slug: "viagens-festivais",
      label: "Viagens & Festivais",
      icon: "✈️",
      description: "Roteiros, reservas, festivais e memórias.",
      href: "https://drive.google.com/drive/folders/1UJ0YrqKHyfnj1ySqjdkAR7lyEJ8tiM5w",
      tone: "sky"
    },
    {
      id: "07",
      slug: "familia-memorias",
      label: "Família & Memórias",
      icon: "💛",
      description: "Fotos, histórias e momentos especiais.",
      href: "https://drive.google.com/drive/folders/1hdaMYfsyafA41yrkHQ9k3rF4z8zSuUF-",
      tone: "yellow"
    },
    {
      id: "08",
      slug: "livros-cursos-referencias",
      label: "Livros, Cursos & Referências",
      icon: "📚",
      description: "Leituras, formações e repertório.",
      href: "https://drive.google.com/drive/folders/1anqk9isSvnzatZir6QawE2h6B-g77jYW",
      tone: "plum"
    },
    {
      id: "99",
      slug: "arquivo-historico",
      label: "Arquivo Histórico",
      icon: "🗄️",
      description: "Materiais encerrados que ainda merecem ser guardados.",
      href: "https://drive.google.com/drive/folders/1hPFDPGVkrMzKrQVxfwTseQylf1xy6m6N",
      tone: "gray"
    }
  ],
  dailyTasks: [
    "Conferir a agenda e os deslocamentos do dia.",
    "Separar materiais das aulas.",
    "Verificar prazos de Direito e Dança.",
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
    {
      label: "Formação",
      icon: "🌱",
      text: "Evoluir em Direito e Dança sem perder a recuperação corporal."
    },
    {
      label: "Profissão",
      icon: "✨",
      text: "Melhorar aulas, acompanhar alunas e consolidar materiais."
    },
    {
      label: "Sonho",
      icon: "🩰",
      text: "Construir uma escola de ballet acolhedora, organizada e sustentável."
    },
    {
      label: "Vida",
      icon: "🤍",
      text: "Preservar tempo para fé, saúde, família, Vinicius e descanso."
    }
  ],
  newsTopics: [
    {
      id: "ballet",
      label: "Ballet & Dança",
      icon: "🩰",
      query: "(ballet OR balé OR \"dança clássica\")",
      requiredTerms: ["ballet", "balé", "dança", "bailarina", "bailarino", "coreografia"]
    },
    {
      id: "gr",
      label: "Ginástica Rítmica",
      icon: "🎀",
      query: "(\"ginástica rítmica\" OR \"rhythmic gymnastics\")",
      requiredTerms: ["ginástica rítmica", "rítmica", "rhythmic gymnastics", "ginasta"]
    },
    {
      id: "faculdade",
      label: "Faculdade · Direito & Dança",
      icon: "🎓",
      query: "(UNIOESTE OR \"faculdade de Direito\" OR \"curso de Direito\" OR \"graduação em Dança\")",
      requiredTerms: ["unioeste", "direito", "faculdade", "universidade", "graduação", "dança"]
    }
  ],
  motivationalPhrases: [
    "Seu corpo também faz parte do plano. Constância sem violência.",
    "Uma aula bem cuidada hoje é um tijolo na futura escola de ballet.",
    "Direito, Dança e descanso podem caminhar juntos — um passo inteiro por vez.",
    "Organizar não é endurecer a vida; é abrir espaço para ela acontecer.",
    "A delicadeza também é disciplina: prepare o essencial e preserve sua energia.",
    "Você não precisa resolver a semana inteira hoje. Cuide bem do próximo movimento.",
    "O sonho da escola cresce nas pequenas coisas: uma aula, uma anotação, um cuidado.",
    "Seu ritmo não precisa parecer com o de ninguém. Precisa apenas continuar sendo sustentável."
  ]
};
