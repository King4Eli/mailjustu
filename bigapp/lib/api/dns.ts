// Generates copy-pasteable DNS records for a newly hosted domain.
// MAIL_HOSTNAME/MAIL_PUBLIC_IP fall back to placeholders until set in
// ./.env/api.env. dkim is null only for domains predating DKIM support.
export function buildDnsRecords(domain: string, dkim: { selector: string; publicKey: string } | null) {
  const hostname = process.env.MAIL_HOSTNAME || 'mail.example.com'
  const publicIp = process.env.MAIL_PUBLIC_IP || 'YOUR_SERVER_PUBLIC_IP'
  const dkimSelector = dkim?.selector
  const dkimPublicKey = dkim?.publicKey

  return [
    {
      purpose: 'Mail exchanger -- tells other servers where to deliver mail for this domain',
      type: 'MX',
      name: domain,
      value: `10 ${hostname}.`,
    },
    {
      purpose: `Points ${hostname} at this server (skip if it already resolves elsewhere)`,
      type: 'A',
      name: hostname,
      value: publicIp,
    },
    {
      purpose: 'SPF -- authorizes this server to send mail for the domain',
      type: 'TXT',
      name: domain,
      value: `"v=spf1 mx a:${hostname} ~all"`,
    },
    {
      purpose: 'DMARC -- policy for what to do with mail that fails SPF/DKIM (start with p=none while testing)',
      type: 'TXT',
      name: `_dmarc.${domain}`,
      value: `"v=DMARC1; p=none; rua=mailto:postmaster@${domain}"`,
    },
    dkimPublicKey
      ? {
          purpose:
            'DKIM -- proves mail claiming to be from this domain was actually signed by this server',
          type: 'TXT',
          name: `${dkimSelector}._domainkey.${domain}`,
          value: `"${dkimPublicKey}"`,
        }
      : {
          purpose: 'DKIM -- no signing key on this domain (it predates DKIM support; recreate it to get one)',
          type: 'TXT',
          name: `mail._domainkey.${domain}`,
          value: '(not generated yet)',
        },
  ]
}
