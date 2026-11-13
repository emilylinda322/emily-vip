const express = require('express');
const crypto = require('crypto');
const path = require('path');
const pay = require('../payments');
const store = require('../store');

const SECRET = process.env.TOKEN_SECRET || 'troque-este-segredo-vip-2026';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || '';

const DEFAULT_DB = {
  settings: {
    title: 'Perfil VIP Exclusivo',
    name: 'Emily VIP',
    handle: '@emily_vip',
    bio: 'Conteúdos exclusivos, bastidores sem censura e acesso imediato após confirmação do PIX.',
    subs: '348',
    cover: '',
    avatar: '',
    accent: 'ruby',
    columns: 2,
    blur: 18,
    singlePrice: 12.90,
    contentTitle: 'Conteúdo Exclusivo',
    plansTitle: 'Escolha seu plano VIP',
    cta: 'Desbloquear Acesso VIP',
    reviewsTitle: 'Quem já entrou'
  },
  plans: [
    { id: 'p1', days: 15, price: 14.90, badge: '' },
    { id: 'p2', days: 30, price: 24.99, badge: 'MAIS ESCOLHIDO' },
    { id: 'p3', days: 90, price: 34.50, badge: 'MELHOR OFERTA' }
  ],
  media: [],
  reviews: [
    { id: 'r1', user: 'Janderson Diogo', stars: 5, text: 'Conteúdo impecável e liberação instantânea assim que o PIX caiu.' },
    { id: 'r2', user: 'Rafael Sandro', stars: 5, text: 'Qualidade absurda dos vídeos e site super discreto e rápido.' },
    { id: 'r3', user: 'Bruno C.', stars: 5, text: 'Vale cada centavo, tudo muito organizado e atualizado sempre.' }
  ]
};

let cachedDb = null;
let lastLoadAt = 0;

async function getDb(forceRefresh = false) {
  const now = Date.now();
  if (!cachedDb || forceRefresh || (now - lastLoadAt > 15000)) {
    cachedDb = await store.load(DEFAULT_DB);
    lastLoadAt = now;
  }
  return cachedDb;
}

const uid = () => crypto.randomBytes(8).toString('hex');
const signPayload = (val) => crypto.createHmac('sha256', SECRET).update(val).digest('hex').slice(0, 32);
const createToken = (scope, expiresAt) => `${scope}.${expiresAt}.${signPayload(`${scope}.${expiresAt}`)}`;
const verifyToken = (token) => {
  if (!token) return null;
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const [scope, exp, sig] = parts;
  if (sig !== signPayload(`${scope}.${exp}`)) return null;
  if (Date.now() > Number(exp)) return null;
  return scope;
};

function defaultStatsFromId(idStr) {
  let hash = 0;
  const s = String(idStr || 'vip');
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  const abs = Math.abs(hash);
  return {
    likes: 118 + (abs % 245),
    comments: 14 + (abs % 31)
  };
}

const app = express();
app.use(express.json({ limit: '4.5mb' }));

const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Erro interno no servidor' });
  });

function checkAdminAuth(req) {
  if (!ADMIN_PASS) return true;
  const headerToken = req.headers['x-admin-password'];
  if (headerToken && headerToken === ADMIN_PASS) return true;

  const auth = req.headers.authorization || '';
  if (auth.startsWith('Basic ')) {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const pass = decoded.split(':').slice(1).join(':');
    if (pass === ADMIN_PASS) return true;
  }
  return false;
}

function requireAdminPage(req, res, next) {
  if (checkAdminAuth(req)) return next();
  res.setHeader('WWW-Authenticate', 'Basic realm="Painel Exclusivo do Proprietário"');
  return res.status(401).send('Acesso restrito exclusivamente ao proprietário.');
}

function requireAdminApi(req, res, next) {
  if (checkAdminAuth(req)) return next();
  return res.status(401).json({ error: 'Senha de administrador incorreta ou não informada.' });
}

app.get('/admin', requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'admin.html'));
});

const MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4'
};

app.get('/uploads/:filename', wrap(async (req, res) => {
  const filename = path.basename(req.params.filename);
  const buffer = await store.readUpload(filename);
  if (!buffer) return res.status(404).send('Mídia não encontrada');

  const ext = path.extname(filename).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';

  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const range = req.headers.range;
  if (range && mime.startsWith('video/')) {
    const total = buffer.length;
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : total - 1;
    const chunkSize = (end - start) + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': mime
    });
    return res.end(buffer.slice(start, end + 1));
  }

  res.setHeader('Content-Length', buffer.length);
  return res.end(buffer);
}));

// Dados públicos para os visitantes (inclui curtidas e comentários em cada publicação)
app.get('/api/site', wrap(async (req, res) => {
  const db = await getDb();
  const rawTokens = String(req.headers['x-vip-token'] || req.query.token || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 60);
  const scopes = new Set(rawTokens.map(verifyToken).filter(Boolean));
  const fullUnlocked = scopes.has('all');

  const mediaList = (db.media || []).map((item) => {
    const itemUnlocked = fullUnlocked || scopes.has(`media:${item.id}`) || item.free === true;
    const fallback = defaultStatsFromId(item.id);
    return {
      id: item.id,
      kind: item.kind || 'image',
      title: item.title || '',
      url: item.url,
      likes: item.likes !== undefined && item.likes !== '' ? Number(item.likes) : fallback.likes,
      comments: item.comments !== undefined && item.comments !== '' ? Number(item.comments) : fallback.comments,
      unlocked: itemUnlocked
    };
  });

  res.json({
    settings: db.settings,
    plans: db.plans,
    reviews: db.reviews,
    media: mediaList,
    unlocked: fullUnlocked
  });
}));

app.post('/api/checkout', wrap(async (req, res) => {
  const db = await getDb();
  const { kind, id } = req.body || {};
  let amount = 0;
  let description = '';
  let scope = 'all';
  let days = 30;

  if (kind === 'media') {
    const item = db.media.find((m) => m.id === id);
    if (!item) return res.status(404).json({ error: 'Conteúdo não encontrado.' });
    amount = Number(db.settings.singlePrice || 12.90);
    description = `Post Avulso VIP - ${db.settings.name}`;
    scope = `media:${item.id}`;
    days = 365;
  } else {
    const plan = db.plans.find((p) => p.id === id) || db.plans[0];
    if (!plan) return res.status(400).json({ error: 'Nenhum plano disponível.' });
    amount = Number(plan.price);
    days = Number(plan.days || 30);
    description = `Plano ${days} dias - ${db.settings.name}`;
    scope = 'all';
  }

  const referencia = `vip_${Date.now()}_${uid().slice(0, 6)}`;
  const pix = await pay.createPix({ amount, referencia, description });

  const refTag = Buffer.from(String(pix.ref)).toString('base64url');
  const orderToken = createToken(`${scope}|${days}|${refTag}`, Date.now() + 2 * 60 * 60 * 1000);

  res.json({
    orderId: pix.ref,
    orderToken,
    copia: pix.copiaECola,
    qr: pix.qrImage
  });
}));

app.get('/api/order/:ref', wrap(async (req, res) => {
  const ref = req.params.ref;
  const pix = await pay.getPix(ref);
  const rawStatus = String(pix.status || '').toLowerCase();

  if (['paid', 'pago', 'approved', 'concluido', 'confirmed'].includes(rawStatus)) {
    const verifiedOrder = verifyToken(req.query.ot);
    const bits = verifiedOrder ? verifiedOrder.split('|') : [];
    const expectedRef = bits[2] ? Buffer.from(bits[2], 'base64url').toString() : null;
    if (bits.length !== 3 || expectedRef !== String(ref)) {
      return res.json({ status: 'pending' });
    }
    const scope = bits[0];
    const days = Number(bits[1] || 30);
    const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
    const token = createToken(scope, expiresAt);
    return res.json({ status: 'paid', token });
  }

  if (['expired', 'expirado', 'canceled', 'cancelado'].includes(rawStatus)) {
    return res.json({ status: 'expired' });
  }

  return res.json({ status: 'pending' });
}));

// ============================================================================
// ROTAS EXCLUSIVAS DO ADMINISTRADOR (/api/admin/*)
// ============================================================================

app.get('/api/admin/state', requireAdminApi, wrap(async (req, res) => {
  const db = await getDb(true);
  db.media = (db.media || []).map((item) => {
    const fallback = defaultStatsFromId(item.id);
    return {
      ...item,
      likes: item.likes !== undefined ? Number(item.likes) : fallback.likes,
      comments: item.comments !== undefined ? Number(item.comments) : fallback.comments
    };
  });
  res.json({
    db,
    gatewayConfigured: Boolean(process.env.CROWNBOT_CHAVE),
    githubConfigured: Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO)
  });
}));

app.post('/api/admin/save', requireAdminApi, wrap(async (req, res) => {
  const incoming = req.body;
  if (!incoming || !incoming.settings) {
    return res.status(400).json({ error: 'Dados inválidos.' });
  }

  const current = await getDb();
  const updated = {
    settings: { ...DEFAULT_DB.settings, ...incoming.settings },
    plans: Array.isArray(incoming.plans) ? incoming.plans : current.plans,
    media: Array.isArray(incoming.media) ? incoming.media : current.media,
    reviews: Array.isArray(incoming.reviews) ? incoming.reviews : current.reviews
  };

  await store.save(updated);
  cachedDb = updated;
  lastLoadAt = Date.now();
  res.json({ ok: true, db: updated });
}));

app.post('/api/admin/upload', requireAdminApi, wrap(async (req, res) => {
  const { filename, dataBase64 } = req.body || {};
  if (!filename || !dataBase64) {
    return res.status(400).json({ error: 'Arquivo inválido.' });
  }

  const cleanBase64 = dataBase64.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');

  if (buffer.length > 3.2 * 1024 * 1024) {
    return res.status(400).json({
      error: 'Na Vercel, o envio direto da galeria suporta até 3.2 MB por arquivo. Para vídeos maiores, hospede o .mp4 (ex: Catbox.moe) e cole o link direto!'
    });
  }

  const ext = path.extname(filename).toLowerCase() || '.bin';
  const safeFilename = `${Date.now()}_${uid()}${ext}`;
  const url = await store.saveUpload(safeFilename, buffer);

  res.json({ ok: true, url });
}));

app.get('/api/admin/sales', requireAdminApi, wrap(async (req, res) => {
  if (!process.env.CROWNBOT_CHAVE) {
    return res.json({ sales: [], warning: 'Variável CROWNBOT_CHAVE ainda não configurada na Vercel.' });
  }
  const sales = await pay.listSales();
  res.json({ sales });
}));

if (require.main === module) {
  app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html' }));
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Servidor VIP rodando na porta ${PORT}`));
}

module.exports = app;
