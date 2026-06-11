import 'dotenv/config'
import { ImapFlow, type ImapFlowOptions } from 'imapflow'
import { loadConfig } from '../config/index.js'
import { extractEmailText } from '../imap/extract.js'

// Print the extracted text of the most recent email from each configured sender.
async function main() {
  const config = loadConfig()
  const client = new ImapFlow({
    host: config.imap.host, port: config.imap.port, secure: true,
    auth: { user: config.imap.user, pass: config.imap.password }, logger: false,
  } as ImapFlowOptions)
  await client.connect()
  await client.mailboxOpen('INBOX', { readOnly: true })
  for (const bank of config.banks) {
    const uids = await client.search({ from: bank.sender }, { uid: true })
    const list = Array.isArray(uids) ? uids : []
    if (!list.length) { console.log(`=== ${bank.sender}: none ===`); continue }
    for await (const msg of client.fetch(String(list[list.length - 1]), { uid: true, envelope: true, source: true }, { uid: true })) {
      const text = msg.source ? await extractEmailText(msg.source) : ''
      console.log(`\n=== ${bank.sender} | ${msg.envelope?.subject} ===`)
      console.log(text.slice(0, 700))
    }
  }
  await client.logout()
}
main().catch(e => { console.error(e); process.exit(1) })
