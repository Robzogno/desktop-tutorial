/* Lógica compartilhada entre o app (página) e o service worker.
   Tudo fica salvo no próprio celular (IndexedDB). */
(function (g) {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');
  const diasNoMes = (y, m0) => new Date(y, m0 + 1, 0).getDate();

  /* Cria uma data local; se o dia não existir no mês (ex.: 31/02), usa o último dia. */
  function dataLocal(y, m0, d) {
    const base = new Date(y, m0, 1);
    const yy = base.getFullYear(), mm = base.getMonth();
    return new Date(yy, mm, Math.min(d, diasNoMes(yy, mm)));
  }
  const parseData = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtISO = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const chaveMes = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`;
  const somarMeses = (chave, n) => {
    const [y, m] = chave.split('-').map(Number);
    return chaveMes(new Date(y, m - 1 + n, 1));
  };
  const hoje = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const diffDias = (a, b) => Math.round((a - b) / 86400000);

  const _moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtMoeda = (v) => _moeda.format(v || 0);
  const dataCurta = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  const arred = (v) => Math.round(v * 100) / 100;

  function textoPrazo(dias) {
    if (dias < -1) return `Atrasada há ${-dias} dias`;
    if (dias === -1) return 'Venceu ontem';
    if (dias === 0) return 'Vence hoje';
    if (dias === 1) return 'Vence amanhã';
    return `Vence em ${dias} dias`;
  }

  /* ---------- Cartões e faturas ---------- */

  /* Em qual fatura cai uma compra (ou a parcela "offset" dela).
     Compras no dia do fechamento ou depois vão para a fatura seguinte.
     A fatura é identificada pelo mês do vencimento (AAAA-MM). */
  function faturaDaData(cartao, dataISO, offset = 0) {
    const d = parseData(dataISO);
    const mFech = d.getMonth() + (d.getDate() >= cartao.fechamento ? 1 : 0) + offset;
    const mVenc = mFech + (cartao.vencimento > cartao.fechamento ? 0 : 1);
    const venc = dataLocal(d.getFullYear(), mVenc, cartao.vencimento);
    return { chave: chaveMes(venc), vencimento: venc };
  }

  function vencimentoFatura(cartao, chave) {
    const [y, m] = chave.split('-').map(Number);
    return dataLocal(y, m - 1, cartao.vencimento);
  }

  function fechamentoFatura(cartao, chave) {
    const [y, m] = chave.split('-').map(Number);
    const mFech = m - 1 - (cartao.vencimento > cartao.fechamento ? 0 : 1);
    return dataLocal(y, mFech, cartao.fechamento);
  }

  /* Divide o valor total em parcelas; centavos que sobram vão na 1ª. */
  function parcelas(compra) {
    const n = Math.max(1, compra.parcelas | 0);
    const totalC = Math.round(compra.valor * 100);
    const base = Math.floor(totalC / n);
    const resto = totalC - base * n;
    return Array.from({ length: n }, (_, i) => ({ n: i + 1, total: n, valor: (base + (i === 0 ? resto : 0)) / 100 }));
  }

  function faturasDoCartao(state, cartao) {
    const mapa = {};
    for (const c of state.compras) {
      if (c.cartaoId !== cartao.id) continue;
      for (const p of parcelas(c)) {
        const f = faturaDaData(cartao, c.data, p.n - 1);
        const fat = mapa[f.chave] || (mapa[f.chave] = { chave: f.chave, vencimento: f.vencimento, itens: [], total: 0 });
        fat.itens.push({ compra: c, parcela: p });
        fat.total = arred(fat.total + p.valor);
      }
    }
    for (const f of Object.values(mapa)) f.paga = !!state.faturasPagas[cartao.id + '|' + f.chave];
    return mapa;
  }

  function fatura(state, cartao, chave) {
    return faturasDoCartao(state, cartao)[chave] || {
      chave, vencimento: vencimentoFatura(cartao, chave), itens: [], total: 0,
      paga: !!state.faturasPagas[cartao.id + '|' + chave],
    };
  }

  function statusFatura(cartao, f) {
    const h = hoje();
    if (f.paga) return 'paga';
    if (h > f.vencimento) return 'vencida';
    if (h >= fechamentoFatura(cartao, f.chave)) return 'fechada';
    return 'aberta';
  }

  /* Quanto do limite está comprometido (todas as faturas ainda não pagas, incluindo parcelas futuras). */
  function limiteUsado(state, cartao) {
    let t = 0;
    for (const f of Object.values(faturasDoCartao(state, cartao))) if (!f.paga) t += f.total;
    return arred(t);
  }

  /* ---------- Contas a pagar + faturas (tudo que tem vencimento) ---------- */

  function pendencias(state, ate) {
    const lista = [];
    const limite = ate || somarMeses(chaveMes(hoje()), 1);
    for (const conta of state.contas) {
      const pagos = conta.pagos || {};
      if (conta.recorrente) {
        let k = conta.inicio, guarda = 0;
        const fim = conta.fim && conta.fim < limite ? conta.fim : limite;
        while (k <= fim && guarda++ < 600) {
          const [y, m] = k.split('-').map(Number);
          lista.push({ tipo: 'conta', id: conta.id, chave: k, nome: conta.nome, valor: conta.valor,
            vencimento: dataLocal(y, m - 1, conta.dia), pago: !!pagos[k] });
          k = somarMeses(k, 1);
        }
      } else if (conta.data) {
        const v = parseData(conta.data), k = chaveMes(v);
        if (k <= limite) lista.push({ tipo: 'conta', id: conta.id, chave: k, nome: conta.nome, valor: conta.valor, vencimento: v, pago: !!pagos[k] });
      }
    }
    for (const cartao of state.cartoes) {
      for (const f of Object.values(faturasDoCartao(state, cartao))) {
        if (f.chave <= limite && f.total > 0) {
          lista.push({ tipo: 'fatura', id: cartao.id, chave: f.chave, nome: 'Fatura ' + cartao.nome, valor: f.total, vencimento: f.vencimento, pago: f.paga });
        }
      }
    }
    lista.sort((a, b) => a.vencimento - b.vencimento);
    return lista;
  }

  const chaveItem = (p) => `${p.tipo}|${p.id}|${p.chave}`;

  /* Itens não pagos que vencem dentro do prazo de aviso (ou já atrasados). */
  function alertas(state) {
    const h = hoje(), dias = state.config.diasAviso;
    return pendencias(state)
      .filter((p) => !p.pago && diffDias(p.vencimento, h) <= dias)
      .map((p) => Object.assign(p, { dias: diffDias(p.vencimento, h) }));
  }

  function marcarPago(state, tipo, id, chave, pago) {
    if (tipo === 'fatura') {
      const k = id + '|' + chave;
      if (pago) state.faturasPagas[k] = true; else delete state.faturasPagas[k];
    } else {
      const conta = state.contas.find((c) => c.id === id);
      if (!conta) return;
      conta.pagos = conta.pagos || {};
      if (pago) conta.pagos[chave] = true; else delete conta.pagos[chave];
    }
  }

  /* ---------- Armazenamento (IndexedDB) ---------- */

  function abrirDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('financas', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function ler(chave) {
    const db = await abrirDB();
    return new Promise((res, rej) => {
      const t = db.transaction('kv').objectStore('kv').get(chave);
      t.onsuccess = () => res(t.result);
      t.onerror = () => rej(t.error);
    });
  }
  async function gravar(chave, valor) {
    const db = await abrirDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(valor, chave);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  function normalizar(s) {
    s = s || {};
    return {
      versao: 1,
      cartoes: s.cartoes || [],
      compras: s.compras || [],
      contas: s.contas || [],
      faturasPagas: s.faturasPagas || {},
      config: Object.assign({ diasAviso: 3, notificacoes: false }, s.config),
    };
  }
  const lerEstado = async () => normalizar(await ler('state'));
  const salvarEstado = (s) => gravar('state', JSON.parse(JSON.stringify(s)));

  /* ---------- Notificações ---------- */

  async function enviarNotificacoes(reg, state) {
    if (!state.config.notificacoes) return 0;
    if (!g.Notification || g.Notification.permission !== 'granted') return 0;
    const hojeISO = fmtISO(hoje());
    const enviados = (await ler('notificados')) || {};
    const novos = {};
    let n = 0;
    for (const a of alertas(state)) {
      const k = chaveItem(a);
      novos[k] = hojeISO;
      if (enviados[k] === hojeISO) continue; // já avisou hoje
      await reg.showNotification(`${a.nome} · ${fmtMoeda(a.valor)}`, {
        body: `${textoPrazo(a.dias)} (${dataCurta(a.vencimento)})`,
        tag: k,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        data: { url: './' },
      });
      n++;
    }
    await gravar('notificados', novos);
    return n;
  }

  g.Core = {
    pad, dataLocal, parseData, fmtISO, chaveMes, somarMeses, hoje, diffDias, fmtMoeda, dataCurta, arred, textoPrazo,
    faturaDaData, vencimentoFatura, fechamentoFatura, parcelas, faturasDoCartao, fatura, statusFatura, limiteUsado,
    pendencias, chaveItem, alertas, marcarPago, lerEstado, salvarEstado, normalizar, enviarNotificacoes,
  };
})(self);
