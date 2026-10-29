import { allowNpmTypes, checkTypes, completionDetail, completions, quickInfo } from './typecheck'
import type { TypeRequest } from './typeLint'

export type TypeReply = { id: number; result?: unknown; error?: string }

// il progetto usa i tipi DOM, dove `self` è la finestra
const scope = self as unknown as { onmessage: (e: MessageEvent<TypeRequest>) => void; postMessage(reply: TypeReply): void }

function handle(r: TypeRequest) {
  allowNpmTypes(r.npm)
  switch (r.kind) {
    case 'check':
      return checkTypes(r.code, r.lang)
    case 'complete':
      return completions(r.code, r.lang, r.pos)
    case 'detail':
      return completionDetail(r.code, r.lang, r.pos, r.name)
    case 'hover':
      return quickInfo(r.code, r.lang, r.pos)
  }
}

scope.onmessage = async ({ data }) => {
  try {
    scope.postMessage({ id: data.id, result: await handle(data) })
  } catch (err) {
    scope.postMessage({ id: data.id, error: String(err) })
  }
}
