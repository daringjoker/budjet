import 'dotenv/config'
import { ImapFlow, type ImapFlowOptions } from 'imapflow'
import { loadConfig } from '../config/index.js'

// Lists the most frequent senders in the last N months so the real
// bank-alert addresses can be put into config.json.
const MONTHS = 3

async function main() {
  const config = loadConfig()
  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: true,
    auth: { user: config.imap.user, pass: config.imap.password },
    logger: false,
  } as ImapFlowOptions)
  await client.connect()
  await client.mailboxOpen('INBOX', { readOnly: true })

  const since = new Date()
  since.setMonth(since.getMonth() - MONTHS)
  const uids = await client.search({ since }, { uid: true })
  const uidList = Array.isArray(uids) ? uids : []
  console.log(`Messages since ${since.toISOString().slice(0, 10)}: ${uidList.length}`)
  if (uidList.length === 0) {
    await client.logout()
    return
  }

  const senders = new Map<string, { count: number; sample: string }>()
  for await (const msg of client.fetch(uidList.join(','), { uid: true, envelope: true }, { uid: true })) {
    const addr = msg.envelope?.from?.[0]?.address?.toLowerCase() ?? '(unknown)'
    const entry = senders.get(addr) ?? { count: 0, sample: msg.envelope?.subject ?? '' }
    entry.count++
    if (!entry.sample) entry.sample = msg.envelope?.subject ?? ''
    senders.set(addr, entry)
  }
  await client.logout()

  const sorted = [...senders.entries()].sort((a, b) => b[1].count - a[1].count)
  console.log('\nSender                                              Count  Sample subject')
  console.log('─'.repeat(110))
  for (const [addr, { count, sample }] of sorted.slice(0, 50)) {
    console.log(`${addr.padEnd(50)}  ${String(count).padStart(4)}  ${sample.slice(0, 50)}`)
  }
}

main().catch(err => {
  console.error('discover failed:', err)
  process.exit(1)
})
