// Kitroid code (exchange) tests.  node scripts/test-exchange.mts
import { encodeKx, decodeKx, rxQty, matchScore, normName, type RxPayload } from '../src/core/exchange/codec.ts'

let failures = 0
function check(label: string, cond: boolean, extra?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra !== undefined ? '  → ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}

const rx: RxPayload = {
  v: 1, id: '01JX0000000000000000000000', code: 'P-0042', date: '2026-11-17', clinic: 'Clinic Sok', doctor: 'Dr Sok',
  items: [
    { n: 'Amoxicillin 500 mg', d: '1 capsule', t: 3, days: 5, u: 'capsule', note: 'after food' },
    { n: 'Paracetamol 500mg', d: '1 tablet', t: 3, days: 3, q: 10 },
    { n: 'ថ្នាំក្អក', d: '5 ml', t: 3, days: 5, q: 1, u: 'bottle' },
  ],
}
const code = encodeKx('rx', rx)
check('code starts with KX1.rx.', code.startsWith('KX1.rx.'))
check('code is short enough for a QR on paper (< 400 chars)', code.length < 400, code.length)
const back = decodeKx(code)
check('round trip keeps every field (incl. Khmer)', back.type === 'rx' && JSON.stringify(back.data) === JSON.stringify(rx))
check('spaces / new lines in pasted text are ignored', decodeKx(`  ${code.slice(0, 20)}\n${code.slice(20)} `).data.code === 'P-0042')
check('code inside a longer message is found', decodeKx(`Prescription: ${code} thank you`).data.id === rx.id)
const plain = JSON.stringify(back.data)
check('no diagnosis / complaint fields exist in the payload', !/diagnos|complaint|vital|bp|exam/i.test(Object.keys(back.data).join(',')), Object.keys(back.data))
check('patient name is absent unless the clinic adds it', !('name' in back.data) && !plain.includes('name"'))

const errs: string[] = []
for (const bad of ['hello', 'KX1.zz.abc', 'KX1.rx.@@@', 'KX1.rx.' + code.slice(10, 40)])
  try {
    decodeKx(bad)
    errs.push('ok')
  } catch (e: any) {
    errs.push(e.message)
  }
check('bad input is refused with a reason', JSON.stringify(errs) === '["NOT_KITROID_CODE","UNKNOWN_TYPE","NOT_KITROID_CODE","BAD_CODE"]', errs)

check('quantity: given q wins, else times × days', rxQty(rx.items[1]) === 10 && rxQty(rx.items[0]) === 15 && rxQty({ n: 'x' }) === 1)
check('names normalise "500 mg" = "500mg"', normName('Amoxicillin 500 mg') === normName('AMOXICILLIN 500MG'))
check('exact product name scores 100', matchScore('Paracetamol 500mg', 'Paracetamol 500 mg') === 100)
check('same drug other strength still matches, but lower', matchScore('Amoxicillin 500 mg', 'Amoxicillin 250 mg') > 0 && matchScore('Amoxicillin 500 mg', 'Amoxicillin 250 mg') < 100)
check('different drug does not match', matchScore('Amoxicillin 500 mg', 'Ibuprofen 400 mg') < 40)

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
process.exit(failures ? 1 : 0)
