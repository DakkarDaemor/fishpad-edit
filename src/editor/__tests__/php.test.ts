import { describe, expect, it } from 'vitest'
import { formatCode } from '../format'
import { phpDiagnostics } from '../phpLint'

describe('PHP', () => {
  it('codice valido: nessun errore', () => {
    expect(phpDiagnostics('<?php\necho "ciao";\n')).toEqual([])
  })

  it('segnala il punto e virgola mancante sulla riga dopo, senza doppioni', () => {
    const code = '<?php\n$a = 1\necho $a;\nfunction ( {}\n'
    const diags = phpDiagnostics(code)
    expect(diags).toHaveLength(2)
    expect(code.slice(diags[0].from, diags[0].to)).toBe('echo')
    expect(diags[0].message).toBe("syntax error, unexpected 'echo' (T_ECHO), expecting ';'")
  })

  it('formatta con Prettier', async () => {
    const { formatted } = await formatCode('<?php\nif($a){echo  1;}\n', 'PHP', 0, { tabs: false, size: 4 })
    expect(formatted).toBe('<?php\nif ($a) {\n    echo 1;\n}\n')
  })
})
