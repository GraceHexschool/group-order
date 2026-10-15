import { computed, ref } from 'vue'

// Vite define 注入（來自 GOOGLE_CLIENT_ID 環境變數）
export const GOOGLE_CLIENT_ID = __GOOGLE_CLIENT_ID__
const ALLOWED_DOMAIN = 'hexschool.com'
const TOKEN_KEY = 'group-order:id_token'

// ---- 登入狀態（Google ID token）----
function decode(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '='))
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))))
  } catch {
    return null
  }
}

const usable = (token) => {
  const p = token && decode(token)
  return p && p.exp * 1000 > Date.now() && p.hd === ALLOWED_DOMAIN ? p : null
}

function load() {
  try {
    const t = localStorage.getItem(TOKEN_KEY) || ''
    return usable(t) ? t : ''
  } catch {
    return ''
  }
}

export const token = ref(load())
export const authMessage = ref('')

// 畫面上只用來顯示；真正的驗證在 Worker
export const user = computed(() => {
  const p = token.value && decode(token.value)
  return p ? { sub: p.sub, name: p.name || p.email, email: p.email, picture: p.picture, exp: p.exp } : null
})

export function signIn(credential) {
  const p = decode(credential)
  if (!p || p.hd !== ALLOWED_DOMAIN) {
    authMessage.value = `請使用 @${ALLOWED_DOMAIN} 的公司帳號登入`
    return false
  }
  authMessage.value = ''
  token.value = credential
  try {
    localStorage.setItem(TOKEN_KEY, credential)
  } catch {
    /* 存不了仍可在本次使用 */
  }
  return true
}

export function signOut(message = '') {
  token.value = ''
  authMessage.value = message
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
  window.google?.accounts?.id?.disableAutoSelect()
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (token.value) headers.authorization = `Bearer ${token.value}`
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) {
    signOut('登入已過期或無效，請重新登入')
    throw new Error('請重新登入')
  }
  if (!res.ok) throw new Error(data.error || `請求失敗 (${res.status})`)
  return data
}

// ---- 顯示用工具 ----
export const money = (n) => `$${Number(n).toLocaleString()}`

export const fmtTime = (iso) =>
  new Date(iso).toLocaleString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

// <input type="datetime-local"> 的值（本地時間）
export function toLocalInput(date) {
  const d = new Date(date)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

// Google Drive 分享連結不能直接當 <img>，轉成縮圖網址（檔案需設為「知道連結的人可檢視」）
export function imageSrc(link) {
  const m = link && link.match(/drive\.google\.com\/file\/d\/([\w-]+)/)
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1200` : link
}
