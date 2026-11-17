/*
 * API pessoal: busca cartões, compras e saldos via Open Finance (Pluggy / Meu Pluggy)
 * e devolve tudo já no formato do app "Minhas Finanças".
 *
 * Segurança:
 *  - As chaves da Pluggy ficam SÓ nas variáveis de ambiente do Vercel (nunca no código/GitHub).
 *  - Toda chamada exige a senha APP_SENHA (cabeçalho Authorization: Bearer ...).
 *  - Só o endereço do app (ORIGEM_PERMITIDA) pode chamar pelo navegador (CORS).
 *  - Nada é gravado aqui: os dados passam e vão direto para o celular. Nada de dados bancários nos logs.
 *  - O Open Finance é somente leitura: esta API não consegue movimentar dinheiro.
 */
'use strict';

const crypto = require('node:crypto');

const PLUGGY = 'https://api.pluggy.ai';
const DIAS_PADRAO = 90;
const MAX_DIAS = 365;

/* ---------- utilidades ---------- */

function senhaConfere(recebida, esperada) {
  if (!recebida || !esperada) return false;
  const a = crypto.createHash('sha256').update(String(recebida)).digest();
  const b = crypto.createHash('sha256').update(String(esperada)).digest();
  return crypto.timingSafeEqual(a, b);
}

// Datas no horário de Brasília (UTC-3, sem horário de verão desde 2019).
// Datas que chegam exatamente à meia-noite UTC são "só data" e ficam como estão.
const brasilia = (d) => {
  const t = new Date(d);
  return t.getUTCHours() === 0 && t.getUTCMinutes() === 0 && t.getUTCSeconds() === 0 ? t : new Date(t.getTime() - 3 * 3600e3);
};
const isoDia = (d) => brasilia(d).toISOString().slice(0, 10);
const diaDoMes = (d) => (d ? brasilia(d).getUTCDate() : null);
const arred = (v) => Math.round(v * 100) / 100;
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* Tira marcações de parcela da descrição ("LOJA X PARC 02/10" -> "LOJA X"). */
const descricaoBase = (s) => String(s || '')
  .replace(/\s*(parc(ela)?\.?\s*)?\d{1,2}\s*\/\s*\d{1,2}\s*$/i, '')
  .replace(/\s+/g, ' ')
  .trim();

const CATEGORIAS = [
  [/supermarket|grocer|mercado/, 'Mercado'],
  [/gas station|fuel|combust|posto/, 'Combustível'],
  [/eating|restaurant|food|delivery|aliment|restaurante/, 'Alimentação'],
  [/transport|taxi|ride|uber|parking|toll|estaciona|pedagio/, 'Transporte'],
  [/health|pharma|drug|hospital|doctor|dentist|saude|farmacia/, 'Saúde'],
  [/education|school|course|book|educa/, 'Educação'],
  [/streaming|subscription|digital service|software|assinatura/, 'Assinaturas'],
  [/travel|airline|hotel|lodging|accommodation|viagem/, 'Viagem'],
  [/housing|rent|utilities|electric|water|internet|telecom|moradia|aluguel/, 'Moradia'],
  [/leisure|entertainment|culture|sport|gym|lazer/, 'Lazer'],
  [/shopping|clothing|electronics|department|compras|vestu/, 'Compras'],
  [/service|servi/, 'Serviços'],
];
function categoria(cat) {
  const c = semAcento(cat);
  for (const [re, nome] of CATEGORIAS) if (re.test(c)) return nome;
  return 'Outros';
}

/* ---------- Pluggy ---------- */

async function pluggy(caminho, apiKey, opcoes = {}) {
  const r = await fetch(PLUGGY + caminho, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'X-API-KEY': apiKey } : {}), ...(opcoes.headers || {}) },
  });
  if (!r.ok) {
    const erro = new Error(`Pluggy ${r.status} em ${caminho.split('?')[0]}`);
    erro.status = r.status;
    throw erro;
  }
  return r.json();
}

async function autenticar() {
  const { apiKey } = await pluggy('/auth', null, {
    method: 'POST',
    body: JSON.stringify({ clientId: process.env.PLUGGY_CLIENT_ID, clientSecret: process.env.PLUGGY_CLIENT_SECRET }),
  });
  return apiKey;
}

/* Busca todas as transações de uma conta no período (API v2 com cursor; cai para a v1 se precisar). */
async function transacoes(apiKey, accountId, de, ate) {
  const base = `accountId=${encodeURIComponent(accountId)}&dateFrom=${de}&dateTo=${ate}`;
  try {
    const todas = [];
    let qs = base;
    for (let i = 0; i < 50; i++) {
      const r = await pluggy(`/v2/transactions?${qs}`, apiKey);
      todas.push(...(r.results || []));
      if (!r.next) break;
      qs = String(r.next).replace(/^\?/, '');
      if (!/dateFrom=/.test(qs)) qs += `&dateFrom=${de}&dateTo=${ate}`;
    }
    return todas;
  } catch (e) {
    if (![400, 404, 405, 410].includes(e.status)) throw e;
  }
  const todas = [];
  for (let page = 1; page <= 50; page++) {
    const r = await pluggy(`/transactions?accountId=${encodeURIComponent(accountId)}&from=${de}&to=${ate}&pageSize=500&page=${page}`, apiKey);
    todas.push(...(r.results || []));
    if (!r.totalPages || page >= r.totalPages) break;
  }
  return todas;
}

/* Converte as transações de um cartão em compras do app (parcelas agrupadas numa compra só). */
function comprasDoCartao(cartaoId, lista) {
  const porChave = new Map();
  for (const t of lista) {
    const ehCompra = t.type ? t.type === 'DEBIT' : t.amount > 0;
    if (!ehCompra || !t.amount) continue; // ignora pagamentos de fatura e estornos
    const meta = t.creditCardMetadata || {};
    const total = Number(meta.totalInstallments) || 1;
    const descricao = descricaoBase(t.merchant?.name || t.description || t.descriptionRaw) || 'Compra';
    if (total > 1) {
      const dataCompra = isoDia(meta.purchaseDate || t.date);
      const valorTotal = arred(Number(meta.totalAmount) || Math.abs(t.amount) * total);
      const chave = `${cartaoId}|${dataCompra}|${total}|${semAcento(descricao)}|${valorTotal}`;
      if (!porChave.has(chave)) {
        porChave.set(chave, {
          externoId: 'p:' + crypto.createHash('sha1').update(chave).digest('hex').slice(0, 16),
          cartaoExternoId: cartaoId, descricao, valor: valorTotal, data: dataCompra, parcelas: total, categoria: categoria(t.category),
        });
      }
    } else {
      porChave.set(t.id, {
        externoId: t.id, cartaoExternoId: cartaoId, descricao, valor: arred(Math.abs(t.amount)),
        data: isoDia(t.date), parcelas: 1, categoria: categoria(t.category), pendente: t.status === 'PENDING',
      });
    }
  }
  return [...porChave.values()];
}

async function lerConexao(apiKey, itemId, de, ate) {
  const saida = { cartoes: [], compras: [], contasBancarias: [], avisos: [] };
  let item = null;
  try { item = await pluggy(`/items/${encodeURIComponent(itemId)}`, apiKey); } catch (e) { /* opcional */ }
  if (item && ['LOGIN_ERROR', 'OUTDATED', 'WAITING_USER_INPUT', 'WAITING_USER_ACTION'].includes(item.status)) {
    saida.avisos.push(`A conexão "${item.connector?.name || itemId}" precisa ser renovada no Meu Pluggy (status: ${item.status}).`);
  }
  const contas = (await pluggy(`/accounts?itemId=${encodeURIComponent(itemId)}`, apiKey)).results || [];
  for (const c of contas) {
    const nome = c.marketingName || c.name || 'Conta';
    if (c.type === 'CREDIT') {
      const cd = c.creditData || {};
      saida.cartoes.push({
        externoId: c.id,
        nome,
        limite: cd.creditLimit != null ? arred(cd.creditLimit) : null,
        disponivel: cd.availableCreditLimit != null ? arred(cd.availableCreditLimit) : null,
        fechamento: diaDoMes(cd.balanceCloseDate),
        vencimento: diaDoMes(cd.balanceDueDate),
        faturaAtual: c.balance != null ? arred(c.balance) : null,
      });
      saida.compras.push(...comprasDoCartao(c.id, await transacoes(apiKey, c.id, de, ate)));
    } else {
      saida.contasBancarias.push({ externoId: c.id, nome, saldo: arred(c.balance || 0) });
    }
  }
  return saida;
}

/* ---------- handler (Vercel) ---------- */

module.exports = async function handler(req, res) {
  const origem = process.env.ORIGEM_PERMITIDA || 'https://robzogno.github.io';
  res.setHeader('Access-Control-Allow-Origin', origem);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST' });

  const faltando = ['PLUGGY_CLIENT_ID', 'PLUGGY_CLIENT_SECRET', 'PLUGGY_ITEM_IDS', 'APP_SENHA'].filter((k) => !process.env[k]);
  if (faltando.length) return res.status(500).json({ erro: `Configuração incompleta no Vercel. Faltam: ${faltando.join(', ')}` });

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!senhaConfere(token, process.env.APP_SENHA)) {
    await new Promise((r) => setTimeout(r, 800)); // atrasa tentativas de adivinhar a senha
    return res.status(401).json({ erro: 'Senha incorreta' });
  }

  let corpo = req.body || {};
  if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo); } catch { corpo = {}; } }
  const hoje = new Date();
  const minimo = new Date(hoje.getTime() - MAX_DIAS * 864e5);
  let inicio = corpo.desde ? new Date(corpo.desde) : new Date(hoje.getTime() - DIAS_PADRAO * 864e5);
  if (isNaN(inicio) || inicio < minimo) inicio = minimo;
  const de = isoDia(inicio), ate = isoDia(hoje.getTime() + 864e5);

  try {
    const apiKey = await autenticar();
    const itens = process.env.PLUGGY_ITEM_IDS.split(',').map((s) => s.trim()).filter(Boolean);
    const resultado = { atualizadoEm: hoje.toISOString(), periodo: { de, ate }, cartoes: [], compras: [], contasBancarias: [], avisos: [] };
    const partes = await Promise.allSettled(itens.map((id) => lerConexao(apiKey, id, de, ate)));
    partes.forEach((p, i) => {
      if (p.status === 'fulfilled') {
        for (const k of ['cartoes', 'compras', 'contasBancarias', 'avisos']) resultado[k].push(...p.value[k]);
      } else {
        resultado.avisos.push(`Não consegui ler a conexão ${i + 1} (${p.reason.status || 'erro'}). Confira o Item ID e se ela está ativa no Meu Pluggy.`);
      }
    });
    return res.status(200).json(resultado);
  } catch (e) {
    // Só o código do erro vai para o log — nunca dados bancários.
    console.error('falha na sincronização:', e.status || e.message);
    const msg = e.status === 401 || e.status === 403
      ? 'A Pluggy recusou o Client ID/Secret. Confira as variáveis no Vercel.'
      : 'Falha ao falar com a Pluggy. Tente de novo em alguns minutos.';
    return res.status(502).json({ erro: msg });
  }
};

module.exports._interno = { comprasDoCartao, categoria, descricaoBase, senhaConfere };
