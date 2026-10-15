import { describe, expect, it } from 'vitest'
import { detectByContent } from '../detect'

const cases: Array<[string, string | null, string]> = [
  ['JSON', 'JSON', '{\n  "a": 1,\n  "b": [true, null]\n}'],
  ['HTML documento', 'HTML', '<!doctype html>\n<html><body><p>ciao</p></body></html>'],
  [
    'HTML frammento',
    'HTML',
    '<div class="card">\n  <h2 id="t">Titolo</h2>\n  <a href="/x">link</a>\n</div>',
  ],
  [
    'CSS',
    'CSS',
    '.btn {\n  color: #fff;\n  padding: 4px 8px;\n}\n\n.btn:hover {\n  background: var(--accent);\n}',
  ],
  ['CSS media query', 'CSS', '@media (max-width: 600px) {\n  .grid {\n    display: block;\n  }\n}'],
  [
    'JavaScript',
    'JavaScript',
    "const items = [1, 2, 3]\nfunction sum(list) {\n  return list.reduce((a, b) => a + b, 0)\n}\nconsole.log(sum(items))",
  ],
  [
    'JavaScript modulo',
    'JavaScript',
    "import fs from 'node:fs'\nexport async function read(p) {\n  const data = await fs.promises.readFile(p, 'utf8')\n  return JSON.parse(data)\n}",
  ],
  [
    'TypeScript',
    'TypeScript',
    "interface User {\n  id: string\n  age: number\n}\nexport function greet(u: User): string {\n  return `ciao ${u.id}`\n}",
  ],
  [
    'JSX (componente React)',
    'JSX',
    "import { useState } from 'react'\n\nexport default function Counter() {\n  const [n, setN] = useState(0)\n  return (\n    <button className=\"btn\" onClick={() => setN(n + 1)}>\n      {n}\n    </button>\n  )\n}",
  ],
  [
    'TSX (componente React tipizzato)',
    'TSX',
    "type Props = { title: string; onClose: () => void }\n\nexport function Modal({ title, onClose }: Props) {\n  return (\n    <div className=\"modal\">\n      <h2>{title}</h2>\n      <Button onClick={onClose} />\n    </div>\n  )\n}",
  ],
  [
    'oggetto JS con due punti (non CSS)',
    'JavaScript',
    "const config = {\n  port: 3000,\n  host: 'localhost',\n}\nexport default config",
  ],
  [
    'HTML con script inline resta HTML',
    'HTML',
    '<div id="app"></div>\n<script src="/main.js"></script>\n<link rel="stylesheet" href="/s.css">',
  ],
  ['testo normale', null, 'Lista della spesa:\n- latte\n- pane\n\nRicordarsi di chiamare Marco.'],
  ['vuoto', null, '   \n  '],
]

describe('detectByContent', () => {
  it.each(cases)('%s', (_name, expected, text) => {
    expect(detectByContent(text)).toBe(expected)
  })
})
