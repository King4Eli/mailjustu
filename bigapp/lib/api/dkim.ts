import crypto from 'crypto'

// Private key is stored in virtual_domains.dkim_private_key; the
// dkim_sync sidecar (docker-compose.opendkim.yml) syncs it into OpenDKIM.
export function generateDkimKeyPair(selector = 'mail') {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  return { selector, privateKeyPem: privateKey, publicKeyBase64: publicKey.toString('base64') }
}
