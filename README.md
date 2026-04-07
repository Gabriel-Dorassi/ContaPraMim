# Conta Pra Mim

PWA de controle financeiro diário baseado no **Método Breno Nogueira**.

## 📱 Como usar no iPhone

1. Acesse a URL hospedada pelo GitHub Pages (veja abaixo)
2. No **Safari**, toque em **Compartilhar** → **"Adicionar à Tela de Início"**
3. O app ficará na sua home screen igual a um app nativo

## ✨ Funcionalidades

- 📅 **Lista diária de saldos** — acompanhe cada dia do mês
- 💸 **Saídas, Entradas e Cartão de crédito** — 3 tipos de lançamento
- 🔄 **Lançamentos recorrentes** — por nº de parcelas ou "a perder de vista"
- 📊 **Coluna dinâmica** — alterne entre Saídas / Entradas / Diários / Cartão
- 📅 **Previsão de Diário** — define limites por categoria e calcula diário
- 🌐 **Horizonte de Saldos** — projeção de até 6 meses futuros
- 🏷️ **Tags personalizadas** com emoji e cor
- 💳 **Gasto com Cartão** com campo Vencimento da fatura
- 💾 **Dados salvos localmente** (localStorage) — sem servidor
- 📤 **Exportar/Importar dados** em JSON
- ✈️ **Funciona offline** (Service Worker)

## 🗂 Estrutura

```
conta-pra-mim/
├── index.html       # Shell do app
├── app.js           # Lógica principal
├── app.css          # Estilos
├── manifest.json    # PWA manifest
├── sw.js            # Service Worker (offline)
└── icons/           # Ícones do app
```

## 🚀 Deploy (GitHub Pages)

1. Vá em **Settings** → **Pages**
2. Source: `main` branch, pasta raiz `/`
3. Salvar — o GitHub Pages vai publicar em `https://gabriel-dorassi.github.io/ContaPraMim`

---

Desenvolvido com ❤️ seguindo o método do [Breno Nogueira](https://www.youtube.com/@brenonogueirapessoal)
