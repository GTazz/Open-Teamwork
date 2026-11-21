# Open Teamwork

Protótipo de plicativo mobile com o objetivo de conectar pessoas em projetos colaborativos de acordo com suas habilidades e qualificações.

A plataforma permite criar projetos, encontrar colaboradores, visualizar oportunidades e realizar candidaturas, promovendo colaboração, aprendizado coletivo e valorização das habilidades profissionais.

## 🚀 Deploy

[![Site](https://img.shields.io/badge/Site-Open%20Teamwork-success?style=for-the-badge)](https://otw.gtazz.dev)
[![Android](https://img.shields.io/badge/Android-Baixar%20APK-3DDC84?style=for-the-badge&logo=android&logoColor=white)](https://github.com/GTazz/Open-Teamwork/releases/download/android-latest/open-teamwork.apk)
[![Protótipo](https://img.shields.io/badge/Protótipo-primeira%20versão-lightgrey?style=for-the-badge)](https://gtazz.github.io/Open-Teamwork-Prototype/)

O primeiro acesso depois de um tempo parado pode levar até 1 minuto (o servidor gratuito dorme).

## 🎥 Pitch / Apresentação

[![Open Teamwork - Pitch](https://img.youtube.com/vi/sJD4bKfjqs0/maxresdefault.jpg)](https://www.youtube.com/watch?v=sJD4bKfjqs0)

## Rodar no seu computador

```bash
npm install
copy .env.example .env     # no Linux/Mac: cp .env.example .env
npm start
```

A aplicação fica disponível em `http://localhost:3000`. Em desenvolvimento o
banco é um arquivo SQLite criado automaticamente em `data/open-teamwork.sqlite`
(esquema em `db/schema.sql`). Os testes automáticos rodam com `npm test`.

A API oferece cadastro/login (com **nick** único e imutável), perfis públicos,
diretório de pessoas, projetos, qualificações e candidaturas.

## Publicar gratuitamente

Site + API no **Render** e banco **Turso**, sem cartão de crédito. Passo a passo
em [`DEPLOY.md`](DEPLOY.md).

## App mobile

O site é instalável como app (PWA) e também pode virar app Android/iOS com
Capacitor. Veja [`MOBILE.md`](MOBILE.md).
