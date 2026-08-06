export interface WacFact {
  platform: string;
  account_id: string;
  entity_type: string;
  entity_id?: string | null;
  entity_name?: string | null;
  name?: string | null;
  campaign_name?: string | null;
  objective?: string | null;
  report_date: string;
  metric: string;
  raw_value?: string | number | null;
  normalized_value?: string | number | null;
  currency?: string | null;
  timezone?: string | null;
  attribution_window?: string | null;
  conversion_definition?: string | null;
  freshness?: string | null;
  source_api_version?: string | null;
  ingested_at?: string | null;
}

export function valueUsed(fact: WacFact): string | number | null {
  return fact.normalized_value ?? fact.raw_value ?? null;
}

export function inferFunnelStage(name?: string | null): 'ToFu' | 'MoFu' | 'BoFu' | null {
  if (!name) return null;
  const value = name.toLowerCase();
  if (/\b(tofu|awareness|reach|view|cpv)\b/.test(value)) return 'ToFu';
  if (/\b(mofu|engagement|interaction|community)\b/.test(value)) return 'MoFu';
  if (/\b(bofu|lead|conversion|dealer|location|test.?drive)\b/.test(value)) return 'BoFu';
  return null;
}

export function extractFacts(payload: Record<string, unknown>): WacFact[] {
  const candidates = [payload.facts, payload.data, payload.rows, (payload.result as Record<string, unknown> | undefined)?.facts];
  const facts = candidates.find(Array.isArray);
  return Array.isArray(facts) ? facts as WacFact[] : [];
}

export function nextCursor(payload: Record<string, unknown>): string | null {
  const direct = payload.next_cursor ?? payload.nextCursor;
  if (typeof direct === 'string' && direct) return direct;
  const page = payload.pagination as Record<string, unknown> | undefined;
  return typeof page?.next_cursor === 'string' ? page.next_cursor : null;
}
