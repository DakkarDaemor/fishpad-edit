import { createStore, del, get, set } from 'idb-keyval'
import type { ChatMessage } from './providers'

export interface ChatEntry extends ChatMessage {
  /** domande: su cosa è stata fatta (tab e righe) */
  context?: string
  /** domande: il testo selezionato, per rivederlo anche quando il file è cambiato */
  quote?: string
  /** risposte: chi l'ha data */
  provider?: string
  model?: string
  time?: number
}

export interface SavedChat {
  id: string
  entries: ChatEntry[]
}

/** Riassunto di una chat per la lista, senza i messaggi. */
export interface ChatSummary {
  id: string
  title: string
  updated: number
  /** "Provider · modello" usati, in ordine di apparizione */
  models: string[]
  /** file su cui sono state fatte le domande */
  files: string[]
}

export const MAX_CHATS = 50

const unique = (list: Array<string | undefined>) => [...new Set(list.filter((x): x is string => !!x))]

export function summarize(chat: SavedChat, now = Date.now()): ChatSummary {
  const first = chat.entries.find((e) => e.role === 'user')?.content ?? ''
  const title = first.replace(/\s+/g, ' ').trim()
  return {
    id: chat.id,
    title: title.length > 80 ? `${title.slice(0, 79)}…` : title,
    updated: now,
    models: unique(chat.entries.map((e) => (e.model ? `${e.provider} · ${e.model}` : undefined))),
    // il contesto è "nome, righe 3–5": conta il file
    files: unique(chat.entries.map((e) => e.context?.replace(/, (riga|righe) .*$/, ''))),
  }
}

/** La lista aggiornata con `summary` in cima, al massimo MAX_CHATS; restituisce anche gli id da cancellare. */
export function upsert(index: ChatSummary[], summary: ChatSummary): { index: ChatSummary[]; drop: string[] } {
  const next = [summary, ...index.filter((c) => c.id !== summary.id)]
  return { index: next.slice(0, MAX_CHATS), drop: next.slice(MAX_CHATS).map((c) => c.id) }
}

// database a parte, come la cronologia dei file
const store = createStore('fishpad-chats', 'chats')
const INDEX = 'index'
const chatKey = (id: string) => `chat:${id}`

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    console.warn('[chat-history]', err)
    return fallback
  }
}

let queue: Promise<unknown> = Promise.resolve()
const serial = <T>(fn: () => Promise<T>) => {
  const next = queue.then(fn, fn)
  queue = next.catch(() => {})
  return next
}

export const listChats = () => safe(async () => (await get<ChatSummary[]>(INDEX, store)) ?? [], [] as ChatSummary[])

export const loadChat = (id: string) => safe(async () => (await get<SavedChat>(chatKey(id), store)) ?? null, null)

export function saveChat(chat: SavedChat) {
  return serial(() =>
    safe(async () => {
      await set(chatKey(chat.id), chat, store)
      const { index, drop } = upsert(await listChats(), summarize(chat))
      await set(INDEX, index, store)
      await Promise.all(drop.map((id) => del(chatKey(id), store)))
    }, undefined),
  )
}

export function deleteChat(id: string) {
  return serial(() =>
    safe(async () => {
      await set(INDEX, (await listChats()).filter((c) => c.id !== id), store)
      await del(chatKey(id), store)
    }, undefined),
  )
}
