import { simpleParser } from 'mailparser'

/**
 * Extract readable text from a raw RFC822 message. Handles multipart
 * nesting, quoted-printable/base64 encodings and charsets via mailparser;
 * HTML-only emails are stripped down to their visible text.
 */
export async function extractEmailText(source: Buffer): Promise<string> {
  const parsed = await simpleParser(source)
  if (parsed.text && parsed.text.trim().length > 0) {
    return normalize(parsed.text)
  }
  if (parsed.html) {
    return normalize(stripHtml(parsed.html))
  }
  return ''
}

function stripHtml(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function normalize(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}
