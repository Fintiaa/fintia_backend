// Regex-based email parser for Colombian bank transaction notifications

const AMOUNT_PATTERNS = [
  /\$\s?([\d.,]+)/,
  /COP\s?([\d.,]+)/i,
  /monto[:\s]+([\d.,]+)/i,
  /por\s+\$?\s?([\d.,]+)/i,
  /valor[:\s]+\$?\s?([\d.,]+)/i,
  /total[:\s]+\$?\s?([\d.,]+)/i,
];

const PROMO_KEYWORDS = [
  /oferta/i, /ofertas/i, /pre[-\s]?aprobado/i, /preaprobada/i,
  /cupo disponible/i, /aumento de cupo/i, /tarjeta de cr[eé]dito aprobada/i,
  /cr[eé]dito preaprobado/i, /libranza/i, /libre inversi[oó]n/i,
  /tasa preferencial/i, /promoci[oó]n/i, /promocional/i,
  /newsletter/i, /bolet[ií]n/i, /estado de cuenta/i, /extracto/i,
  /te invitamos/i, /aprovecha/i, /descuento especial/i,
  /solicita ya/i, /solicítalo/i, /solicitalo/i,
];

const TRANSACTION_KEYWORDS = [
  /compra/i, /pago/i, /retiro/i, /cargo/i, /cobro/i, /débito/i, /debito/i,
  /transferencia/i, /enviaste/i, /recibiste/i, /abono/i, /dep[oó]sito/i,
  /consignaci[oó]n/i, /transfiya/i, /pse/i, /nequi/i, /realizaste/i,
  /movimiento/i, /transacci[oó]n/i,
];

const EXPENSE_KEYWORDS = [
  /compra/i, /pago/i, /retiro/i, /cargo/i, /cobro/i,
  /transferencia enviada/i, /enviaste/i, /débito/i, /debito/i,
  /comisión/i, /comision/i, /pse/i, /transfiya enviada/i,
  /realizaste una compra/i,
];

const INCOME_KEYWORDS = [
  /depósito/i, /deposito/i, /abono/i, /transferencia recibida/i,
  /recibiste/i, /crédito/i, /credito/i, /nómina/i, /nomina/i,
  /transfiya recibida/i, /ingreso/i, /consignaci[oó]n/i,
];

const DATE_PATTERNS = [
  /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/,
  /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/,
  /(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i,
];

const MONTH_NAMES: Record<string, string> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04',
  mayo: '05', junio: '06', julio: '07', agosto: '08',
  septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
};

const BANK_PATTERNS = [
  { pattern: /bancolombia/i, name: 'Bancolombia' },
  { pattern: /davivienda/i, name: 'Davivienda' },
  { pattern: /bbva/i, name: 'BBVA Colombia' },
  { pattern: /banco\s*de\s*bogot[aá]/i, name: 'Banco de Bogotá' },
  { pattern: /nequi/i, name: 'Nequi' },
  { pattern: /daviplata/i, name: 'Daviplata' },
  { pattern: /scotiabank|colpatria/i, name: 'Scotiabank Colpatria' },
  { pattern: /banco\s*popular/i, name: 'Banco Popular' },
  { pattern: /nu\s*bank|nubank/i, name: 'Nu Bank' },
  { pattern: /lulo\s*bank|lulobank/i, name: 'Lulo Bank' },
];

const CATEGORY_RULES: [RegExp, string][] = [
  [/uber\s?eats/i, 'food'], [/didi\s?food/i, 'food'], [/rappi/i, 'food'],
  [/éxito|exito/i, 'food'], [/jumbo/i, 'food'], [/super(?:mercado)?/i, 'food'],
  [/restaur|comida|aliment/i, 'food'], [/tienda/i, 'food'],
  [/transmilenio|sitp/i, 'transport'], [/uber(?!\s?eats)/i, 'transport'],
  [/didi(?!\s?food)/i, 'transport'], [/taxi/i, 'transport'],
  [/gasolina|peaje/i, 'transport'],
  [/arriendo|hipoteca|alquiler/i, 'housing'],
  [/codensa|enel|epm|claro|movistar|tigo|une\b|internet/i, 'services'],
  [/netflix|spotify|amazon\s?prime|disney|cine/i, 'entertainment'],
  [/farmacia|drogu|cruz\s?verde|médico|hospital/i, 'health'],
  [/universidad|escuela|colegio|matr[ií]cula|curso|udemy|platzi/i, 'education'],
];

function parseAmount(text: string): number | null {
  for (const pattern of AMOUNT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      let raw = match[1];
      if (/\.\d{3}/.test(raw)) raw = raw.replace(/\./g, '').replace(/,/g, '.');
      else raw = raw.replace(/,/g, '');
      const num = parseFloat(raw);
      if (num > 0 && num < 100000000000) return num;
    }
  }
  return null;
}

function parseType(text: string): string {
  let expenseScore = EXPENSE_KEYWORDS.filter((kw) => kw.test(text)).length;
  let incomeScore = INCOME_KEYWORDS.filter((kw) => kw.test(text)).length;
  if (incomeScore > expenseScore) return 'income';
  return 'expense';
}

function parseDate(text: string, emailDate: string): string {
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      if (match[3] && match[3].length === 4 && !/^\d{4}$/.test(match[1])) {
        const day = match[1].padStart(2, '0');
        const month = MONTH_NAMES[match[2].toLowerCase()] || match[2].padStart(2, '0');
        return `${match[3]}-${month}-${day}`;
      }
      if (match[1] && match[1].length === 4) {
        return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
      }
    }
  }
  if (emailDate) {
    try {
      const d = new Date(emailDate);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    } catch { /* ignore */ }
  }
  return new Date().toISOString().split('T')[0];
}

function inferCategory(text: string, type: string): string {
  if (type === 'income') {
    if (/nómina|nomina|salario|sueldo/i.test(text)) return 'salary';
    if (/freelance/i.test(text)) return 'freelance';
    if (/inversión|inversion|rendimiento/i.test(text)) return 'investment';
    return 'other_income';
  }
  for (const [pattern, category] of CATEGORY_RULES) {
    if (pattern.test(text)) return category;
  }
  return 'other_expense';
}

function detectBank(text: string): string {
  for (const { pattern, name } of BANK_PATTERNS) {
    if (pattern.test(text)) return name;
  }
  return 'Desconocido';
}

function buildDescription(subject: string, text: string, type: string, bank: string): string {
  const nameClass = "[A-ZÁÉÍÓÚÑ0-9][\\wÁÉÍÓÚÑáéíóúñ.&'-]*(?:\\s+[A-ZÁÉÍÓÚÑ0-9][\\wÁÉÍÓÚÑáéíóúñ.&'-]*){0,8}";
  const merchantPatterns = [
    new RegExp(`Compraste\\s+(?:COP|\\$)?\\s?[\\d.,]+\\s+en\\s+(${nameClass})\\s+con\\s+tu`, 'i'),
    new RegExp(`Realizaste\\s+(?:una\\s+)?(?:compra|pago|retiro)\\s+en\\s+(${nameClass})\\s+por\\s+(?:COP|\\$)`, 'i'),
    new RegExp(`Hiciste\\s+(?:un|una)\\s+(?:pago|compra|transferencia|retiro)\\s+a\\s+(${nameClass})\\s+por\\s+(?:COP|\\$)`, 'i'),
    new RegExp(`Pagaste\\s+(?:COP|\\$)?\\s?[\\d.,]+\\s+(?:a|en)\\s+(${nameClass})\\s+(?:con|desde|el)`, 'i'),
    new RegExp(`Pago\\s+(?:realizado|exitoso)\\s+a\\s+(${nameClass})`, 'i'),
    new RegExp(`(?:Recibiste|Te\\s+(?:enviaron|transfirieron|consignaron))\\s+(?:COP|\\$)?\\s?[\\d.,]+\\s+de\\s+(${nameClass})(?:\\s+(?:con|desde|el)|\\.|,|\\n)`, 'i'),
    new RegExp(`Transferencia\\s+(?:enviada|recibida)\\s+(?:a|de)\\s+(${nameClass})(?:\\s+por|\\.|,|\\n)`, 'i'),
    new RegExp(`compra\\s+en\\s+(${nameClass})\\s+por\\s+(?:COP|\\$)`, 'i'),
    /comercio[:\s]+([^\n.]{3,60})/i,
    /establecimiento[:\s]+([^\n.]{3,60})/i,
    /concepto[:\s]+([^\n.]{3,60})/i,
    /descripci[oó]n[:\s]+([^\n.]{3,60})/i,
  ];
  for (const pattern of merchantPatterns) {
    const match = text.match(pattern);
    if (match) {
      const merchant = match[1].trim().replace(/\s+/g, ' ');
      if (merchant.length >= 3) return merchant.substring(0, 60);
    }
  }
  const bankLabel = bank && bank !== 'Desconocido' ? ` ${bank}` : '';
  return type === 'income' ? `Ingreso${bankLabel}` : `Gasto${bankLabel}`;
}

export async function parseEmailToTransaction(email: Record<string, any>) {
  const subject = email.headers?.find((h: any) => h.name === 'Subject')?.value || '';
  const from = email.headers?.find((h: any) => h.name === 'From')?.value || '';
  const emailDate = email.headers?.find((h: any) => h.name === 'Date')?.value || '';
  const fullText = `${subject} ${email.body || ''} ${email.snippet || ''}`;

  if (PROMO_KEYWORDS.some((kw) => kw.test(fullText))) {
    return { is_transaction: false, reason: 'promotional' };
  }

  if (!TRANSACTION_KEYWORDS.some((kw) => kw.test(fullText))) {
    return { is_transaction: false, reason: 'no_transaction_keyword' };
  }

  const amount = parseAmount(fullText);
  if (!amount) return { is_transaction: false, reason: 'no_amount' };

  const type = parseType(fullText);
  const date = parseDate(fullText, emailDate);
  const category_id = inferCategory(fullText, type);
  const bank = detectBank(`${from} ${fullText}`);
  const description = buildDescription(subject, fullText, type, bank);

  return { is_transaction: true, type, amount, description, date, category_id, confidence: 0.7, bank };
}
