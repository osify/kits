/**
 * Pharmacy trust list: clinic signing keys this shop has checked (by scanning the clinic's card in
 * person, or confirming the key fingerprint with the clinic). Kept in the shop's `setting` table,
 * so it is backed up and synced to the shop's other devices.
 */
import { getSetting, setSetting } from './index'
import type { TrustedSigner } from '@/core/exchange/sign'

const KEY = 'trusted_signers'

export async function listTrusted(): Promise<TrustedSigner[]> {
  try {
    return JSON.parse((await getSetting(KEY)) || '[]')
  } catch {
    return []
  }
}
export async function trustSigner(s: Omit<TrustedSigner, 'added_at'>) {
  const list = (await listTrusted()).filter((x) => x.pub !== s.pub)
  list.push({ ...s, added_at: Date.now() })
  await setSetting(KEY, JSON.stringify(list))
}
export async function untrustSigner(pub: string) {
  await setSetting(KEY, JSON.stringify((await listTrusted()).filter((x) => x.pub !== pub)))
}
