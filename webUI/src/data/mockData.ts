import type { EmailMessage, Folder } from '../types'

export const folders: Folder[] = [
  { id: 'inbox', name: 'Inbox', icon: 'inbox' },
  { id: 'starred', name: 'Starred', icon: 'star' },
  { id: 'sent', name: 'Sent', icon: 'send' },
  { id: 'drafts', name: 'Drafts', icon: 'file-text' },
  { id: 'archive', name: 'Archive', icon: 'archive' },
  { id: 'spam', name: 'Spam', icon: 'shield-alert' },
  { id: 'trash', name: 'Trash', icon: 'trash-2' },
]

export const messages: EmailMessage[] = [
  {
    id: '1',
    folder: 'inbox',
    from: { name: 'Maya Chen', email: 'maya.chen@northwind.io' },
    to: ['me@example.com'],
    subject: 'Q3 infrastructure review — a few questions before Friday',
    preview:
      "Hey, I went through the deck you sent over and had a couple of questions about the migration timeline...",
    body: `Hey,

I went through the deck you sent over and had a couple of questions about the migration timeline before we lock things in for Friday's review.

1. Are we still targeting the Dovecot cutover for the first week of August, or has that slipped given the DKIM key rotation work?
2. Do we have a rollback plan documented anywhere if the new mail store has issues under load?
3. Who's the point of contact on the Rspamd tuning — is that still Priya's team?

Nothing urgent, just want to make sure we're aligned before I present to the wider group.

Thanks,
Maya`,
    date: '2026-07-24T09:12:00',
    read: false,
    starred: true,
    labels: ['work'],
    attachments: [{ name: 'Q3-infra-review.pdf', size: '2.4 MB' }],
  },
  {
    id: '2',
    folder: 'inbox',
    from: { name: 'GitHub', email: 'notifications@github.com' },
    to: ['me@example.com'],
    subject: '[mailserver] New issue: Rspamd not adding X-Spam headers',
    preview:
      'daniel-k opened an issue: When forwarding through the boky/postfix container, X-Spam-Status headers are missing...',
    body: `daniel-k opened an issue #142:

When forwarding through the boky/postfix container, X-Spam-Status headers are missing on some inbound messages even though Rspamd is scoring them correctly in the web UI.

Steps to reproduce:
1. Send a test spam sample via GTUBE
2. Check headers on delivered message in Dovecot
3. X-Spam-Status is absent, only X-Rspamd-* headers present

Might just be a milter configuration issue but flagging in case others have hit it.

View it on GitHub: https://github.com/example/mailserver/issues/142`,
    date: '2026-07-24T07:45:00',
    read: false,
    starred: false,
    labels: ['dev'],
  },
  {
    id: '3',
    folder: 'inbox',
    from: { name: 'Priya Nair', email: 'priya@northwind.io' },
    to: ['me@example.com'],
    subject: 'Re: DKIM key rotation — signed and ready',
    preview: "Rotated the opendkim keys on staging, DNS TXT records are propagated. Ready for prod whenever you are.",
    body: `Rotated the opendkim keys on staging, DNS TXT records are propagated and verified with dig. Ready for prod whenever you are — just say the word and I'll push the docker-compose update.

One thing worth double checking: the old key stays valid for 48h after cutover in case anything is still in flight from the old signature, so no rush.

— Priya`,
    date: '2026-07-23T16:30:00',
    read: true,
    starred: false,
    labels: ['work'],
  },
  {
    id: '4',
    folder: 'inbox',
    from: { name: 'Linear', email: 'notifications@linear.app' },
    to: ['me@example.com'],
    subject: 'MAIL-88 moved to In Review by Tom',
    preview: '"Add ClamAV freshclam cron + alerting" was moved from In Progress to In Review.',
    body: `MAIL-88: Add ClamAV freshclam cron + alerting

Tom moved this issue to In Review.

Description: freshclam currently only updates on container start. Need a cron inside the clamav container (or a sidecar) that runs freshclam on an interval and alerts if the database goes stale for more than 24h.`,
    date: '2026-07-23T14:02:00',
    read: true,
    starred: false,
  },
  {
    id: '5',
    folder: 'inbox',
    from: { name: 'Sam Okafor', email: 'sam.okafor@partners.dev' },
    to: ['me@example.com'],
    subject: 'Contract renewal — signature needed',
    preview: 'Attached is the renewal for the SMTP relay service, expiring end of August. Let me know if terms look right.',
    body: `Hi,

Attached is the renewal for the SMTP relay service, expiring end of August. Terms are unchanged from last year aside from the volume tier, which moved up given our growth.

Let me know if everything looks right and I'll get it countersigned on our end.

Best,
Sam`,
    date: '2026-07-22T11:20:00',
    read: true,
    starred: true,
    attachments: [{ name: 'relay-renewal-2026.pdf', size: '412 KB' }],
  },
  {
    id: '6',
    folder: 'inbox',
    from: { name: 'Northwind Billing', email: 'billing@northwind.io' },
    to: ['me@example.com'],
    subject: 'Your invoice for July is ready',
    preview: 'Your monthly invoice ($482.00) has been generated and is available in your billing portal.',
    body: `Your monthly invoice ($482.00) has been generated and is available in your billing portal.

Invoice #INV-2026-0724
Amount due: $482.00
Due date: 2026-08-07

This is an automated message, please do not reply.`,
    date: '2026-07-21T08:00:00',
    read: true,
    starred: false,
  },
  {
    id: '7',
    folder: 'inbox',
    from: { name: 'Elena Vasquez', email: 'elena@designstud.io' },
    to: ['me@example.com'],
    subject: 'Webmail UI concepts — round 2',
    preview: 'Attached the revised concepts based on your feedback, mostly around density in the message list.',
    body: `Hi,

Attached the revised concepts based on your feedback, mostly around density in the message list and making the reading pane feel less cramped on smaller screens.

Also tried a version with a persistent compose button in the bottom right, curious what you think compared to the sidebar version.

Let me know which direction to push further.

Elena`,
    date: '2026-07-20T15:44:00',
    read: true,
    starred: false,
    attachments: [
      { name: 'webmail-concepts-v2.fig', size: '8.1 MB' },
      { name: 'notes.pdf', size: '96 KB' },
    ],
  },
  {
    id: '8',
    folder: 'starred',
    from: { name: 'Maya Chen', email: 'maya.chen@northwind.io' },
    to: ['me@example.com'],
    subject: 'Q3 infrastructure review — a few questions before Friday',
    preview:
      "Hey, I went through the deck you sent over and had a couple of questions about the migration timeline...",
    body: `Hey,

I went through the deck you sent over and had a couple of questions about the migration timeline before we lock things in for Friday's review.

Thanks,
Maya`,
    date: '2026-07-24T09:12:00',
    read: false,
    starred: true,
    labels: ['work'],
  },
  {
    id: '9',
    folder: 'sent',
    from: { name: 'Me', email: 'me@example.com' },
    to: ['priya@northwind.io'],
    subject: 'Re: DKIM key rotation — signed and ready',
    preview: 'Great, let\'s cut over Thursday morning before traffic picks up. I\'ll keep an eye on the mail queue...',
    body: `Great, let's cut over Thursday morning before traffic picks up. I'll keep an eye on the mail queue and DMARC reports for the following 48h just in case.

Thanks for turning this around quickly.`,
    date: '2026-07-23T17:05:00',
    read: true,
    starred: false,
  },
  {
    id: '10',
    folder: 'sent',
    from: { name: 'Me', email: 'me@example.com' },
    to: ['sam.okafor@partners.dev'],
    subject: 'Re: Contract renewal — signature needed',
    preview: 'Terms look good on our end, sending the countersigned copy back today.',
    body: `Terms look good on our end, sending the countersigned copy back today. Thanks for the quick turnaround on this.`,
    date: '2026-07-22T13:40:00',
    read: true,
    starred: false,
  },
  {
    id: '11',
    folder: 'drafts',
    from: { name: 'Me', email: 'me@example.com' },
    to: ['elena@designstud.io'],
    subject: 'Re: Webmail UI concepts — round 2',
    preview: 'These look great — I think the persistent compose button wins, but can we try...',
    body: `These look great — I think the persistent compose button wins, but can we try a version where`,
    date: '2026-07-21T10:15:00',
    read: true,
    starred: false,
  },
  {
    id: '12',
    folder: 'archive',
    from: { name: 'Northwind HR', email: 'hr@northwind.io' },
    to: ['me@example.com'],
    subject: 'Reminder: benefits enrollment closes July 15',
    preview: 'This is a friendly reminder that open enrollment closes on July 15. Please review your elections...',
    body: `This is a friendly reminder that open enrollment closes on July 15. Please review your elections in the HR portal before the deadline.`,
    date: '2026-07-10T09:00:00',
    read: true,
    starred: false,
  },
  {
    id: '13',
    folder: 'spam',
    from: { name: 'Prize Center', email: 'winner@totally-legit-prizes.win' },
    to: ['me@example.com'],
    subject: "YOU'VE BEEN SELECTED — claim your reward now!!!",
    preview: 'Congratulations! Our system has selected your email address for a guaranteed reward of $1,000...',
    body: `Congratulations! Our system has selected your email address for a guaranteed reward of $1,000. Click below within 24 hours to claim, verification fee applies.`,
    date: '2026-07-23T03:11:00',
    read: false,
    starred: false,
  },
  {
    id: '14',
    folder: 'spam',
    from: { name: 'IT Security', email: 'no-reply@secure-verify-account.com' },
    to: ['me@example.com'],
    subject: 'Action required: your mailbox will be suspended',
    preview: 'We detected unusual activity on your account. Verify your credentials within 48 hours to avoid suspension...',
    body: `We detected unusual activity on your account. Verify your credentials within 48 hours to avoid suspension.`,
    date: '2026-07-22T02:47:00',
    read: false,
    starred: false,
  },
  {
    id: '15',
    folder: 'trash',
    from: { name: 'Newsletter Weekly', email: 'digest@newsletterweekly.com' },
    to: ['me@example.com'],
    subject: 'This week in self-hosted mail infrastructure',
    preview: 'Top stories: Postfix 3.10 released, Rspamd Bayes improvements, and a deep dive on DMARC alignment...',
    body: `Top stories: Postfix 3.10 released, Rspamd Bayes improvements, and a deep dive on DMARC alignment.`,
    date: '2026-07-18T06:00:00',
    read: true,
    starred: false,
  },
]
