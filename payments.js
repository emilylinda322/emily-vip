// ============================================================================
// INTEGRAÇÃO DE PAGAMENTO PIX (CROWNBOT API)
// Documentação: https://www.crownbot.com.br/docs/api
// Variável de ambiente necessária na Vercel: CROWNBOT_CHAVE
// ============================================================================

const BASE_URL = process.env.PIX_API_URL || 'https://www.crownbot.com.br/api/v1';
const API_KEY = process.env.CROWNBOT_CHAVE;

async function requestGateway(endpoint, method = 'GET', body = null, idempotencyKey = null) {
  if (!API_KEY) {
    throw new Error('API de pagamento não configurada: adicione CROWNBOT_CHAVE nas Environment Variables da Vercel.');
  }

  const headers = {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = data.mensagem || data.message || data.error || `Erro HTTP ${response.status}`;
    throw new Error(`Gateway PIX: ${msg}`);
  }
  return data;
}

exports.createPix = async ({ amount, referencia, description }) => {
  const payload = {
    valor_centavos: Math.round(Number(amount) * 100),
    descricao: String(description || 'Acesso VIP Exclusivo').slice(0, 60),
    referencia,
    validade_minutos: 30
  };

  const result = await requestGateway('/pix', 'POST', payload, `pix-${referencia}`);
  const pix = result.pix || result;

  return {
    ref: pix.ref || pix.id || referencia,
    copiaECola: pix.copia_e_cola || pix.qr_code_text || '',
    qrImage: pix.qr_code || pix.qr_code_base64 || ''
  };
};

exports.getPix = async (ref) => {
  const result = await requestGateway(`/pix/${encodeURIComponent(ref)}`, 'GET');
  return result.pix || result;
};

exports.listSales = async () => {
  const result = await requestGateway('/vendas?origem=api&limite=30', 'GET');
  return result.dados || result.data || [];
};
