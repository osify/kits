/**
 * ULID: 26-char, time-sortable, globally unique ids. Records created on different
 * devices never collide, which keeps future multi-device sync (merge via Drive) simple.
 */
const ENC = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function ulid(now: number = Date.now()): string {
  let time = ''
  let t = now
  for (let i = 0; i < 10; i++) {
    time = ENC[t % 32] + time
    t = Math.floor(t / 32)
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let rand = ''
  for (let i = 0; i < 16; i++) rand += ENC[bytes[i] % 32]
  return time + rand
}
