# Publicar o Open Teamwork de graça

**Arquitetura (tudo no plano gratuito, sem cartão):**

| Peça | Serviço | Para quê |
|---|---|---|
| Site + API (Node) | **Render** (Web Service gratuito) | Roda o `server.js` e entrega as páginas |
| Banco de dados | **Turso** (plano gratuito) | Guarda usuários, projetos e fotos de perfil de forma permanente |
| Código | **GitHub** | O Render baixa o código daqui |

> **Por que não usar só o Render?** No plano gratuito do Render o disco é
> temporário: um arquivo SQLite local seria apagado a cada reinício ou nova
> publicação, e o Postgres gratuito do Render expira depois de um prazo (30 dias
> segundo a documentação). O Turso gratuito é um banco SQLite persistente, por
> isso o app usa ele em produção. O código escolhe sozinho: com `TURSO_DATABASE_URL`
> definido usa o Turso; sem ele, usa o arquivo local (desenvolvimento).

Condições dos planos verificadas em nov/2026 em [render.com/docs/free](https://render.com/docs/free)
e [turso.tech/pricing](https://turso.tech/pricing). Planos gratuitos podem mudar: confira as páginas antes de publicar.

---

## 1. Colocar o código no GitHub

1. Crie um repositório (pode ser privado) e envie o projeto.
2. Confira que **`.env`, `node_modules/` e `data/*.sqlite` não foram enviados**
   (o `.gitignore` já bloqueia os três).
3. Rode `npm install` uma vez antes de enviar: ele atualiza o `package-lock.json`
   com o novo pacote `@libsql/client`.

## 2. Criar o banco no Turso

1. Crie a conta em <https://app.turso.tech> (sem cartão) e um banco novo.
2. Copie a **URL** do banco (`libsql://nome-usuario.turso.io`).
3. Gere um **token de acesso** do banco (opção de criar token no painel) e copie.

Não precisa criar tabelas: o servidor cria tudo sozinho no primeiro início.

## 3. Criar o serviço no Render

**Jeito mais fácil (usa o `render.yaml` do projeto):**

1. Em <https://dashboard.render.com> escolha **New → Blueprint** e conecte o repositório.
2. Quando pedir, preencha `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` com os valores do passo 2.
   (`JWT_SECRET` é gerado automaticamente.)
3. Confirme. O primeiro deploy leva alguns minutos.

**Jeito manual:** New → Web Service → repositório, e:

- Runtime: **Node**, Instance type: **Free**
- Build command: `npm install --omit=dev`
- Start command: `node server.js`
- Health check path: `/api/health`
- Variáveis: `NODE_ENV=production`, `JWT_SECRET` (32+ caracteres aleatórios),
  `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`

## 4. Testar

- `https://SEU-SERVICO.onrender.com/api/health` deve responder `{"status":"ok"}`.
- Crie uma conta na aba **Perfil**, publique um projeto e confira na aba **Membros**.
- Nos logs do Render deve aparecer `banco: turso`. Se aparecer o aviso de SQLite local, as
  variáveis do Turso não foram lidas.

## Limites do plano gratuito (leia antes de divulgar)

- **O serviço dorme após 15 minutos sem acesso** e leva cerca de 1 minuto para
  acordar no primeiro acesso seguinte. Para um protótipo é aceitável.
- **750 horas gratuitas por mês** por conta. Um único serviço ligado o mês todo usa ~720 h, então cabe.
  Se as horas acabarem, o serviço fica suspenso até o mês seguinte.
- **Manter acordado (opcional):** um monitor gratuito (ex.: cron-job.org) chamando
  `/api/health` a cada 14 minutos evita o sono. Isso consome mais das 750 horas.
- **Turso gratuito:** 5 GB, 500 milhões de leituras e 10 milhões de escritas por mês. No plano
  gratuito, passar do limite exige migrar para plano pago; um projeto deste porte fica muito abaixo.
- **Fotos de perfil** ficam no banco (≈30 KB cada, já reduzidas no navegador). Com milhares de
  usuários vale migrar para um serviço de arquivos; até lá cabem com folga nos 5 GB.

## Proteções já incluídas

- Só `index.html`, `assets/`, `js/`, `pages/` e `icons/` são públicos (código do servidor,
  `package.json`, banco e `.env` não são acessíveis pelo navegador).
- Cabeçalhos de segurança e política de conteúdo (CSP) em todas as respostas.
- Limite de tentativas de login (por conta e por endereço), de cadastros e de consultas de nick.
- Em produção o servidor **não inicia** com `JWT_SECRET` fraco ou de exemplo.
- Contato (e-mail/telefone) de um perfil só aparece para pessoas logadas.

## Atualizando o site

Cada `git push` na branch principal dispara um novo deploy automático no Render. Os dados
ficam no Turso e não são perdidos.

> O link do README para o GitHub Pages (`gtazz.github.io/...`) é uma publicação **só de
> páginas**: ela não executa a API. Depois do deploy no Render, atualize esse link.
