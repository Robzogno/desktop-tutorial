# Minhas Finanças

App de finanças pessoais para celular (PWA, que você instala pelo navegador, sem loja de apps).

- **Cartões:** vários cartões, com dia de fechamento, vencimento e limite.
- **Compras:** à vista ou parceladas (até 24x). O app calcula em qual fatura cai cada parcela.
- **Contas a pagar:** mensais (aluguel, luz...) ou únicas (IPVA...). Toque em ✓ para marcar como paga.
- **Lembretes:** notificação quando uma conta ou fatura está perto de vencer, mais exportação para a agenda do celular.
- **Dados:** ficam só no seu celular. Use Ajustes → Fazer backup de vez em quando.

## Como colocar no ar (GitHub Pages, grátis)

1. No GitHub, abra o repositório → **Settings** → **Pages**.
2. Em *Build and deployment*, escolha **Deploy from a branch**.
3. Selecione a branch (`main` ou a branch onde estão os arquivos) e a pasta **/docs** → **Save**.
4. Em 1 ou 2 minutos o endereço aparece no topo da página (algo como `https://SEU-USUARIO.github.io/desktop-tutorial/`).

## Como instalar no celular

- **iPhone (Safari):** abra o link → Compartilhar → *Adicionar à Tela de Início*. Abra pelo ícone e ative os lembretes em Ajustes.
- **Android (Chrome):** abra o link → menu ⋮ → *Instalar app*.

## Arquivos

| Arquivo | Para quê |
|---|---|
| `index.html` | Estrutura da página |
| `styles.css` | Visual |
| `app.js` | Telas e formulários |
| `core.js` | Cálculos (faturas, parcelas, vencimentos), armazenamento e notificações |
| `sw.js` | Funciona offline e verifica as contas em segundo plano |
