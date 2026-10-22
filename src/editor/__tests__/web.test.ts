// @vitest-environment happy-dom
import { javascript } from '@codemirror/lang-javascript'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { expandAbbreviation } from '@emmetio/codemirror6-plugin'
import { describe, expect, it } from 'vitest'
import { webExtensions } from '../web'

describe('Emmet', () => {
  it.each(['JSX', 'TSX'])('in %s chiude i tag vuoti e usa className', async (lang) => {
    const doc = 'p.a>br+img'
    const state = EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [javascript({ jsx: true, typescript: lang === 'TSX' }), await webExtensions(lang)],
    })
    const view = new EditorView({ state, parent: document.body })
    expandAbbreviation(view)
    expect(view.state.doc.toString()).toBe('<p className="a"><br /><img src="" alt="" /></p>')
    view.destroy()
  })
})
