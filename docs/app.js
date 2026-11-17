'use strict';
/* Minhas Finanças — app (interface). A lógica de cálculo está em core.js. */

const C = self.Core;
const { hoje, chaveMes, somarMeses, parseData, fmtISO, diffDias, fmtMoeda: moeda, dataCurta, pad } = C;

const CATEGORIAS = ['Alimentação', 'Mercado', 'Transporte', 'Combustível', 'Moradia', 'Saúde', 'Lazer', 'Compras',
  'Educação', 'Assinaturas', 'Serviços', 'Viagem', 'Outros'];
const CORES = ['#2f6fed', '#8a2be2', '#e5484d', '#f76b15', '#12a594', '#1f2937', '#d6409f', '#0b8043'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

let S; // estado salvo no celular
const ui = { aba: 'inicio', mesContas: chaveMes(hoje()), cartaoAberto: null, mesFatura: null, filtroCartao: '' };
let eventoInstalar = null;

/* ---------- utilidades ---------- */
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const soma = (l) => C.arred(l.reduce((t, p) => t + p.valor, 0));
const nomeMes = (chave) => {
  const [y, m] = chave.split('-').map(Number);
  return MESES[m - 1] + (y !== hoje().getFullYear() ? ' ' + y : '');
};
const cartaoPorId = (id) => S.cartoes.find((c) => c.id === id);
const corTexto = (dias) => (dias < 0 ? 't-atraso' : dias <= S.config.diasAviso ? 't-perto' : '');

function parseValor(s) {
  s = String(s || '').trim().replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // 1.200 = mil e duzentos
  const v = parseFloat(s);
  return Number.isFinite(v) ? C.arred(v) : NaN;
}
const valorInput = (v) => (v ? v.toFixed(2).replace('.', ',') : '');

function toast(msg) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

async function salvar() {
  await C.salvarEstado(S);
  render();
}

/* ---------- componentes ---------- */

function itemPendencia(p) {
  const dias = diffDias(p.vencimento, hoje());
  const prazo = p.pago ? `<span class="t-ok">Pago</span>` : `<span class="${corTexto(dias)}">${C.textoPrazo(dias)}</span>`;
  const abrir = p.tipo === 'fatura' ? `data-action="abrir-cartao" data-id="${p.id}" data-mes="${p.chave}"` : `data-action="editar-conta" data-id="${p.id}"`;
  return `<div class="item">
    <button class="ico" ${abrir} aria-label="Detalhes">${p.tipo === 'fatura' ? '💳' : '📄'}</button>
    <div class="meio" ${abrir}>
      <div class="titulo">${esc(p.nome)}</div>
      <div class="sub">${dataCurta(p.vencimento)} · ${prazo}</div>
    </div>
    <div class="valor ${p.pago ? 'riscado' : ''}">${moeda(p.valor)}</div>
    <button class="check ${p.pago ? 'on' : ''}" data-action="pagar" data-tipo="${p.tipo}" data-id="${p.id}" data-chave="${p.chave}"
      aria-label="${p.pago ? 'Desmarcar pagamento' : 'Marcar como pago'}">✓</button>
  </div>`;
}

function itemCompra(c, extra) {
  const cartao = cartaoPorId(c.cartaoId);
  const parc = c.parcelas > 1 ? ` · ${c.parcelas}x de ${moeda(C.parcelas(c)[1].valor)}` : '';
  return `<button class="item" data-action="editar-compra" data-id="${c.id}">
    <div class="ico" style="background:${cartao ? cartao.cor : 'var(--surface2)'};color:#fff">${esc((cartao?.nome || '?')[0])}</div>
    <div class="meio">
      <div class="titulo">${esc(c.descricao || c.categoria)}</div>
      <div class="sub">${extra || `${dataCurta(parseData(c.data))} · ${esc(cartao?.nome || 'Cartão removido')}${parc}`}</div>
    </div>
    <div class="valor">${moeda(c.valor)}</div>
  </button>`;
}

const mesNav = (acao, chave) => `<div class="mesnav">
  <button class="btn peq" data-action="${acao}" data-delta="-1" aria-label="Mês anterior">‹</button>
  <strong>${nomeMes(chave)}</strong>
  <button class="btn peq" data-action="${acao}" data-delta="1" aria-label="Próximo mês">›</button>
</div>`;

/* ---------- telas ---------- */

function telaInicio() {
  const h = hoje(), km = chaveMes(h);
  const pend = C.pendencias(S);
  const doMes = pend.filter((p) => p.chave === km);
  const aPagar = soma(doMes.filter((p) => !p.pago));
  const pago = soma(doMes.filter((p) => p.pago));
  const alertas = C.alertas(S);
  const proximos = pend.filter((p) => { const d = diffDias(p.vencimento, h); return !p.pago && d > S.config.diasAviso && d <= 30; });

  let html = `<header class="topo"><h1>Minhas finanças</h1></header>
    <div class="card">
      <div class="muted small">A pagar em ${MESES[h.getMonth()]}</div>
      <div class="grande">${moeda(aPagar)}</div>
      <div class="linha-resumo"><span class="t-ok">Pago: ${moeda(pago)}</span><span class="muted">Total: ${moeda(aPagar + pago)}</span></div>
    </div>`;

  if (!S.cartoes.length && !S.contas.length) {
    html += `<div class="card">
      <p><strong>Vamos começar!</strong></p>
      <p class="muted small">Cadastre seus cartões (com dia de fechamento e vencimento) e suas contas fixas. Depois, é só tocar no <strong>+</strong> sempre que passar o cartão.</p>
      <div class="acoes"><button class="btn primario" data-action="novo-cartao">Adicionar cartão</button><button class="btn" data-action="nova-conta">Adicionar conta</button></div>
    </div>`;
  }

  if (!S.config.notificacoes && (S.cartoes.length || S.contas.length)) {
    html += `<div class="card aviso">
      <p><strong>🔔 Ative os lembretes</strong></p>
      <p class="muted small">Receba um aviso quando uma conta estiver perto de vencer.</p>
      <button class="btn primario bloco" data-action="ativar-notif">Ativar lembretes</button>
    </div>`;
  }

  if (alertas.length) {
    html += `<div class="secao">⚠️ Atenção</div><div class="lista">${alertas.map(itemPendencia).join('')}</div>`;
  }
  if (proximos.length) {
    html += `<div class="secao">Próximos 30 dias</div><div class="lista">${proximos.map(itemPendencia).join('')}</div>`;
  }
  if (!alertas.length && !proximos.length && (S.cartoes.length || S.contas.length)) {
    html += `<div class="vazio">✅ Nenhuma conta pendente nos próximos 30 dias.</div>`;
  }

  if (S.cartoes.length) {
    html += `<div class="secao">Faturas abertas</div><div class="lista">` + S.cartoes.map((c) => {
      const chave = C.faturaDaData(c, fmtISO(h)).chave;
      const f = C.fatura(S, c, chave);
      return `<button class="item" data-action="abrir-cartao" data-id="${c.id}" data-mes="${chave}">
        <div class="ico" style="background:${c.cor};color:#fff">${esc(c.nome[0])}</div>
        <div class="meio"><div class="titulo">${esc(c.nome)}</div><div class="sub">Fecha ${dataCurta(C.fechamentoFatura(c, chave))} · vence ${dataCurta(f.vencimento)}</div></div>
        <div class="valor">${moeda(f.total)}</div></button>`;
    }).join('') + `</div>`;
  }
  return html;
}

function telaCartoes() {
  if (ui.cartaoAberto && cartaoPorId(ui.cartaoAberto)) return telaCartao(cartaoPorId(ui.cartaoAberto));
  let html = `<header class="topo"><h1>Cartões</h1><button class="btn peq primario" data-action="novo-cartao">+ Cartão</button></header>`;
  if (!S.cartoes.length) return html + `<div class="vazio">Nenhum cartão ainda.<br><br><button class="btn primario" data-action="novo-cartao">Adicionar meu primeiro cartão</button></div>`;
  const h = fmtISO(hoje());
  for (const c of S.cartoes) {
    const chave = C.faturaDaData(c, h).chave;
    const f = C.fatura(S, c, chave);
    const usado = C.limiteUsado(S, c);
    const pct = c.limite ? Math.min(100, (usado / c.limite) * 100) : 0;
    html += `<button class="cartao-visual" style="background:linear-gradient(135deg, ${c.cor}, ${c.cor}bb)" data-action="abrir-cartao" data-id="${c.id}" data-mes="${chave}">
      <div style="display:flex;justify-content:space-between"><span class="nome">${esc(c.nome)}</span><span class="small">vence dia ${c.vencimento}</span></div>
      <div><div class="small" style="opacity:.85">Fatura de ${nomeMes(chave)}</div><div class="fat">${moeda(f.total)}</div></div>
      ${c.limite ? `<div><div class="small" style="opacity:.85">Disponível ${moeda(c.limite - usado)} de ${moeda(c.limite)}</div><div class="barra"><i style="width:${pct}%"></i></div></div>` : ''}
    </button>`;
  }
  return html;
}

function telaCartao(c) {
  const chave = ui.mesFatura || C.faturaDaData(c, fmtISO(hoje())).chave;
  const f = C.fatura(S, c, chave);
  const st = C.statusFatura(c, f);
  const nomesSt = { paga: 'Paga', vencida: 'Vencida', fechada: 'Fechada', aberta: 'Aberta' };
  const itens = [...f.itens].sort((a, b) => b.compra.data.localeCompare(a.compra.data));
  let html = `<header class="topo"><button class="voltar" data-action="voltar-cartoes" aria-label="Voltar">‹</button><h1>${esc(c.nome)}</h1>
      <button class="btn peq" data-action="editar-cartao" data-id="${c.id}">Editar</button></header>
    ${mesNav('mes-fatura', chave)}
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center"><span class="muted small">Fatura de ${nomeMes(chave)}</span><span class="status ${st}">${nomesSt[st]}</span></div>
      <div class="grande">${moeda(f.total)}</div>
      <div class="muted small">Fecha em ${dataCurta(C.fechamentoFatura(c, chave))} · vence em ${dataCurta(f.vencimento)}</div>
      ${f.total > 0 ? `<div class="acoes"><button class="btn ${f.paga ? '' : 'primario'}" data-action="pagar" data-tipo="fatura" data-id="${c.id}" data-chave="${chave}">${f.paga ? 'Desmarcar pagamento' : '✓ Marcar fatura como paga'}</button></div>` : ''}
    </div>`;
  if (!itens.length) return html + `<div class="vazio">Nenhuma compra nesta fatura.</div>`;
  html += `<div class="secao">${itens.length} lançamento${itens.length > 1 ? 's' : ''}</div><div class="lista">`;
  html += itens.map(({ compra, parcela }) => {
    const extra = `${dataCurta(parseData(compra.data))} · ${esc(compra.categoria)}${parcela.total > 1 ? ` · parcela ${parcela.n}/${parcela.total}` : ''}`;
    return itemCompra({ ...compra, valor: parcela.valor }, extra);
  }).join('');
  return html + `</div>`;
}

function telaContas() {
  const k = ui.mesContas;
  const doMes = C.pendencias(S, k).filter((p) => p.chave === k);
  const falta = soma(doMes.filter((p) => !p.pago));
  let html = `<header class="topo"><h1>Contas</h1><button class="btn peq primario" data-action="nova-conta">+ Conta</button></header>
    ${mesNav('mes-contas', k)}
    <div class="card"><div class="muted small">Falta pagar</div><div class="grande">${moeda(falta)}</div>
      <div class="linha-resumo"><span class="t-ok">Pago: ${moeda(soma(doMes.filter((p) => p.pago)))}</span><span class="muted">Total: ${moeda(soma(doMes))}</span></div></div>`;
  if (!doMes.length) html += `<div class="vazio">Nada vence neste mês.</div>`;
  else html += `<div class="lista">${doMes.map(itemPendencia).join('')}</div>`;
  html += `<p class="muted small" style="text-align:center">Toque em uma conta para editar. Faturas de cartão aparecem aqui automaticamente.</p>`;
  return html;
}

function telaCompras() {
  let html = `<header class="topo"><h1>Compras</h1></header>`;
  if (S.cartoes.length > 1) {
    html += `<div class="filtros"><button class="${ui.filtroCartao ? '' : 'ativo'}" data-action="filtro" data-id="">Todos</button>` +
      S.cartoes.map((c) => `<button class="${ui.filtroCartao === c.id ? 'ativo' : ''}" data-action="filtro" data-id="${c.id}">${esc(c.nome)}</button>`).join('') + `</div>`;
  }
  const lista = S.compras.filter((c) => !ui.filtroCartao || c.cartaoId === ui.filtroCartao)
    .sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id));
  if (!lista.length) return html + `<div class="vazio">Nenhuma compra registrada.<br>Toque no <strong>+</strong> quando passar o cartão.</div>`;
  const grupos = {};
  for (const c of lista) (grupos[c.data.slice(0, 7)] ||= []).push(c);
  for (const [k, itens] of Object.entries(grupos)) {
    html += `<div class="secao">${nomeMes(k)} · ${moeda(soma(itens))}</div><div class="lista">${itens.map((c) => itemCompra(c)).join('')}</div>`;
  }
  return html;
}

function telaAjustes() {
  const suporta = 'Notification' in window;
  const perm = suporta ? Notification.permission : 'indisponível';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalado = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return `<header class="topo"><h1>Ajustes</h1></header>
    <div class="secao">Lembretes</div>
    <div class="card">
      <div class="ajuste"><div><strong>Notificações</strong><div class="muted small">${S.config.notificacoes && perm === 'granted' ? 'Ativadas' : suporta ? 'Desativadas' : 'Não suportadas neste navegador'}</div></div>
        <button class="btn peq ${S.config.notificacoes ? '' : 'primario'}" data-action="${S.config.notificacoes ? 'desativar-notif' : 'ativar-notif'}">${S.config.notificacoes ? 'Desativar' : 'Ativar'}</button></div>
      <div class="ajuste"><div><strong>Avisar com antecedência</strong></div>
        <select data-config="diasAviso">${[1, 2, 3, 5, 7].map((d) => `<option value="${d}" ${S.config.diasAviso === d ? 'selected' : ''}>${d} dia${d > 1 ? 's' : ''}</option>`).join('')}</select></div>
      <p class="muted small" style="margin-top:12px">O app avisa ao ser aberto${ios ? '' : ' e, no Android com o app instalado, também em segundo plano'}. Para lembretes garantidos mesmo com o app fechado, adicione os vencimentos à agenda do celular:</p>
      <button class="btn bloco" data-action="ics">📅 Adicionar lembretes à agenda</button>
    </div>

    ${instalado ? '' : `<div class="secao">Instalar no celular</div>
    <div class="card">
      ${eventoInstalar ? `<button class="btn primario bloco" data-action="instalar">Instalar app</button>` :
        ios ? `<p class="small">No Safari, toque em <strong>Compartilhar</strong> (quadrado com seta) e depois em <strong>Adicionar à Tela de Início</strong>. No iPhone, as notificações só funcionam com o app instalado.</p>`
          : `<p class="small">No Chrome, toque no menu <strong>⋮</strong> e depois em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</p>`}
    </div>`}

    <div class="secao">Seus dados</div>
    <div class="card">
      <p class="muted small">Seus dados ficam só neste celular. Faça backup de vez em quando (ex.: salve no Google Drive ou iCloud).</p>
      <div class="acoes"><button class="btn" data-action="exportar">⬇️ Fazer backup</button><button class="btn" data-action="importar">⬆️ Restaurar</button></div>
      <button class="btn perigo bloco" style="margin-top:10px" data-action="apagar-tudo">Apagar todos os dados</button>
    </div>
    <p class="muted small" style="text-align:center">${S.cartoes.length} cartões · ${S.compras.length} compras · ${S.contas.length} contas</p>`;
}

function render() {
  const telas = { inicio: telaInicio, cartoes: telaCartoes, contas: telaContas, compras: telaCompras, ajustes: telaAjustes };
  $('#view').innerHTML = telas[ui.aba]();
  document.querySelectorAll('nav.abas button').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === ui.aba));
  $('.fab').hidden = ui.aba === 'ajustes';
}

/* ---------- formulários (folhas que sobem de baixo) ---------- */

function abrirSheet(html) {
  $('#sheet').innerHTML = `<div class="overlay" data-action="fechar-sheet"><div class="sheet" role="dialog" aria-modal="true"><div class="alca"></div>${html}</div></div>`;
}
const fecharSheet = () => { $('#sheet').innerHTML = ''; };

function formCompra(compra) {
  if (!S.cartoes.length) {
    toast('Cadastre um cartão primeiro');
    return formCartao();
  }
  const c = compra || { cartaoId: ui.cartaoAberto || S.cartoes[0].id, data: fmtISO(hoje()), parcelas: 1, categoria: 'Outros' };
  abrirSheet(`<h3>${compra ? 'Editar compra' : 'Nova compra no cartão'}</h3>
    <form data-form="compra" data-id="${compra ? compra.id : ''}" autocomplete="off">
      <input class="valor-grande" name="valor" inputmode="decimal" placeholder="R$ 0,00" value="${valorInput(c.valor)}" required ${compra ? '' : 'autofocus'}>
      <div class="dica" id="dica-parcela"></div>
      <label class="campo"><span>Descrição</span><input name="descricao" placeholder="Ex.: Mercado, iFood, Uber..." value="${esc(c.descricao)}"></label>
      <div class="campo"><span>Cartão</span><div class="chips">${S.cartoes.map((k) =>
        `<label class="chip"><input type="radio" name="cartaoId" value="${k.id}" ${k.id === c.cartaoId ? 'checked' : ''}><span>${esc(k.nome)}</span></label>`).join('')}</div></div>
      <div class="duas">
        <label class="campo"><span>Data</span><input type="date" name="data" value="${c.data}" required></label>
        <label class="campo"><span>Parcelas</span><select name="parcelas">${Array.from({ length: 24 }, (_, i) => i + 1).map((n) =>
          `<option value="${n}" ${n === c.parcelas ? 'selected' : ''}>${n === 1 ? 'À vista' : n + 'x'}</option>`).join('')}</select></label>
      </div>
      <label class="campo"><span>Categoria</span><select name="categoria">${CATEGORIAS.map((k) => `<option ${k === c.categoria ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <button class="btn primario bloco" type="submit">Salvar</button>
      ${compra ? `<div class="acoes"><button class="btn perigo" type="button" data-action="excluir-compra" data-id="${compra.id}">Excluir compra</button></div>` : ''}
    </form>`);
  atualizarDica();
}

function atualizarDica() {
  const form = document.querySelector('form[data-form="compra"]');
  if (!form) return;
  const fd = new FormData(form);
  const valor = parseValor(fd.get('valor'));
  const cartao = cartaoPorId(fd.get('cartaoId'));
  const n = Number(fd.get('parcelas'));
  if (!cartao || !fd.get('data')) return;
  const f = C.faturaDaData(cartao, fd.get('data'));
  let txt = `Entra na fatura de ${nomeMes(f.chave)} (vence ${dataCurta(f.vencimento)})`;
  if (n > 1 && valor > 0) txt = `${n}x de ${moeda(C.parcelas({ valor, parcelas: n })[1].valor)} · 1ª parcela na fatura de ${nomeMes(f.chave)}`;
  $('#dica-parcela').textContent = txt;
}

function formCartao(cartao) {
  const c = cartao || { cor: CORES[S.cartoes.length % CORES.length], fechamento: '', vencimento: '' };
  abrirSheet(`<h3>${cartao ? 'Editar cartão' : 'Novo cartão'}</h3>
    <form data-form="cartao" data-id="${cartao ? cartao.id : ''}" autocomplete="off">
      <label class="campo"><span>Nome do cartão</span><input name="nome" placeholder="Ex.: Nubank, Itaú Visa" value="${esc(c.nome)}" required maxlength="30"></label>
      <div class="duas">
        <label class="campo"><span>Dia do fechamento</span><input name="fechamento" type="number" inputmode="numeric" min="1" max="31" value="${c.fechamento}" required></label>
        <label class="campo"><span>Dia do vencimento</span><input name="vencimento" type="number" inputmode="numeric" min="1" max="31" value="${c.vencimento}" required></label>
      </div>
      <label class="campo"><span>Limite (opcional)</span><input name="limite" inputmode="decimal" placeholder="R$ 0,00" value="${valorInput(c.limite)}"></label>
      <div class="campo"><span>Cor</span><div class="cores">${CORES.map((k) =>
        `<label class="cor"><input type="radio" name="cor" value="${k}" ${k === c.cor ? 'checked' : ''}><span style="background:${k}"></span></label>`).join('')}</div></div>
      <button class="btn primario bloco" type="submit">Salvar</button>
      ${cartao ? `<div class="acoes"><button class="btn perigo" type="button" data-action="excluir-cartao" data-id="${cartao.id}">Excluir cartão</button></div>` : ''}
    </form>`);
}

function formConta(conta) {
  const c = conta || { recorrente: true, dia: hoje().getDate(), data: fmtISO(hoje()), categoria: 'Moradia' };
  abrirSheet(`<h3>${conta ? 'Editar conta' : 'Nova conta a pagar'}</h3>
    <form data-form="conta" data-id="${conta ? conta.id : ''}" autocomplete="off">
      <label class="campo"><span>Nome</span><input name="nome" placeholder="Ex.: Aluguel, Luz, Internet" value="${esc(c.nome)}" required maxlength="40"></label>
      <label class="campo"><span>Valor</span><input name="valor" inputmode="decimal" placeholder="R$ 0,00" value="${valorInput(c.valor)}" required></label>
      <label class="campo"><span>Repetição</span><select name="recorrente">
        <option value="1" ${c.recorrente ? 'selected' : ''}>Todo mês</option><option value="0" ${c.recorrente ? '' : 'selected'}>Só uma vez</option></select></label>
      <div data-mostrar="recorrente" ${c.recorrente ? '' : 'hidden'}>
        <div class="duas">
          <label class="campo"><span>Vence todo dia</span><input name="dia" type="number" inputmode="numeric" min="1" max="31" value="${c.dia || ''}"></label>
          <label class="campo"><span>Até (opcional)</span><input name="fim" type="month" value="${c.fim || ''}"></label>
        </div>
      </div>
      <div data-mostrar="unica" ${c.recorrente ? 'hidden' : ''}>
        <label class="campo"><span>Data de vencimento</span><input name="data" type="date" value="${c.data || ''}"></label>
      </div>
      <label class="campo"><span>Categoria</span><select name="categoria">${CATEGORIAS.map((k) => `<option ${k === c.categoria ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <button class="btn primario bloco" type="submit">Salvar</button>
      ${conta ? `<div class="acoes"><button class="btn perigo" type="button" data-action="excluir-conta" data-id="${conta.id}">Excluir conta</button></div>` : ''}
    </form>`);
}

/* ---------- salvar formulários ---------- */

async function enviarForm(form) {
  const fd = new FormData(form);
  const id = form.dataset.id;
  const tipo = form.dataset.form;

  if (tipo === 'compra') {
    const valor = parseValor(fd.get('valor'));
    if (!(valor > 0)) return toast('Informe um valor válido');
    const dados = { cartaoId: fd.get('cartaoId'), descricao: fd.get('descricao').trim(), valor, data: fd.get('data'),
      parcelas: Number(fd.get('parcelas')), categoria: fd.get('categoria') };
    if (!dados.cartaoId) return toast('Escolha o cartão');
    if (id) Object.assign(S.compras.find((c) => c.id === id), dados);
    else S.compras.push({ id: uid(), ...dados });
    fecharSheet();
    toast(id ? 'Compra atualizada' : `Compra de ${moeda(valor)} registrada`);
  }

  if (tipo === 'cartao') {
    const dados = { nome: fd.get('nome').trim(), fechamento: Number(fd.get('fechamento')), vencimento: Number(fd.get('vencimento')),
      limite: parseValor(fd.get('limite')) || 0, cor: fd.get('cor') || CORES[0] };
    if (!dados.nome) return toast('Informe o nome');
    if (!(dados.fechamento >= 1 && dados.fechamento <= 31 && dados.vencimento >= 1 && dados.vencimento <= 31)) return toast('Dias devem ser entre 1 e 31');
    if (id) Object.assign(cartaoPorId(id), dados);
    else S.cartoes.push({ id: uid(), ...dados });
    fecharSheet();
    toast(id ? 'Cartão atualizado' : 'Cartão adicionado');
  }

  if (tipo === 'conta') {
    const valor = parseValor(fd.get('valor'));
    if (!(valor > 0)) return toast('Informe um valor válido');
    const recorrente = fd.get('recorrente') === '1';
    const dados = { nome: fd.get('nome').trim(), valor, recorrente, categoria: fd.get('categoria') };
    if (recorrente) {
      dados.dia = Number(fd.get('dia'));
      if (!(dados.dia >= 1 && dados.dia <= 31)) return toast('Dia de vencimento deve ser entre 1 e 31');
      dados.fim = fd.get('fim') || '';
    } else {
      dados.data = fd.get('data');
      if (!dados.data) return toast('Informe a data de vencimento');
    }
    if (id) Object.assign(S.contas.find((c) => c.id === id), dados);
    else {
      // Conta mensal cadastrada depois do vencimento deste mês: começa a contar no mês que vem.
      const km = chaveMes(hoje());
      const inicio = recorrente && dados.dia < hoje().getDate() ? somarMeses(km, 1) : km;
      S.contas.push({ id: uid(), inicio, pagos: {}, ...dados });
    }
    fecharSheet();
    toast(id ? 'Conta atualizada' : 'Conta adicionada');
  }
  await salvar();
  verificarNotificacoes();
}

/* ---------- notificações, agenda, backup ---------- */

async function swPronto() {
  if (!('serviceWorker' in navigator)) return null;
  return Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 3000))]);
}

async function verificarNotificacoes() {
  const reg = await swPronto();
  if (reg) await C.enviarNotificacoes(reg, S).catch(() => {});
}

async function ativarNotificacoes() {
  if (!('Notification' in window)) {
    return toast(/iphone|ipad/i.test(navigator.userAgent)
      ? 'No iPhone, instale o app na Tela de Início primeiro (veja em Ajustes).'
      : 'Este navegador não suporta notificações.');
  }
  const p = await Notification.requestPermission();
  if (p !== 'granted') return toast('Permissão de notificação negada. Libere nas configurações do celular.');
  S.config.notificacoes = true;
  await salvar();
  const reg = await swPronto();
  if (reg && 'periodicSync' in reg) {
    try { await reg.periodicSync.register('verificar-contas', { minInterval: 12 * 60 * 60 * 1000 }); } catch (e) { /* não suportado */ }
  }
  toast('Lembretes ativados');
  verificarNotificacoes();
}

async function compartilharOuBaixar(conteudo, nome, tipo) {
  const arquivo = new File([conteudo], nome, { type: tipo });
  if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
    try { await navigator.share({ files: [arquivo], title: nome }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(arquivo);
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function gerarICS() {
  const CRLF = '\r\n';
  const icsEsc = (s) => String(s).replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const n = S.config.diasAviso;
  const gatilho = (d) => (d <= 0 ? 'PT9H' : `-P${d - 1 > 0 ? d - 1 + 'D' : ''}T15H`); // 9h da manhã
  const regraMensal = (dia) => (dia > 28
    ? `FREQ=MONTHLY;BYMONTHDAY=${Array.from({ length: dia - 27 }, (_, i) => 28 + i).join(',')};BYSETPOS=-1`
    : `FREQ=MONTHLY;BYMONTHDAY=${dia}`);
  const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Minhas Financas//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  const evento = (id, titulo, inicio, rrule) => {
    linhas.push('BEGIN:VEVENT', `UID:${id}@minhas-financas`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${fmtISO(inicio).replace(/-/g, '')}`,
      `SUMMARY:${icsEsc(titulo)}`, 'TRANSP:TRANSPARENT');
    if (rrule) linhas.push('RRULE:' + rrule);
    for (const d of new Set([n, 0])) {
      linhas.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(titulo)}`, `TRIGGER:${gatilho(d)}`, 'END:VALARM');
    }
    linhas.push('END:VEVENT');
  };
  const km = chaveMes(hoje());
  let total = 0;
  for (const c of S.cartoes) {
    evento('cartao-' + c.id, `💳 Vence fatura ${c.nome}`, C.vencimentoFatura(c, km), regraMensal(c.vencimento));
    total++;
  }
  for (const c of S.contas) {
    if (c.recorrente) {
      const inicio = c.inicio > km ? c.inicio : km;
      if (c.fim && c.fim < inicio) continue;
      const [y, m] = inicio.split('-').map(Number);
      let regra = regraMensal(c.dia);
      if (c.fim) { const [fy, fm] = c.fim.split('-').map(Number); regra += `;UNTIL=${fy}${pad(fm)}${pad(new Date(fy, fm, 0).getDate())}`; }
      evento('conta-' + c.id, `📄 Vence ${c.nome} (${moeda(c.valor)})`, C.dataLocal(y, m - 1, c.dia), regra);
      total++;
    } else if (c.data >= fmtISO(hoje()) && !(c.pagos || {})[c.data.slice(0, 7)]) {
      evento('conta-' + c.id, `📄 Vence ${c.nome} (${moeda(c.valor)})`, parseData(c.data));
      total++;
    }
  }
  linhas.push('END:VCALENDAR');
  return { texto: linhas.join(CRLF) + CRLF, total };
}

async function exportarICS() {
  const { texto, total } = gerarICS();
  if (!total) return toast('Cadastre cartões ou contas primeiro');
  await compartilharOuBaixar(texto, 'lembretes-financas.ics', 'text/calendar');
}

async function exportarBackup() {
  const nome = `financas-backup-${fmtISO(hoje())}.json`;
  await compartilharOuBaixar(JSON.stringify(S, null, 2), nome, 'application/json');
}

async function importarBackup(arquivo) {
  try {
    const dados = JSON.parse(await arquivo.text());
    if (!Array.isArray(dados.cartoes) || !Array.isArray(dados.compras)) throw new Error('formato');
    if (!confirm('Restaurar este backup? Os dados atuais do app serão substituídos.')) return;
    S = C.normalizar(dados);
    await salvar();
    toast('Backup restaurado');
  } catch (e) {
    toast('Arquivo de backup inválido');
  }
}

/* ---------- eventos ---------- */

document.addEventListener('click', async (e) => {
  const aba = e.target.closest('[data-aba]');
  if (aba) {
    ui.aba = aba.dataset.aba;
    if (ui.aba !== 'cartoes') ui.cartaoAberto = null;
    window.scrollTo(0, 0);
    return render();
  }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id } = el.dataset;
  if (action === 'fechar-sheet') { if (e.target === el) fecharSheet(); return; }

  switch (action) {
    case 'novo':
      if (ui.aba === 'contas') formConta();
      else formCompra();
      break;
    case 'novo-cartao': formCartao(); break;
    case 'nova-conta': formConta(); break;
    case 'editar-cartao': formCartao(cartaoPorId(id)); break;
    case 'editar-compra': formCompra(S.compras.find((c) => c.id === id)); break;
    case 'editar-conta': formConta(S.contas.find((c) => c.id === id)); break;
    case 'abrir-cartao':
      ui.aba = 'cartoes'; ui.cartaoAberto = id; ui.mesFatura = el.dataset.mes || null;
      window.scrollTo(0, 0); render(); break;
    case 'voltar-cartoes': ui.cartaoAberto = null; render(); break;
    case 'mes-fatura': {
      const c = cartaoPorId(ui.cartaoAberto);
      ui.mesFatura = somarMeses(ui.mesFatura || C.faturaDaData(c, fmtISO(hoje())).chave, Number(el.dataset.delta));
      render(); break;
    }
    case 'mes-contas': ui.mesContas = somarMeses(ui.mesContas, Number(el.dataset.delta)); render(); break;
    case 'filtro': ui.filtroCartao = id; render(); break;
    case 'pagar': {
      const { tipo, chave } = el.dataset;
      const jaPago = tipo === 'fatura' ? !!S.faturasPagas[id + '|' + chave] : !!(S.contas.find((c) => c.id === id)?.pagos || {})[chave];
      C.marcarPago(S, tipo, id, chave, !jaPago);
      await salvar();
      toast(jaPago ? 'Pagamento desmarcado' : 'Marcado como pago ✓');
      break;
    }
    case 'excluir-compra':
      if (confirm('Excluir esta compra?')) { S.compras = S.compras.filter((c) => c.id !== id); fecharSheet(); await salvar(); toast('Compra excluída'); }
      break;
    case 'excluir-conta':
      if (confirm('Excluir esta conta e todo o histórico de pagamentos dela?')) { S.contas = S.contas.filter((c) => c.id !== id); fecharSheet(); await salvar(); toast('Conta excluída'); }
      break;
    case 'excluir-cartao': {
      const n = S.compras.filter((c) => c.cartaoId === id).length;
      if (confirm(`Excluir este cartão${n ? ` e as ${n} compras dele` : ''}?`)) {
        S.cartoes = S.cartoes.filter((c) => c.id !== id);
        S.compras = S.compras.filter((c) => c.cartaoId !== id);
        for (const k of Object.keys(S.faturasPagas)) if (k.startsWith(id + '|')) delete S.faturasPagas[k];
        ui.cartaoAberto = null; fecharSheet(); await salvar(); toast('Cartão excluído');
      }
      break;
    }
    case 'ativar-notif': await ativarNotificacoes(); break;
    case 'desativar-notif': S.config.notificacoes = false; await salvar(); break;
    case 'ics': await exportarICS(); break;
    case 'exportar': await exportarBackup(); break;
    case 'importar': $('#arquivo-backup').click(); break;
    case 'instalar':
      if (eventoInstalar) { eventoInstalar.prompt(); eventoInstalar = null; render(); }
      break;
    case 'apagar-tudo':
      if (confirm('Apagar TODOS os cartões, compras e contas? Isso não pode ser desfeito.') && confirm('Tem certeza? Faça um backup antes se quiser guardar.')) {
        S = C.normalizar({}); await salvar(); toast('Dados apagados');
      }
      break;
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  enviarForm(form);
});

document.addEventListener('input', (e) => {
  if (e.target.closest('form[data-form="compra"]')) atualizarDica();
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.name === 'recorrente') {
    const form = t.form, rec = t.value === '1';
    form.querySelector('[data-mostrar="recorrente"]').hidden = !rec;
    form.querySelector('[data-mostrar="unica"]').hidden = rec;
  }
  if (t.closest('form[data-form="compra"]')) atualizarDica();
  if (t.dataset.config === 'diasAviso') { S.config.diasAviso = Number(t.value); await salvar(); }
  if (t.id === 'arquivo-backup' && t.files[0]) { await importarBackup(t.files[0]); t.value = ''; }
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharSheet(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S) { render(); verificarNotificacoes(); }
});
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); eventoInstalar = e; if (ui.aba === 'ajustes') render(); });

/* ---------- início ---------- */

(async function iniciar() {
  S = await C.lerEstado();
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  verificarNotificacoes();
})();
