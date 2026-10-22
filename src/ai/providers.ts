/** Formato delle API: compatibile OpenAI (OpenRouter, Groq, Gemini, OpenAI) o Messages di Anthropic. */
export type ProviderKind = 'openai' | 'anthropic'

export interface AiProvider {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  apiKey: string
  /** modelli scelti dall'utente, mostrati nel selettore della chat */
  models: string[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiClient {
  listModels(): Promise<string[]>
  /** risposta completa (senza streaming); `signal` interrompe la richiesta */
  chat(model: string, system: string, messages: ChatMessage[], signal?: AbortSignal): Promise<string>
}

/** Provider proposti: i primi tre hanno un tier gratuito. Endpoint e modelli si cambiano dalle Impostazioni. */
export const DEFAULT_PROVIDERS: AiProvider[] = [
  { id: 'openrouter', name: 'OpenRouter', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', apiKey: '', models: [] },
  { id: 'groq', name: 'Groq', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', apiKey: '', models: [] },
  { id: 'gemini', name: 'Google Gemini', kind: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKey: '', models: [] },
  { id: 'openai', name: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: '', models: [] },
  { id: 'anthropic', name: 'Anthropic', kind: 'anthropic', baseUrl: 'https://api.anthropic.com', apiKey: '', models: ['claude-opus-5-5'] },
]

/** Provider salvati più quelli predefiniti aggiunti in versioni successive (si confrontano per id). */
export function mergeProviders(saved: AiProvider[] | undefined): AiProvider[] {
  return DEFAULT_PROVIDERS.map((d) => {
    const s = saved?.find((p) => p.id === d.id)
    return s ? { ...d, baseUrl: s.baseUrl, apiKey: s.apiKey, models: s.models } : d
  })
}

/** Provider con chiave e almeno un modello: quelli selezionabili nella chat. */
export const usableProviders = (providers: AiProvider[]) => providers.filter((p) => p.apiKey.trim() && p.models.length)

/** La chiave come va nell'header: senza spazi, virgolette o "Bearer " incollati insieme (OpenRouter li rifiuta come "header mancante"). */
export function cleanKey(key: string) {
  return key
    .trim()
    .replace(/^bearer\s+/i, '')
    .replace(/^(["'])(.*)\1$/, '$2')
    .trim()
}

export function createClient(p: AiProvider): AiClient {
  return p.kind === 'anthropic' ? anthropicClient(p) : openAiClient(p)
}

// ---------- compatibile OpenAI ----------

/** Il contenuto di una risposta può essere una stringa o un elenco di parti. */
function toText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((part) => (typeof part === 'string' ? part : (part?.text ?? ''))).join('')
  return ''
}

function openAiClient({ baseUrl, apiKey }: AiProvider): AiClient {
  const base = baseUrl.trim().replace(/\/+$/, '')
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${cleanKey(apiKey)}` }

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(base + path, { ...init, headers })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = body?.error?.message ?? body?.[0]?.error?.message ?? `HTTP ${res.status}`
      throw new Error(res.status === 401 ? `Chiave rifiutata (${msg}): controllala in Impostazioni → AI` : msg)
    }
    return body as T
  }

  return {
    async listModels() {
      const { data } = await request<{ data: Array<{ id: string }> }>('/models')
      return data.map((m) => m.id).sort()
    },
    async chat(model, system, messages, signal) {
      const body = await request<{ choices?: Array<{ message?: { content?: unknown } }> }>('/chat/completions', {
        method: 'POST',
        signal,
        body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...messages] }),
      })
      const text = toText(body.choices?.[0]?.message?.content)
      if (!text.trim()) throw new Error('Il modello ha restituito una risposta vuota. Riprova o scegli un altro modello.')
      return text
    },
  }
}

// ---------- Anthropic ----------

/** Modelli per cui, se rifiutano la richiesta, l'API la ripassa da sola a un altro modello. */
const SERVER_FALLBACK = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'])

function anthropicClient(p: AiProvider): AiClient {
  // l'SDK si scarica solo al primo uso, come i plugin di Prettier
  const sdk = () => import('@anthropic-ai/sdk').then((m) => m.default)
  const client = async () => {
    const Anthropic = await sdk()
    // la chiave è dell'utente e resta nel suo browser: è il caso d'uso previsto da questa opzione
    return new Anthropic({ apiKey: cleanKey(p.apiKey), baseURL: p.baseUrl.trim() || undefined, dangerouslyAllowBrowser: true })
  }

  /** Messaggi d'errore comprensibili per i casi più comuni. */
  async function friendly(err: unknown): Promise<never> {
    const Anthropic = await sdk()
    if (err instanceof Anthropic.AuthenticationError) throw new Error('Chiave Anthropic non valida')
    if (err instanceof Anthropic.PermissionDeniedError) throw new Error('La chiave Anthropic non ha accesso a questo modello')
    if (err instanceof Anthropic.NotFoundError) throw new Error('Modello non trovato')
    if (err instanceof Anthropic.RateLimitError) throw new Error('Troppe richieste: riprova tra poco')
    if (err instanceof Anthropic.APIError) throw new Error(err.message)
    throw err
  }

  return {
    async listModels() {
      try {
        const ids: string[] = []
        for await (const m of (await client()).models.list()) ids.push(m.id)
        return ids.sort()
      } catch (err) {
        return friendly(err)
      }
    },
    async chat(model, system, messages, signal) {
      try {
        const c = await client()
        const params = { model, max_tokens: 16000, system, messages }
        const res = SERVER_FALLBACK.has(model)
          ? await c.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, { signal })
          : await c.messages.create(params, { signal })
        if (res.stop_reason === 'refusal') throw new Error('Il modello ha rifiutato la richiesta')
        const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
        if (!text.trim()) throw new Error('Il modello ha restituito una risposta vuota')
        return text
      } catch (err) {
        return friendly(err)
      }
    },
  }
}
