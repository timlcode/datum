// Optional facts source. Off unless DATUM_FACTS_URL is set.
// A facts service accepts POST { projectName, instruction } and returns
// { ok, items: [{ date?, summary, source? }], errors?: string[] }.
// Datum never ships a default endpoint.

export interface FactItem {
  date?: string;
  summary: string;
  source?: string;
}

export interface FactPacket {
  ok: boolean;
  items: FactItem[];
  errors: string[];
}

const WANTS_FACTS =
  /\b(verify|verifying|cross[-\s]?check|from email|meeting minutes|submittal|submitted|submission|permit status|actuals?|live dates?|confirm the date|sent items|review comments?)\b/i;

export function instructionWantsFacts(instruction: string): boolean {
  return WANTS_FACTS.test(instruction);
}

export function factsConfigured(): boolean {
  return Boolean(process.env.DATUM_FACTS_URL?.trim());
}

function asItem(raw: unknown): FactItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const summary = String(r.summary ?? r.text ?? r.note ?? '').trim();
  if (!summary) return null;
  const date = typeof r.date === 'string' ? r.date.slice(0, 10) : undefined;
  const source = typeof r.source === 'string' ? r.source : undefined;
  return { date, summary, source };
}

export async function gatherFacts(opts: { projectName: string; instruction: string }): Promise<FactPacket> {
  const url = process.env.DATUM_FACTS_URL?.trim();
  if (!url) return { ok: false, items: [], errors: ['No facts source is configured.'] };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20_000);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.DATUM_FACTS_TOKEN) headers.Authorization = `Bearer ${process.env.DATUM_FACTS_TOKEN}`;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectName: opts.projectName, instruction: opts.instruction }),
      signal: ac.signal,
    });
    if (!res.ok) return { ok: false, items: [], errors: [`Facts source returned HTTP ${res.status}.`] };
    const body = (await res.json()) as { ok?: boolean; items?: unknown; facts?: unknown; errors?: unknown };
    const list = Array.isArray(body.items) ? body.items : Array.isArray(body.facts) ? body.facts : [];
    const items = list.map(asItem).filter((x): x is FactItem => !!x);
    const errors = Array.isArray(body.errors) ? body.errors.map((e) => String(e)) : [];
    return { ok: body.ok !== false && errors.length === 0, items, errors };
  } catch (err) {
    const e = err as Error;
    return { ok: false, items: [], errors: [e.name === 'AbortError' ? 'Facts source timed out.' : e.message] };
  } finally {
    clearTimeout(timer);
  }
}

export function formatFacts(packet: FactPacket): string {
  const lines = [
    'EXTERNAL FACTS — supplied by the optional facts source configured on this machine. Treat listed items as the source of truth for live dates. Do not invent dates, email, or meeting minutes that are not listed here.',
  ];
  if (!packet.ok) lines.push(`Facts source note: ${packet.errors.join('; ') || 'incomplete'}`);
  if (!packet.items.length) lines.push('No fact items were returned.');
  packet.items.forEach((item, i) => {
    lines.push(`${i + 1}. ${item.date ? item.date + ' — ' : ''}${item.summary}${item.source ? ` (source: ${item.source})` : ''}`);
  });
  return lines.join('\n');
}

export const NO_FACTS_NOTE =
  'EXTERNAL FACTS: none. No facts source is configured on this install. Do not invent dates from email or meeting minutes. Work only from the schedule and the instruction, and say so in the explanation if the user asked for a live check.';
