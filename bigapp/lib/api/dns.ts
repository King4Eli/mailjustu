// Generates copy-pasteable DNS records for a newly hosted domain. We don't
// know the real public IP/hostname of wherever this stack ends up running,
// so MAIL_HOSTNAME/MAIL_PUBLIC_IP are placeholders until set in
// ./.env/api.env -- the records are still structurally correct, just need
// the placeholder swapped for the real value.
export function buildDnsRecords(domain: string) {
  const hostname = process.env.MAIL_HOSTNAME || 'mail.example.com'
  const publicIp = process.env.MAIL_PUBLIC_IP || 'YOUR_SERVER_PUBLIC_IP'

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
    {
      purpose:
        'DKIM -- not yet available: OpenDKIM runs in verify-only mode in this stack (see .todo.txt). Generate a real keypair and switch it to signing mode before this record means anything.',
      type: 'TXT',
      name: `<selector>._domainkey.${domain}`,
      value: '(not generated yet)',
    },
  ]
}
