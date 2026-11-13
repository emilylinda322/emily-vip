// ============================================================================
// PERSISTÊNCIA DE DADOS E MÍDIAS NO GITHUB (COMPATÍVEL COM VERCEL SERVERLESS)
// ============================================================================

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || 'data';

const API_BASE = `https://api.github.com/repos/${REPO}/contents`;
const HEADERS = {
  'Authorization': `Bearer ${TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'vip-elegante-vercel',
  'Content-Type': 'application/json'
};

// Na Vercel, apenas /tmp permite escrita local quando GITHUB_TOKEN não está definido
const TMP_DIR = process.env.DATA_DIR || '/tmp';
const LOCAL_DB = path.join(TMP_DIR, 'vip_db.json');
const LOCAL_UPLOADS = path.join(TMP_DIR, 'vip_uploads');

let contentSha = null;

exports.load = async (defaultData) => {
  if (!(TOKEN && REPO)) {
    if (fs.existsSync(LOCAL_DB)) {
      return { ...defaultData, ...JSON.parse(fs.readFileSync(LOCAL_DB, 'utf8')) };
    }
    return JSON.parse(JSON.stringify(defaultData));
  }

  const res = await fetch(`${API_BASE}/content.json?ref=${encodeURIComponent(BRANCH)}`, {
    headers: HEADERS,
    cache: 'no-store'
  });
  if (res.status === 404) return JSON.parse(JSON.stringify(defaultData));
  if (!res.ok) throw new Error(`Erro ao ler GitHub (${res.status}): ${await res.text()}`);

  const json = await res.json();
  contentSha = json.sha;
  const decoded = Buffer.from(json.content, 'base64').toString('utf8');
  return { ...defaultData, ...JSON.parse(decoded) };
};

exports.save = async (db) => {
  const serialized = JSON.stringify(db, null, 2);

  if (!(TOKEN && REPO)) {
    fs.writeFileSync(LOCAL_DB, serialized, 'utf8');
    return;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    if (!contentSha) {
      const check = await fetch(`${API_BASE}/content.json?ref=${encodeURIComponent(BRANCH)}`, { headers: HEADERS });
      if (check.ok) contentSha = (await check.json()).sha;
    }

    const res = await fetch(`${API_BASE}/content.json`, {
      method: 'PUT',
      headers: HEADERS,
      body: JSON.stringify({
        message: 'Atualiza configurações e galeria VIP',
        branch: BRANCH,
        sha: contentSha || undefined,
        content: Buffer.from(serialized, 'utf8').toString('base64')
      })
    });

    if (res.ok) {
      const data = await res.json();
      contentSha = data.content.sha;
      return;
    }

    if (res.status === 409) {
      contentSha = null;
    } else {
      throw new Error(`Erro ao salvar no GitHub (${res.status}): ${await res.text()}`);
    }
  }
};

exports.saveUpload = async (filename, buffer) => {
  if (!(TOKEN && REPO)) {
    fs.mkdirSync(LOCAL_UPLOADS, { recursive: true });
    fs.writeFileSync(path.join(LOCAL_UPLOADS, filename), buffer);
    return `/uploads/${filename}`;
  }

  const res = await fetch(`${API_BASE}/uploads/${encodeURIComponent(filename)}`, {
    method: 'PUT',
    headers: HEADERS,
    body: JSON.stringify({
      message: `Upload de mídia VIP: ${filename}`,
      branch: BRANCH,
      content: buffer.toString('base64')
    })
  });

  if (!res.ok) {
    throw new Error(`Falha ao enviar mídia para o GitHub (${res.status}): ${await res.text()}`);
  }

  return `/uploads/${filename}`;
};

exports.readUpload = async (filename) => {
  const safeName = path.basename(filename);

  if (!(TOKEN && REPO)) {
    const filePath = path.join(LOCAL_UPLOADS, safeName);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath);
  }

  const res = await fetch(`${API_BASE}/uploads/${encodeURIComponent(safeName)}?ref=${encodeURIComponent(BRANCH)}`, {
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Accept': 'application/vnd.github.raw+json',
      'User-Agent': 'vip-elegante-vercel'
    }
  });

  if (!res.ok) return null;
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
};
