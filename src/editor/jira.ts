/**
 * Markdown ⇄ Jira wiki markup (Modifica → Trasforma). Riga per riga: titoli, grassetto, corsivo,
 * barrato, codice, link, immagini, elenchi annidati, citazioni, avvisi, tabelle, righe orizzontali.
 * Quello che non ha un equivalente prende la cosa più vicina (HTML semplice, citazioni) o resta com'è:
 * mai testo perso in silenzio.
 * shortcut: le macro Jira dentro altre macro e l'HTML a blocchi restano come sono; se servono, un parser vero.
 */
/* eslint-disable no-control-regex -- \u0000 e \u0001 sono segnaposto voluti, non compaiono nel testo */

/** Toglie dal testo i pezzi già convertiti, così le regole dopo non li toccano. */
function protector() {
  const saved: string[] = []
  return {
    hide: (s: string) => `\u0000${saved.push(s) - 1}\u0000`,
    show: (s: string) => s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => saved[+i]),
  }
}

/** Avvisi GitHub (`> [!NOTE]`) ⇄ macro Jira, nei due versi. */
const ALERT_TO_JIRA: Record<string, string> = { NOTE: 'info', TIP: 'tip', IMPORTANT: 'note', WARNING: 'warning', CAUTION: 'warning' }
const JIRA_TO_ALERT: Record<string, string> = { info: 'NOTE', tip: 'TIP', note: 'IMPORTANT', warning: 'WARNING' }
const JIRA_SPECIAL = '*_-+^~{}[]|!?#'

function inlineToJira(s: string): string {
  const p = protector()
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!|~<>^?])/g, (_m, c: string) => p.hide(JIRA_SPECIAL.includes(c) ? `\\${c}` : c))
  s = s.replace(/`([^`]+)`/g, (_m, c: string) => p.hide(`{{${c}}}`))
  s = s.replace(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g, (_m, u: string) => p.hide(`!${u}!`))
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_m, t: string, u: string) => p.hide(`[${inlineToJira(t)}|${u}]`))
  s = s.replace(/<((?:https?|mailto|ftp):[^>\s]+)>/g, (_m, u: string) => p.hide(`[${u}]`))
  s = s.replace(/\[\^([^\]\s]+)\]/g, (_m, id: string) => p.hide(`^${id}^`))
  s = s.replace(/<br\s*\/?>/gi, () => p.hide('\\\\'))
  const tags: Record<string, string> = { ins: '+', u: '+', sup: '^', sub: '~', cite: '??' }
  s = s.replace(/<(ins|u|sup|sub|cite)>(.*?)<\/\1>/gi, (_m, t: string, x: string) => {
    const mark = tags[t.toLowerCase()]
    return p.hide(mark + inlineToJira(x) + mark)
  })
  // quello che resta è testo: per Jira { apre una macro e [ un link
  s = s.replace(/[{[]/g, (c) => p.hide(`\\${c}`))
  s = s.replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '\u0001$2\u0001')
  s = s.replace(/(?<![\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])/g, '_$1_')
  s = s.replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '-$1-')
  return p.show(s.replace(/\u0001/g, '*'))
}

function inlineToMd(s: string) {
  const p = protector()
  s = s.replace(/\{\{(.+?)\}\}/g, (_m, c: string) => p.hide(`\`${c}\``))
  s = s.replace(/\\\\/g, () => p.hide('<br>'))
  s = s.replace(/\\[{}[\]]/g, (c) => p.hide(c))
  s = s.replace(/\{color(?::[^}]*)?\}/g, '')
  s = s.replace(/!([^\s!|]+)(?:\|[^!]*)?!/g, (_m, u: string) => p.hide(`![](${u})`))
  s = s.replace(/\[~([^\]\s]+)\]/g, (_m, u: string) => p.hide(`@${u}`))
  s = s.replace(/\[\^([^\]]+)\]/g, (_m, f: string) => p.hide(f))
  s = s.replace(/\[([^|\]]+)\|([^\]\s]+)\]/g, (_m, t: string, u: string) => `[${t}](${p.hide(u)})`)
  s = s.replace(/\[((?:https?|mailto|ftp):[^\]\s]+)\]/g, (_m, u: string) => p.hide(`<${u}>`))
  s = s.replace(/\?\?(?=\S)(.+?)(?<=\S)\?\?/g, '<cite>$1</cite>')
  s = s.replace(/\^([^\s^]+)\^/g, '<sup>$1</sup>')
  s = s.replace(/(?<!~)~([^\s~]+)~(?!~)/g, '<sub>$1</sub>')
  s = s.replace(/(?<![\w+])\+(?=\S)(.+?)(?<=\S)\+(?![\w+])/g, '<ins>$1</ins>')
  s = s.replace(/(?<![\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])/g, '\u0001$1\u0001')
  s = s.replace(/(?<![\w-])-(?=\S)(.+?)(?<=\S)-(?![\w-])/g, '~~$1~~')
  return p.show(s.replace(/\u0001/g, '**'))
}

const cells = (row: string) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
const MD_TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

export function mdToJira(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  let fence = ''
  let list: { indent: number; ch: string }[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (fence) {
      if (line.trim().startsWith(fence)) {
        out.push('{code}')
        fence = ''
      } else out.push(line)
      continue
    }
    let m = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)/.exec(line)
    if (m) {
      fence = m[1]
      out.push(m[2] ? `{code:${m[2]}}` : '{code}')
      continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push('----')
      list = []
      continue
    }
    if ((m = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/.exec(line))) {
      const indent = m[1].replace(/\t/g, '    ').length
      while (list.length && list[list.length - 1].indent > indent) list.pop()
      const ch = /\d/.test(m[2]) ? '#' : '*'
      if (!list.length || list[list.length - 1].indent < indent) list.push({ indent, ch })
      else list[list.length - 1].ch = ch
      const box = m[3] ? (m[3] === ' ' ? '☐ ' : '☑ ') : ''
      out.push(`${list.map((l) => l.ch).join('')} ${box}${inlineToJira(m[4])}`)
      continue
    }
    if (line.trim()) list = []
    if (/^\s*>/.test(line)) {
      const body: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''))
      i--
      const alert = /^\[!(\w+)\]\s*$/.exec(body[0])
      const macro = alert && ALERT_TO_JIRA[alert[1].toUpperCase()]
      if (macro) out.push(`{${macro}}`, mdToJira(body.slice(1).join('\n')), `{${macro}}`)
      else if (body.length === 1) out.push(`bq. ${inlineToJira(body[0])}`)
      else out.push('{quote}', mdToJira(body.join('\n')), '{quote}')
      continue
    }
    if ((m = /^\[\^([^\]\s]+)\]:\s*(.*)$/.exec(line))) out.push(`^${m[1]}^ ${inlineToJira(m[2])}`)
    else if ((m = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(line))) out.push(`h${m[1].length}. ${inlineToJira(m[2])}`)
    else if (/^\s*\|/.test(line) && !MD_TABLE_SEP.test(line)) {
      const header = MD_TABLE_SEP.test(lines[i + 1] ?? '') && lines[i + 1].includes('-')
      const row = cells(line).map(inlineToJira)
      out.push(header ? `||${row.join('||')}||` : `|${row.join('|')}|`)
    } else if (/^\s*\|/.test(line)) continue
    else out.push(inlineToJira(line))
  }
  return out.join('\n')
}

export function jiraToMd(text: string) {
  const lines = text.split('\n')
  const out: string[] = []
  let block = '' // '{code}' o '{noformat}' aperto
  let quote = '' // macro a citazione aperta: quote, panel, info…
  let inTable = false
  for (const line of lines) {
    const pre = quote ? '> ' : ''
    if (block) {
      const end = line.indexOf(block)
      if (end < 0) {
        out.push(pre + line)
        continue
      }
      if (line.slice(0, end).trim()) out.push(pre + line.slice(0, end))
      out.push(pre + '```')
      block = ''
      continue
    }
    let m = /^\s*\{(code|noformat)(?::([^}]*))?\}(.*)$/.exec(line)
    if (m) {
      block = `{${m[1]}}`
      const params = (m[2] ?? '').split('|')
      const lang = params.find((x) => !x.includes('=')) ?? params.find((x) => x.startsWith('language='))?.slice(9) ?? ''
      out.push(pre + '```' + (m[1] === 'code' ? lang.trim() : ''))
      if (m[3].trim()) out.push(pre + m[3])
      continue
    }
    if ((m = /^\s*\{(quote|panel|info|note|warning|tip)(?::([^}]*))?\}\s*$/.exec(line))) {
      if (quote === m[1]) quote = ''
      else if (!quote) {
        quote = m[1]
        if (JIRA_TO_ALERT[quote]) out.push(`> [!${JIRA_TO_ALERT[quote]}]`)
        const title = /(?:^|\|)title=([^|]*)/.exec(m[2] ?? '')
        if (title) out.push(`> **${title[1].trim()}**`)
      } else out.push(pre + line)
      continue
    }
    const isRow = /^\s*\|/.test(line)
    if (!isRow) inTable = false
    if ((m = /^h([1-6])\.\s+(.*)$/.exec(line))) out.push(`${pre}${'#'.repeat(+m[1])} ${inlineToMd(m[2])}`)
    else if ((m = /^bq\.\s+(.*)$/.exec(line))) out.push(`> ${inlineToMd(m[1])}`)
    else if (/^\s*-{4,}\s*$/.test(line)) out.push(pre + '---')
    else if ((m = /^\s*([*#-]+)\s+(.*)$/.exec(line))) {
      let indent = ''
      for (const ch of m[1].slice(0, -1)) indent += ch === '#' ? '   ' : '  '
      out.push(`${pre}${indent}${m[1].endsWith('#') ? '1.' : '-'} ${inlineToMd(m[2])}`)
    } else if (isRow) {
      const row = inlineToMd(line).trim()
      const header = row.startsWith('||')
      const parts = header ? row.replace(/^\|\||\|\|$/g, '').split('||').map((c) => c.trim()) : cells(row)
      // il Markdown vuole un'intestazione: se Jira non ce l'ha, ne va una vuota
      const line_ = `${pre}| ${parts.join(' | ')} |`
      const sep = `${pre}|${' --- |'.repeat(parts.length)}`
      if (inTable) out.push(line_)
      else if (header) out.push(line_, sep)
      else out.push(`${pre}|${'  |'.repeat(parts.length)}`, sep, line_)
      inTable = true
    } else out.push(pre + inlineToMd(line))
  }
  if (block) out.push((quote ? '> ' : '') + '```')
  return out.join('\n')
}
