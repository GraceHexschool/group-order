// 每天下午 14:00（台灣時間）：今天截止的團裡，還沒被團主勾「已付款」的訂單，寄信提醒訂購人。
const TAIWAN_OFFSET_MS = 8 * 60 * 60 * 1000

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const money = (n) => `$${Number(n).toLocaleString('en-US')}`

// 純函式：把未付款訂單整理成「每個收件人一封信」
export function buildReminders(rows, appUrl = '') {
  const byEmail = new Map()
  for (const r of rows) {
    if (!r.email) continue // 登入功能上線前的舊資料沒有 email，無法寄信
    if (!byEmail.has(r.email)) byEmail.set(r.email, { email: r.email, name: r.name || r.email, groups: new Map() })
    const person = byEmail.get(r.email)
    if (!person.groups.has(r.group_id)) {
      person.groups.set(r.group_id, {
        id: r.group_id,
        shop: r.shop_name,
        owner: r.owner_name || '團主',
        ownerEmail: r.owner_email || '',
        lines: [],
        sum: 0,
      })
    }
    const g = person.groups.get(r.group_id)
    const amount = r.unit_price * r.quantity
    g.lines.push(`${r.item_name} × ${r.quantity}（${money(amount)}）`)
    g.sum += amount
  }

  return [...byEmail.values()].map((p) => {
    const groups = [...p.groups.values()]
    const total = groups.reduce((s, g) => s + g.sum, 0)
    const subject = `【團購訂餐】提醒：你還有 ${money(total)} 尚未付款`
    const textBlocks = groups.map(
      (g) =>
        `${g.shop}（團主：${g.owner}${g.ownerEmail ? ` <${g.ownerEmail}>` : ''}）\n` +
        g.lines.map((l) => `  - ${l}`).join('\n') +
        `\n  小計 ${money(g.sum)}`,
    )
    const text =
      `${p.name} 你好，\n\n下午 2 點了，團主還沒有收到你的款項（尚未被勾選「已付款」）：\n\n` +
      textBlocks.join('\n\n') +
      `\n\n請記得把錢交給團主；付款後請團主在網站上勾選「已付款」。` +
      (appUrl ? `\n${appUrl}` : '')
    const htmlBlocks = groups
      .map(
        (g) =>
          `<p><strong>${esc(g.shop)}</strong>（團主：${esc(g.owner)}${g.ownerEmail ? ` &lt;${esc(g.ownerEmail)}&gt;` : ''}）</p>` +
          `<ul>${g.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul><p>小計 ${money(g.sum)}</p>`,
      )
      .join('')
    const html =
      `<p>${esc(p.name)} 你好，</p><p>下午 2 點了，團主還沒有收到你的款項（尚未被勾選「已付款」）：</p>${htmlBlocks}` +
      `<p>請記得把錢交給團主；付款後請團主在網站上勾選「已付款」。</p>` +
      (appUrl ? `<p><a href="${esc(appUrl)}">${esc(appUrl)}</a></p>` : '')
    return { to: p.email, subject, text, html, groupIds: groups.map((g) => g.id) }
  })
}

async function sendViaResend(env, mail) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.REMINDER_FROM,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

export async function sendPaymentReminders(env, now = Date.now()) {
  // 台灣沒有日光節約時間，固定 +8 小時
  const today = new Date(now + TAIWAN_OFFSET_MS).toISOString().slice(0, 10)

  const { results } = await env.DB.prepare(
    `SELECT o.group_id, o.item_name, o.unit_price, o.quantity,
            o.created_by_email AS email, o.created_by_name AS name,
            g.created_by_name AS owner_name, g.created_by_email AS owner_email,
            s.name AS shop_name
     FROM orders o
     JOIN groups g ON g.id = o.group_id
     JOIN shops s ON s.id = g.shop_id
     WHERE o.paid = 0
       AND g.reminder_sent_at IS NULL
       AND date(g.deadline, '+8 hours') = ?
     ORDER BY o.group_id, o.id`,
  )
    .bind(today)
    .all()

  const mails = buildReminders(results, env.APP_URL)
  const dryRun = !env.RESEND_API_KEY || !env.REMINDER_FROM
  const sentGroups = new Set()
  let sent = 0
  let failed = 0

  for (const mail of mails) {
    if (dryRun) {
      console.log(`[提醒信·試跑，未寄出] to=${mail.to} subject=${mail.subject}`)
      continue
    }
    try {
      await sendViaResend(env, mail)
      sent++
      mail.groupIds.forEach((id) => sentGroups.add(id))
    } catch (err) {
      failed++
      console.error(`提醒信寄送失敗 to=${mail.to}`, err)
    }
  }

  // 至少有一封寄成功的團才標記，失敗的下次（例如手動重跑）還能再寄
  if (sentGroups.size) {
    await env.DB.batch(
      [...sentGroups].map((id) =>
        env.DB.prepare("UPDATE groups SET reminder_sent_at = datetime('now') WHERE id = ?").bind(id),
      ),
    )
  }
  const summary = { date: today, recipients: mails.length, sent, failed, dryRun }
  console.log('付款提醒完成', JSON.stringify(summary))
  return summary
}
