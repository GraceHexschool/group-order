import { ref } from 'vue'

// 目前沒有登入：名字存在瀏覽器，API 以 x-user-name 帶給 Worker 寫入 created_by
const KEY = 'group-order:name'
const read = () => {
  try {
    return localStorage.getItem(KEY) || ''
  } catch {
    return ''
  }
}

export const userName = ref(read())

export function setUserName(name) {
  userName.value = name.trim()
  try {
    localStorage.setItem(KEY, userName.value)
  } catch {
    /* 無痕模式等情況存不了，仍可在本次使用 */
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (userName.value) headers['x-user-name'] = encodeURIComponent(userName.value)
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `請求失敗 (${res.status})`)
  return data
}

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
