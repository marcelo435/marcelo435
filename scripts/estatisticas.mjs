// Gera dist/estatisticas.svg: cartão preto e branco com os números GERAIS do GitHub
// (desde a criação da conta, não só do último ano). Roda no GitHub Actions (animacao.yml).
// Uso: GITHUB_TOKEN=... node scripts/estatisticas.mjs [usuario]
// Teste sem internet: node scripts/estatisticas.mjs --exemplo
import { mkdirSync, writeFileSync } from 'node:fs';

const USUARIO = process.argv.find((a, i) => i > 1 && !a.startsWith('--')) || process.env.GITHUB_REPOSITORY_OWNER || 'marcelo435';
const TITULO = 'Estatísticas do GitHub de Marcelo Vitor';

async function graphql(query, variables) {
  const resp = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await resp.json();
  if (!resp.ok || json.errors) throw new Error(JSON.stringify(json.errors || json));
  return json.data;
}

async function buscarNumeros() {
  const { user } = await graphql(
    `query($login: String!) {
      user(login: $login) {
        createdAt
        followers { totalCount }
        pullRequests { totalCount }
        issues { totalCount }
        repositories(ownerAffiliations: OWNER, isFork: false, first: 100) { nodes { stargazerCount } }
      }
    }`,
    { login: USUARIO },
  );

  // O GitHub só entrega as contribuições de um ano por vez: soma ano a ano desde a criação da conta.
  let commits = 0;
  let revisoes = 0;
  const repos = new Set();
  const agora = new Date();
  for (let ano = new Date(user.createdAt).getUTCFullYear(); ano <= agora.getUTCFullYear(); ano++) {
    const { user: u } = await graphql(
      `query($login: String!, $de: DateTime!, $ate: DateTime!) {
        user(login: $login) {
          contributionsCollection(from: $de, to: $ate) {
            totalCommitContributions
            totalPullRequestReviewContributions
            commitContributionsByRepository(maxRepositories: 100) { repository { nameWithOwner } }
            pullRequestContributionsByRepository(maxRepositories: 100) { repository { nameWithOwner } }
            issueContributionsByRepository(maxRepositories: 100) { repository { nameWithOwner } }
          }
        }
      }`,
      { login: USUARIO, de: `${ano}-01-01T00:00:00Z`, ate: ano === agora.getUTCFullYear() ? agora.toISOString() : `${ano}-12-31T23:59:59Z` },
    );
    const c = u.contributionsCollection;
    commits += c.totalCommitContributions;
    revisoes += c.totalPullRequestReviewContributions;
    for (const lista of [c.commitContributionsByRepository, c.pullRequestContributionsByRepository, c.issueContributionsByRepository]) {
      for (const item of lista) repos.add(item.repository.nameWithOwner);
    }
  }

  return {
    estrelas: user.repositories.nodes.reduce((s, r) => s + r.stargazerCount, 0),
    commits,
    prs: user.pullRequests.totalCount,
    issues: user.issues.totalCount,
    repos: repos.size,
    revisoes,
    seguidores: user.followers.totalCount,
  };
}

// Mesma nota (S a C) do github-readme-stats, na versão que conta todos os commits.
function calcularNota({ commits, prs, issues, revisoes, estrelas, seguidores }) {
  const exp = (x) => 1 - 2 ** -x;
  const log = (x) => x / (1 + x);
  const pesos = [
    [2, exp(commits / 1000)],
    [3, exp(prs / 50)],
    [1, exp(issues / 25)],
    [1, exp(revisoes / 2)],
    [4, log(estrelas / 50)],
    [1, log(seguidores / 10)],
  ];
  const total = pesos.reduce((s, [p]) => s + p, 0);
  const percentil = (1 - pesos.reduce((s, [p, v]) => s + p * v, 0) / total) * 100;
  const limites = [1, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];
  const niveis = ['S', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C'];
  return { nivel: niveis[limites.findIndex((t) => percentil <= t)], percentil };
}

const ICONES = {
  estrela: 'M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25zm0 2.445L6.615 5.5a.75.75 0 01-.564.41l-3.097.45 2.24 2.184a.75.75 0 01.216.664l-.528 3.084 2.769-1.456a.75.75 0 01.698 0l2.77 1.456-.53-3.084a.75.75 0 01.216-.664l2.24-2.183-3.096-.45a.75.75 0 01-.564-.41L8 2.694v.001z',
  commits: 'M1.643 3.143L.427 1.927A.25.25 0 000 2.104V5.75c0 .138.112.25.25.25h3.646a.25.25 0 00.177-.427L2.715 4.215a6.5 6.5 0 11-1.18 4.458.75.75 0 10-1.493.154 8.001 8.001 0 101.6-5.684zM7.75 4a.75.75 0 01.75.75v2.992l2.028.812a.75.75 0 01-.557 1.392l-2.5-1A.75.75 0 017 8.25v-3.5A.75.75 0 017.75 4z',
  pr: 'M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z',
  issue: 'M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm9 3a1 1 0 11-2 0 1 1 0 012 0zm-.25-6.25a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z',
  repo: 'M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n) => n.toLocaleString('pt-BR');

function desenhar(n) {
  const { nivel, percentil } = calcularNota(n);
  const linhas = [
    ['estrela', 'Total de estrelas:', n.estrelas],
    ['commits', 'Total de commits:', n.commits],
    ['pr', 'Total de PRs:', n.prs],
    ['issue', 'Total de issues:', n.issues],
    ['repo', 'Contribuiu para (repositórios):', n.repos],
  ];
  const volta = 2 * Math.PI * 40;
  const descricao = linhas.map(([, rotulo, v]) => `${rotulo} ${v}`).join(', ');
  return `<svg width="467" height="195" viewBox="0 0 467 195" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="titulo desc">
  <title id="titulo">${esc(TITULO)}, nota ${nivel}</title>
  <desc id="desc">${esc(descricao)} (desde a criação da conta)</desc>
  <style>
    .header { font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: #FFFFFF; }
    .stat { font: 700 14px 'Segoe UI', Ubuntu, "Helvetica Neue", Sans-Serif; fill: #FFFFFF; }
    .nota { font: 800 24px 'Segoe UI', Ubuntu, Sans-Serif; fill: #FFFFFF; }
    .icon { fill: #FFFFFF; }
    .stagger { opacity: 0; animation: aparecer .3s ease-in-out forwards; }
    .aro { stroke: #FFFFFF; fill: none; stroke-width: 6; opacity: .2; }
    .anel { stroke: #FFFFFF; fill: none; stroke-width: 6; stroke-linecap: round; opacity: .8;
      stroke-dasharray: ${volta.toFixed(2)}; stroke-dashoffset: ${((percentil / 100) * volta).toFixed(2)};
      transform-origin: -10px 8px; transform: rotate(-90deg); animation: encher 1s ease-in-out; }
    @keyframes aparecer { from { opacity: 0 } to { opacity: 1 } }
    @keyframes encher { from { stroke-dashoffset: ${volta.toFixed(2)} } }
  </style>
  <rect x="0.5" y="0.5" rx="4.5" width="466" height="194" fill="#000000" />
  <text x="25" y="35" class="header">${esc(TITULO)}</text>
  <g transform="translate(0, 55)">
    <g transform="translate(390.5, 47.5)">
      <circle class="aro" cx="-10" cy="8" r="40" />
      <circle class="anel" cx="-10" cy="8" r="40" />
      <text class="nota" x="-10" y="8" dominant-baseline="central" text-anchor="middle">${nivel}</text>
    </g>
${linhas
  .map(
    ([icone, rotulo, valor], i) => `    <g class="stagger" style="animation-delay: ${450 + i * 150}ms" transform="translate(25, ${i * 25})">
      <svg class="icon" viewBox="0 0 16 16" width="16" height="16"><path fill-rule="evenodd" d="${ICONES[icone]}"/></svg>
      <text class="stat" x="25" y="12.5">${esc(rotulo)}</text>
      <text class="stat" x="250" y="12.5">${fmt(valor)}</text>
    </g>`,
  )
  .join('\n')}
  </g>
</svg>
`;
}

const numeros = process.argv.includes('--exemplo')
  ? { estrelas: 2, commits: 1234, prs: 4, issues: 0, repos: 9, revisoes: 0, seguidores: 3 }
  : await buscarNumeros();
console.log(numeros, calcularNota(numeros));
mkdirSync('dist', { recursive: true });
writeFileSync('dist/estatisticas.svg', desenhar(numeros));
