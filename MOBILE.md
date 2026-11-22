# Versão app mobile

**APK pronto para Android:** <https://github.com/GTazz/Open-Teamwork/releases/download/android-latest/open-teamwork.apk>

Ele é gerado sozinho pelo GitHub Actions (`.github/workflows/android.yml`) a cada push no `main`
que mude o site. Para gerar na hora: aba **Actions → Android APK → Run workflow**.

**Atualizações do app** (`js/app-update.js`, injetado pelo `npm run mobile:prepare`):

- **Páginas (automático):** todo push que muda o site publica as páginas do app no release
  `android-web` (`web-<build>.zip` + `version.json`). O app baixa em segundo plano
  (plugin `@capgo/capacitor-updater`, sem serviço da Capgo e sem estatísticas) e usa a versão nova
  a partir da próxima abertura. Sem internet, abre com a última versão baixada.
- **APK (obrigatório):** só é gerado de novo quando muda algo nativo desde o último APK
  (`mobile/`, `capacitor.config.json`, `package.json`, `package-lock.json`, o workflow) ou à mão
  em **Run workflow → Gerar um APK novo**. Apps com APK mais antigo ficam bloqueados por uma tela
  cheia; o botão baixa o APK dentro do app (`mobile/apk-installer`) e abre o instalador do Android.
- O servidor informa as versões em `/api/app/android` (consulta o GitHub a cada 5 minutos).

O projeto já está preparado de duas formas. Comece pela primeira (grátis e imediata).

## Opção 1 — App instalável (PWA): grátis, sem loja

Depois de publicar o site (veja `DEPLOY.md`), o navegador oferece instalar o Open Teamwork:

- **Android (Chrome):** menu ⋮ → *Instalar app* / *Adicionar à tela inicial*.
- **iPhone (Safari):** botão compartilhar → *Adicionar à Tela de Início*.

Ele abre em tela cheia, com ícone próprio. O manifesto (`manifest.webmanifest`),
os ícones (`icons/`) e o service worker (`sw.js`) já estão no projeto.

## Opção 2 — App nativo (Android/iOS) com Capacitor

O Capacitor embrulha as mesmas páginas num app. `capacitor.config.json` e o script
`npm run mobile:prepare` já estão prontos.

1. **Publique o servidor** (DEPLOY.md) e troque `PRODUCTION_API_URL` no início de
   `js/api-client.js` pelo endereço real (ex.: `https://meu-app.onrender.com`).
   O app nativo precisa disso porque as páginas ficam dentro do aparelho e a API fica na internet.
   O servidor já autoriza o app (`capacitor://localhost` e `https://localhost`).
2. Instale o Capacitor no projeto:
   ```bash
   npm install -D @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
   npx cap add android      # e/ou: npx cap add ios
   ```
3. Gere e sincronize as páginas sempre que mudar o site:
   ```bash
   npm run mobile:prepare
   npx cap sync
   ```
4. Abra o projeto nativo e gere o app:
   ```bash
   npx cap open android     # Android Studio → Build → Build APK
   npx cap open ios         # exige um Mac com Xcode
   ```
5. Ícone do app: use `icons/app-icon-1024.png` (por exemplo com o assistente *Image Asset* do Android Studio).

### Custos (só para publicar nas lojas)

| Destino | Custo |
|---|---|
| Instalar via PWA ou enviar o APK direto (Android) | **Grátis** |
| Google Play | **US$ 25, pagamento único** |
| Apple App Store | **US$ 99 por ano**, e exige um Mac |

Valores verificados em nov/2026. Para ficar 100% gratuito, use a Opção 1 ou distribua o APK.

## Observações

- O app mobile usa a mesma API e o mesmo banco do site: contas e projetos são compartilhados.
- Notificações push, câmera e outros recursos nativos podem ser adicionados depois com plugins
  do Capacitor, sem reescrever o site.
