// 所有資料讀寫都經過這支 Worker 的 /api，前端不直接碰 D1。

import { verifyGoogleToken } from './auth.js'
import { MenuAiError, recognizeMenu } from './menu-ai.js'

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const bad = (message) => new HttpError(400, message)
const notFound = (message = '找不到資料') => new HttpError(404, message)

// ---- 輸入驗證 ----
function str(v, field, { max = 100, required = true } = {}) {
  const s = typeof v === 'string' ? v.trim() : ''
  if (required && !s) throw bad(`${field}不能空白`)
  if (s.length > max) throw bad(`${field}最多 ${max} 字`)
  return s
}

function int(v, field, { min = 0, max = 1_000_000 } = {}) {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${field}必須是 ${min}–${max} 的整數`)
  return n
}

function url(v, field) {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!s) return ''
  if (s.length > 500) throw bad(`${field}太長`)
  let u
  try {
    u = new URL(s)
  } catch {
    throw bad(`${field}不是有效的網址`)
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw bad(`${field}必須是 http(s) 網址`)
  return s
}

function isoDate(v, field) {
  const d = new Date(v)
  if (typeof v !== 'string' || Number.isNaN(d.getTime())) throw bad(`${field}格式不正確`)
  return d.toISOString()
}

// 通過驗證的使用者：用 Google 的 sub 當 ID（created_by），名字與 email 只用來顯示
const users = new WeakMap()
function actor(request) {
  const user = users.get(request)
  if (!user) throw new HttpError(401, '請先登入')
  return user
}

async function body(request) {
  try {
    return await request.json()
  } catch {
    throw bad('請求內容不是有效的 JSON')
  }
}

// 團的狀態：locked > closed(過截止時間) > open
function groupStatus(g) {
  if (g.locked) return 'locked'
  return new Date(g.deadline).getTime() <= Date.now() ? 'closed' : 'open'
}

const withStatus = (g) => ({ ...g, locked: !!g.locked, status: groupStatus(g) })

// ---- 店家 ----
async function listShops(env) {
  const { results } = await env.DB.prepare(
    `SELECT s.*, (SELECT COUNT(*) FROM menu_items m WHERE m.shop_id = s.id) AS item_count
     FROM shops s ORDER BY s.id DESC`,
  ).all()
  return json(results)
}

async function createShop(request, env) {
  const by = actor(request)
  const b = await body(request)
  const name = str(b.name, '店家名稱', { max: 50 })
  const note = str(b.note, '備註', { max: 200, required: false })
  const image = url(b.menu_image_url, '菜單照片連結')
  const row = await env.DB.prepare(
    'INSERT INTO shops (name, note, menu_image_url, created_by, created_by_name, created_by_email) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
  )
    .bind(name, note, image, by.sub, by.name, by.email)
    .first()
  return json(row, 201)
}

async function updateShop(id, request, env) {
  actor(request)
  const b = await body(request)
  const name = str(b.name, '店家名稱', { max: 50 })
  const note = str(b.note, '備註', { max: 200, required: false })
  const image = url(b.menu_image_url, '菜單照片連結')
  const row = await env.DB.prepare(
    'UPDATE shops SET name = ?, note = ?, menu_image_url = ? WHERE id = ? RETURNING *',
  )
    .bind(name, note, image, id)
    .first()
  if (!row) throw notFound()
  return json(row)
}

async function deleteShop(id, request, env) {
  actor(request)
  const used = await env.DB.prepare('SELECT COUNT(*) AS n FROM groups WHERE shop_id = ?')
    .bind(id)
    .first()
  if (used.n > 0) throw new HttpError(409, '這家店已經有開過團，無法刪除')
  const r = await env.DB.prepare('DELETE FROM shops WHERE id = ?').bind(id).run()
  if (!r.meta.changes) throw notFound()
  return json({ ok: true })
}

// ---- 菜單 ----
async function listMenu(shopId, env) {
  const shop = await env.DB.prepare('SELECT * FROM shops WHERE id = ?').bind(shopId).first()
  if (!shop) throw notFound('找不到店家')
  const { results } = await env.DB.prepare(
    'SELECT * FROM menu_items WHERE shop_id = ? ORDER BY id',
  )
    .bind(shopId)
    .all()
  return json({ shop, items: results })
}

async function createItem(shopId, request, env) {
  const by = actor(request)
  const b = await body(request)
  const name = str(b.name, '品名', { max: 50 })
  const price = int(b.price, '單價', { max: 100000 })
  const shop = await env.DB.prepare('SELECT id FROM shops WHERE id = ?').bind(shopId).first()
  if (!shop) throw notFound('找不到店家')
  const row = await env.DB.prepare(
    'INSERT INTO menu_items (shop_id, name, price, created_by, created_by_name, created_by_email) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
  )
    .bind(shopId, name, price, by.sub, by.name, by.email)
    .first()
  return json(row, 201)
}

// 從菜單照片辨識品項：只回傳建議，使用者確認後才寫入
async function recognizeShopMenu(shopId, request, env) {
  actor(request)
  const shop = await env.DB.prepare('SELECT * FROM shops WHERE id = ?').bind(shopId).first()
  if (!shop) throw notFound('找不到店家')
  if (!shop.menu_image_url) throw bad('這家店還沒有菜單照片連結')
  const [items, { results: existing }] = await Promise.all([
    recognizeMenu(env, shop.menu_image_url),
    env.DB.prepare('SELECT name FROM menu_items WHERE shop_id = ?').bind(shopId).all(),
  ])
  const have = new Set(existing.map((e) => e.name))
  return json({ items: items.map((i) => ({ ...i, exists: have.has(i.name) })) })
}

// 一次加入多個品項（已存在的同名品項會略過）
async function createItems(shopId, request, env) {
  const by = actor(request)
  const b = await body(request)
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 100) throw bad('品項數量必須是 1–100 個')
  const shop = await env.DB.prepare('SELECT id FROM shops WHERE id = ?').bind(shopId).first()
  if (!shop) throw notFound('找不到店家')
  const items = b.items.map((i) => ({
    name: str(i?.name, '品名', { max: 50 }),
    price: int(i?.price, '單價', { max: 100000 }),
  }))
  const { results: existing } = await env.DB.prepare('SELECT name FROM menu_items WHERE shop_id = ?')
    .bind(shopId)
    .all()
  const have = new Set(existing.map((e) => e.name))
  const fresh = items.filter((i) => !have.has(i.name) && have.add(i.name))
  if (fresh.length) {
    await env.DB.batch(
      fresh.map((i) =>
        env.DB.prepare(
          'INSERT INTO menu_items (shop_id, name, price, created_by, created_by_name, created_by_email) VALUES (?, ?, ?, ?, ?, ?)',
        ).bind(shopId, i.name, i.price, by.sub, by.name, by.email),
      ),
    )
  }
  return json({ added: fresh.length, skipped: items.length - fresh.length }, 201)
}

async function updateItem(id, request, env) {
  actor(request)
  const b = await body(request)
  const name = str(b.name, '品名', { max: 50 })
  const price = int(b.price, '單價', { max: 100000 })
  const row = await env.DB.prepare(
    'UPDATE menu_items SET name = ?, price = ? WHERE id = ? RETURNING *',
  )
    .bind(name, price, id)
    .first()
  if (!row) throw notFound()
  return json(row)
}

async function deleteItem(id, request, env) {
  actor(request)
  const r = await env.DB.prepare('DELETE FROM menu_items WHERE id = ?').bind(id).run()
  if (!r.meta.changes) throw notFound()
  return json({ ok: true })
}

// ---- 開團 ----
const GROUP_SELECT = `
  SELECT g.*, s.name AS shop_name, s.menu_image_url AS shop_menu_image_url,
    (SELECT COUNT(*) FROM orders o WHERE o.group_id = g.id) AS order_count,
    (SELECT COALESCE(SUM(o.unit_price * o.quantity), 0) FROM orders o WHERE o.group_id = g.id) AS total
  FROM groups g JOIN shops s ON s.id = g.shop_id`

async function listGroups(env) {
  const { results } = await env.DB.prepare(`${GROUP_SELECT} ORDER BY g.id DESC LIMIT 100`).all()
  return json(results.map(withStatus))
}

async function createGroup(request, env) {
  const by = actor(request)
  const b = await body(request)
  const shopId = int(b.shop_id, '店家', { min: 1 })
  const deadline = isoDate(b.deadline, '截止時間')
  const note = str(b.note, '團主附註', { max: 300, required: false })
  const shop = await env.DB.prepare('SELECT id FROM shops WHERE id = ?').bind(shopId).first()
  if (!shop) throw bad('找不到這家店')
  const row = await env.DB.prepare(
    'INSERT INTO groups (shop_id, deadline, note, created_by, created_by_name, created_by_email) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
  )
    .bind(shopId, deadline, note, by.sub, by.name, by.email)
    .first()
  return getGroup(row.id, env, 201)
}

async function getGroup(id, env, status = 200) {
  const g = await env.DB.prepare(`${GROUP_SELECT} WHERE g.id = ?`).bind(id).first()
  if (!g) throw notFound('找不到這個團')
  const [{ results: orders }, { results: items }] = await Promise.all([
    env.DB.prepare('SELECT * FROM orders WHERE group_id = ? ORDER BY id').bind(id).all(),
    env.DB.prepare('SELECT * FROM menu_items WHERE shop_id = ? ORDER BY id').bind(g.shop_id).all(),
  ])
  return json(
    {
      group: withStatus(g),
      menu: items,
      orders: orders.map((o) => ({ ...o, paid: !!o.paid })),
    },
    status,
  )
}

async function getGroupRow(id, env) {
  const g = await env.DB.prepare('SELECT * FROM groups WHERE id = ?').bind(id).first()
  if (!g) throw notFound('找不到這個團')
  return g
}

async function updateGroup(id, request, env) {
  const by = actor(request)
  const g = await getGroupRow(id, env)
  if (g.created_by !== by.sub) throw new HttpError(403, '只有團主可以修改這個團')
  const b = await body(request)
  const deadline = b.deadline !== undefined ? isoDate(b.deadline, '截止時間') : g.deadline
  const note = b.note !== undefined ? str(b.note, '團主附註', { max: 300, required: false }) : g.note
  const locked = b.locked !== undefined ? (b.locked ? 1 : 0) : g.locked
  await env.DB.prepare('UPDATE groups SET deadline = ?, note = ?, locked = ? WHERE id = ?')
    .bind(deadline, note, locked, id)
    .run()
  return getGroup(id, env)
}

async function deleteGroup(id, request, env) {
  const by = actor(request)
  const g = await getGroupRow(id, env)
  if (g.created_by !== by.sub) throw new HttpError(403, '只有團主可以刪除這個團')
  await env.DB.prepare('DELETE FROM groups WHERE id = ?').bind(id).run()
  return json({ ok: true })
}

// ---- 點餐 ----
async function createOrder(groupId, request, env) {
  const by = actor(request)
  const g = await getGroupRow(groupId, env)
  if (groupStatus(g) !== 'open') throw new HttpError(409, '這個團已截止或鎖單，不能再點餐')
  const b = await body(request)
  const itemName = str(b.item_name, '餐點', { max: 50 })
  const price = int(b.unit_price, '價格', { max: 100000 })
  const quantity = int(b.quantity, '數量', { min: 1, max: 99 })
  const note = str(b.note, '備註', { max: 100, required: false })
  // 餐點與價格由點餐的人直接輸入；若剛好在菜單內就順便記下對應品項
  const item = await env.DB.prepare('SELECT id FROM menu_items WHERE shop_id = ? AND name = ?')
    .bind(g.shop_id, itemName)
    .first()
  const row = await env.DB.prepare(
    `INSERT INTO orders (group_id, menu_item_id, item_name, unit_price, quantity, note, created_by, created_by_name, created_by_email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(groupId, item?.id ?? null, itemName, price, quantity, note, by.sub, by.name, by.email)
    .first()
  return json({ ...row, paid: !!row.paid }, 201)
}

async function updateOrder(id, request, env) {
  const by = actor(request)
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first()
  if (!o) throw notFound()
  const g = await getGroupRow(o.group_id, env)
  const b = await body(request)

  // 「已付款」由團主勾選；不受截止／鎖單限制
  if (b.paid !== undefined) {
    if (g.created_by !== by.sub) throw new HttpError(403, '只有團主可以勾選已付款')
    await env.DB.prepare('UPDATE orders SET paid = ? WHERE id = ?')
      .bind(b.paid ? 1 : 0, id)
      .run()
  }

  // 數量／備註：只有點餐的人本人，且團還在進行中
  if (b.quantity !== undefined || b.note !== undefined) {
    if (o.created_by !== by.sub) throw new HttpError(403, '只能修改自己的點餐')
    if (groupStatus(g) !== 'open') throw new HttpError(409, '這個團已截止或鎖單，不能再修改')
    const quantity = b.quantity !== undefined ? int(b.quantity, '數量', { min: 1, max: 99 }) : o.quantity
    const note = b.note !== undefined ? str(b.note, '備註', { max: 100, required: false }) : o.note
    await env.DB.prepare('UPDATE orders SET quantity = ?, note = ? WHERE id = ?')
      .bind(quantity, note, id)
      .run()
  }

  const row = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first()
  return json({ ...row, paid: !!row.paid })
}

async function deleteOrder(id, request, env) {
  const by = actor(request)
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first()
  if (!o) throw notFound()
  if (o.created_by !== by.sub) throw new HttpError(403, '只能刪除自己的點餐')
  const g = await getGroupRow(o.group_id, env)
  if (groupStatus(g) !== 'open') throw new HttpError(409, '這個團已截止或鎖單，不能再刪除')
  await env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(id).run()
  return json({ ok: true })
}

// ---- 路由 ----
const routes = [
  ['GET', /^\/api\/shops$/, (_m, _r, env) => listShops(env)],
  ['POST', /^\/api\/shops$/, (_m, r, env) => createShop(r, env)],
  ['PUT', /^\/api\/shops\/(\d+)$/, (m, r, env) => updateShop(+m[1], r, env)],
  ['DELETE', /^\/api\/shops\/(\d+)$/, (m, r, env) => deleteShop(+m[1], r, env)],
  ['GET', /^\/api\/shops\/(\d+)\/items$/, (m, _r, env) => listMenu(+m[1], env)],
  ['POST', /^\/api\/shops\/(\d+)\/items$/, (m, r, env) => createItem(+m[1], r, env)],
  ['POST', /^\/api\/shops\/(\d+)\/recognize-menu$/, (m, r, env) => recognizeShopMenu(+m[1], r, env)],
  ['POST', /^\/api\/shops\/(\d+)\/items\/bulk$/, (m, r, env) => createItems(+m[1], r, env)],
  ['PUT', /^\/api\/items\/(\d+)$/, (m, r, env) => updateItem(+m[1], r, env)],
  ['DELETE', /^\/api\/items\/(\d+)$/, (m, r, env) => deleteItem(+m[1], r, env)],
  ['GET', /^\/api\/groups$/, (_m, _r, env) => listGroups(env)],
  ['POST', /^\/api\/groups$/, (_m, r, env) => createGroup(r, env)],
  ['GET', /^\/api\/groups\/(\d+)$/, (m, _r, env) => getGroup(+m[1], env)],
  ['PUT', /^\/api\/groups\/(\d+)$/, (m, r, env) => updateGroup(+m[1], r, env)],
  ['DELETE', /^\/api\/groups\/(\d+)$/, (m, r, env) => deleteGroup(+m[1], r, env)],
  ['POST', /^\/api\/groups\/(\d+)\/orders$/, (m, r, env) => createOrder(+m[1], r, env)],
  ['PUT', /^\/api\/orders\/(\d+)$/, (m, r, env) => updateOrder(+m[1], r, env)],
  ['DELETE', /^\/api\/orders\/(\d+)$/, (m, r, env) => deleteOrder(+m[1], r, env)],
]

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (!pathname.startsWith('/api/')) return json({ error: '找不到網頁' }, 404)

    // 每個 /api 請求先驗證 Google 通行證；沒過（或 GOOGLE_CLIENT_ID 沒設定）一律 401，不碰 D1
    const auth = request.headers.get('authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    const user = await verifyGoogleToken(token, env.GOOGLE_CLIENT_ID)
    if (!user) return json({ error: '請先用公司 Google 帳號登入' }, 401)
    users.set(request, user)

    try {
      let pathMatched = false
      for (const [method, pattern, handler] of routes) {
        const m = pathname.match(pattern)
        if (!m) continue
        pathMatched = true
        if (method === request.method) return await handler(m, request, env)
      }
      return json({ error: pathMatched ? '不支援的請求方法' : '找不到 API' }, pathMatched ? 405 : 404)
    } catch (err) {
      if (err instanceof MenuAiError) return json({ error: err.message }, err.status)
      if (err instanceof HttpError) return json({ error: err.message }, err.status)
      console.error(err)
      return json({ error: '伺服器發生錯誤' }, 500)
    }
  },
}
