// 用 Cloudflare Workers AI（Llama 4 Scout，視覺）辨識菜單照片，回傳「建議的品項」，不直接寫入資料庫。
const MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct'
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

const PROMPT = `這是一張台灣餐廳的菜單照片（繁體中文）。請逐字辨識，列出菜單上每一個可點的品項與它的價格（新台幣整數）。
規則：
- 品名必須照片上的原文，一個字都不要猜或改寫；看不清楚的字寧可略過整個品項。
- 同一道菜若有多種價格（例如「飯／餐」一個價格、「單點」另一個價格），要拆成兩個品項；單點的品名後面加「（單點）」，例如「雞排飯 120」與「單點 90」要輸出「雞排飯」120 和「雞排（單點）」90。
- 品名括號內的說明（例如「（雞腿+排骨）」）要保留。
- 沒有標價的品項略過。
- 同一張圖片出現的每個品項都要列出，不要漏掉右側或角落的區塊。`

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, price: { type: 'integer' } },
        required: ['name', 'price'],
      },
    },
  },
  required: ['items'],
}

export class MenuAiError extends Error {
  constructor(message, status = 502) {
    super(message)
    this.status = status
  }
}

// Google Drive 分享連結 → 可直接下載的縮圖網址（檔案需設為「知道連結的人可檢視」）
export function fetchableImageUrl(link) {
  const m = link.match(/drive\.google\.com\/file\/d\/([\w-]+)/)
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w2400` : link
}

async function loadImage(link) {
  let url
  try {
    url = new URL(fetchableImageUrl(link))
  } catch {
    throw new MenuAiError('菜單照片連結不是有效的網址', 400)
  }
  if (url.protocol !== 'https:') throw new MenuAiError('菜單照片連結必須是 https 網址', 400)

  let res
  try {
    res = await fetch(url, { redirect: 'follow' })
  } catch {
    throw new MenuAiError('讀不到菜單照片，請確認連結可以公開開啟')
  }
  const type = (res.headers.get('content-type') || '').split(';')[0].trim()
  if (!res.ok || !type.startsWith('image/')) {
    throw new MenuAiError('讀不到菜單照片：請確認連結是圖片，且設為「知道連結的人可檢視」')
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.length > MAX_IMAGE_BYTES) throw new MenuAiError('菜單照片太大（上限 8MB）', 400)

  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${type};base64,${btoa(bin)}`
}

// 模型回來的內容不可信：只收「有名字、價格是 0–100000 整數」的品項，去重、限量
function sanitize(raw) {
  let data = raw
  if (typeof data === 'string') {
    const m = data.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
    try {
      data = m ? JSON.parse(m[0]) : null
    } catch {
      data = null
    }
  }
  const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []
  const seen = new Set()
  const items = []
  for (const it of list) {
    const name = typeof it?.name === 'string' ? it.name.trim().slice(0, 50) : ''
    const price = Number(it?.price)
    if (!name || !Number.isInteger(price) || price < 0 || price > 100000 || seen.has(name)) continue
    seen.add(name)
    items.push({ name, price })
    if (items.length >= 100) break
  }
  return items
}

export async function recognizeMenu(env, imageLink) {
  if (!env.AI) throw new MenuAiError('伺服器尚未設定 Workers AI', 500)
  const image = await loadImage(imageLink)
  let result
  try {
    result = await env.AI.run(MODEL, {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ],
      max_tokens: 3000,
      response_format: { type: 'json_schema', json_schema: { name: 'menu', schema: SCHEMA } },
    })
  } catch (err) {
    console.error('Workers AI error', err)
    throw new MenuAiError('辨識服務暫時失敗，請稍後再試，或手動新增品項')
  }
  const items = sanitize(result?.response ?? result?.choices?.[0]?.message?.content)
  if (!items.length) throw new MenuAiError('沒有辨識出任何品項，請換一張更清楚的照片，或手動新增')
  return items
}
