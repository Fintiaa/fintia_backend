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

  async transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY no configurada');

    const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : mimeType.includes('mpeg') || mimeType.includes('mp3') ? 'mp3' : 'wav';
    const file = new File([audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength) as ArrayBuffer], `audio.${ext}`, { type: mimeType });

    const transcription = await this.groq.audio.transcriptions.create({
      file,
      model: 'whisper-large-v3-turbo',
      language: 'es',
    });

    return transcription.text;
  }

  async generateInsights(transactions: any[], stats: any) {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY no configurada');

    const totalIncome = stats?.income ?? 0;
    const totalExpenses = stats?.expenses ?? 0;
    const balance = stats?.balance ?? 0;

    const expensesByCategory = Object.entries(
      transactions
        .filter((t) => t.type === 'expense')
        .reduce((acc: Record<string, number>, t) => {
          const cat = t.category?.name || t.category_id || 'Otros';
          acc[cat] = (acc[cat] || 0) + Number(t.amount);
          return acc;
        }, {}),
    )
      .sort((a, b) => (b[1] as number) - (a[1] as number));

    const topCategories = expensesByCategory
      .slice(0, 6)
      .map(([cat, amt]) => `  - ${cat}: $${(amt as number).toLocaleString('es-CO')} COP`)
      .join('\n') || '  - Sin datos';

    // Count transactions per category for frequency insight
    const freqByCategory = transactions
      .filter((t) => t.type === 'expense')
      .reduce((acc: Record<string, number>, t) => {
        const cat = t.category?.name || t.category_id || 'Otros';
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {});
    const mostFrequent = Object.entries(freqByCategory)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 3)
      .map(([cat, count]) => `${cat} (${count} veces)`)
      .join(', ') || 'Sin datos';

    const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 100) : 0;
    const avgPerTransaction = transactions.filter((t) => t.type === 'expense').length > 0
      ? Math.round(totalExpenses / transactions.filter((t) => t.type === 'expense').length)
      : 0;

    const summary = `
RESUMEN FINANCIERO DEL MES:
- Ingresos: $${totalIncome.toLocaleString('es-CO')} COP
- Gastos: $${totalExpenses.toLocaleString('es-CO')} COP
- Balance: $${balance.toLocaleString('es-CO')} COP (${balance >= 0 ? 'POSITIVO ✅' : 'NEGATIVO ❌'})
- Tasa de ahorro: ${savingsRate}%
- Total de transacciones: ${transactions.length} (${transactions.filter((t) => t.type === 'expense').length} gastos, ${transactions.filter((t) => t.type === 'income').length} ingresos)
- Gasto promedio por transacción: $${avgPerTransaction.toLocaleString('es-CO')} COP

TOP CATEGORÍAS DE GASTO (de mayor a menor):
${topCategories}

CATEGORÍAS MÁS FRECUENTES (por número de transacciones):
  ${mostFrequent}
`.trim();

    const completion = await this.groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `Eres Fintia, una asistente financiera colombiana con mucho humor y personalidad. Eres como la amiga financiera que todo el mundo quisiera tener: divertida, positiva y útil.

Genera exactamente 4 insights basados en los datos. Usa jerga colombiana casual ("parcero/a", "¡uy!", "qué chimba", "juicioso/a", etc.).

REGLAS IMPORTANTES:
- Basa los insights en PATRONES y TENDENCIAS (frecuencia, montos, categorías más usadas), no en opinar si una categoría es válida o no.
- NUNCA juzgues el estilo de vida: mascotas, entretenimiento, ropa, restaurantes, etc. son gastos completamente válidos.
- Si el usuario gastó mucho en una categoría (ej. café, ropa), dilo con humor positivo: "¡Los cafés se te pegaron este mes!" no "¿Es necesario tanto café?".
- Incluye al menos 1 insight positivo/celebración si el balance es bueno o los gastos bajaron.
- Si el balance es positivo o el ahorro es bueno, celebra con energía.
- Los tips deben ser CONCRETOS y accionables (ej. "Llevas X en [categoría] este mes, considera un presupuesto de Y").

Ejemplos de buenos insights:
- "¡Le metiste al café!" → "Llevas $180.000 en café este mes, ¡eres todo un barista! Si quieres ahorrar, trae tinto de la casa un par de días."
- "Semana juiciosa 🎉" → "Esta semana gastaste un 30% menos que la anterior. ¡Así se hace, parcero/a!"
- "Ropa al poder" → "Tu categoría de ropa fue la reina del mes con $450.000. Sin drama, pero quizás el mes que viene le das un descanso al carrito."
- "Balance positivo 💚" → "¡Cerraste el mes con más plata de la que entraste! Eso es disciplina pura, sigue así."

Cada insight: title (máx 6 palabras), detail (1-2 oraciones), icon (1 emoji relevante al tema), type ("good" | "warning" | "tip" | "bad").

RESPONDE ÚNICAMENTE con un array JSON válido, sin markdown:
[{"title":"...","detail":"...","icon":"...","type":"..."}]`,
        },
        { role: 'user', content: summary },
      ],
      max_tokens: 900,
      temperature: 0.75,
    });

    const text = completion.choices[0].message.content!.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No encontré JSON en la respuesta');
    return JSON.parse(jsonMatch[0]);
  }
}
