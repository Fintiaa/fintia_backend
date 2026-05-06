import { Injectable } from '@nestjs/common';
import Groq from 'groq-sdk';

const SYSTEM_PROMPT = `Eres un asistente financiero para usuarios colombianos. Tu tarea es extraer datos de transacciones financieras de mensajes en español colombiano coloquial o de imágenes de facturas/recibos.

JERGA COLOMBIANA (muy importante):
- "una luca / un lucas / luka / lukas / lucas" = $1.000 COP (mil pesos)
- "2 lukas / 5 lukas / N lukas" = N × 1.000 COP
- "un palo" = $1.000.000 COP (un millón de pesos)
- "medio palo" = $500.000 COP
- "5 mil / 20 mil / 50 mil" = 5.000 / 20.000 / 50.000 COP
- "un millón / dos millones" = 1.000.000 / 2.000.000 COP
- La moneda siempre es pesos colombianos (COP)

CATEGORÍAS DISPONIBLES:
Ingresos: salary, freelance, investment, other_income
Gastos: food, transport, housing, services, entertainment, health, education, other_expense

RESPONDE ÚNICAMENTE con un JSON válido (sin markdown, sin texto extra):
{
  "amount": número_entero_en_COP,
  "type": "income" o "expense",
  "category_id": "una_de_las_categorías",
  "description": "descripción breve y clara en español",
  "date": "YYYY-MM-DD o null si no se menciona",
  "confidence": "high", "medium" o "low",
  "message": "mensaje corto y amigable en español colombiano casual confirmando lo que entendiste (máx 1 oración)"
}`;

@Injectable()
export class AiService {
  private groq: Groq;

  constructor() {
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  async parseTransaction(text?: string, imageBase64?: string, mimeType?: string) {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY no configurada');
    if (!text && !imageBase64) throw new Error('Sin entrada');

    let responseText: string;

    if (imageBase64) {
      const completion = await this.groq.chat.completions.create({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}` } },
              { type: 'text', text: text || 'Extrae la transacción de esta factura o recibo.' },
            ] as any,
          },
        ],
        max_tokens: 512,
        temperature: 0.1,
      });
      responseText = completion.choices[0].message.content!.trim();
    } else {
      const completion = await this.groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text! },
        ],
        max_tokens: 512,
        temperature: 0.1,
      });
      responseText = completion.choices[0].message.content!.trim();
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`No encontré JSON en la respuesta`);

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.date) parsed.date = new Date().toISOString().split('T')[0];
    parsed.amount = Math.abs(Math.round(Number(parsed.amount)));

    return parsed;
  }

  async generateInsights(transactions: any[], stats: any) {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY no configurada');

    const totalIncome = stats?.income ?? 0;
    const totalExpenses = stats?.expenses ?? 0;
    const balance = stats?.balance ?? 0;

    const summary = `
Ingresos del mes: $${totalIncome.toLocaleString('es-CO')} COP
Gastos del mes: $${totalExpenses.toLocaleString('es-CO')} COP
Balance: $${balance.toLocaleString('es-CO')} COP
Número de transacciones: ${transactions.length}
Top categorías por gasto: ${
      Object.entries(
        transactions
          .filter((t) => t.type === 'expense')
          .reduce((acc: Record<string, number>, t) => {
            const cat = t.category?.name || 'Otros';
            acc[cat] = (acc[cat] || 0) + Number(t.amount);
            return acc;
          }, {}),
      )
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 4)
        .map(([cat, amt]) => `${cat}: $${(amt as number).toLocaleString('es-CO')}`)
        .join(', ') || 'Sin datos'
    }
`.trim();

    const completion = await this.groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `Eres Fintia, una asistente financiera colombiana con mucho humor y personalidad.
Analiza los datos financieros del usuario y genera exactamente 4 insights en JSON.
Usa jerga colombiana casual y algo de humor (sin ser ofensiva). Sé directa y útil.
Cada insight tiene: title (máx 6 palabras), detail (1-2 oraciones con humor y consejo real), icon (1 emoji), type ("good" | "warning" | "tip" | "bad").

RESPONDE ÚNICAMENTE con un array JSON válido, sin markdown:
[{"title":"...","detail":"...","icon":"...","type":"..."}]`,
        },
        { role: 'user', content: summary },
      ],
      max_tokens: 800,
      temperature: 0.7,
    });

    const text = completion.choices[0].message.content!.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No encontré JSON en la respuesta');
    return JSON.parse(jsonMatch[0]);
  }
}
