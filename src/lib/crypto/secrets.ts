import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto'

/**
 * Chiffrement des secrets de connexion (tokens des plateformes agréées…). SERVEUR UNIQUEMENT.
 * AES-256-GCM, clé dérivée (HKDF-SHA256) de APP_ENCRYPTION_KEY, à défaut de la clé service
 * Supabase (toujours présente côté serveur). Changer la clé source rend les secrets illisibles :
 * l'utilisateur n'a alors qu'à reconnecter sa plateforme.
 */
function encryptionKey(): Buffer {
  const source = process.env.APP_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!source) throw new Error('Clé de chiffrement absente (APP_ENCRYPTION_KEY)')
  return Buffer.from(hkdfSync('sha256', source, 'tonpilote', 'connexion-secrets-v1', 32))
}

export function encryptSecret(value: unknown): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
}

export function decryptSecret<T>(payload: string): T {
  const [version, iv, tag, data] = (payload || '').split('.')
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Secret illisible')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  const clear = Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()])
  return JSON.parse(clear.toString('utf8')) as T
}
