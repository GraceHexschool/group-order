<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { GOOGLE_CLIENT_ID, authMessage, signIn } from './api.js'

const btn = ref(null)
const failed = ref(false)
let timer

function init() {
  const gid = window.google?.accounts?.id
  if (!gid) return false
  gid.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (res) => signIn(res.credential),
    ux_mode: 'popup',
    auto_select: false,
  })
  gid.renderButton(btn.value, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'signin_with',
    shape: 'rectangular',
    locale: 'zh-TW',
  })
  return true
}

onMounted(() => {
  if (!GOOGLE_CLIENT_ID) return (failed.value = true)
  // Google 的 script 是 async 載入，等它好了再畫按鈕（不使用 One Tap）
  if (init()) return
  let tries = 0
  timer = setInterval(() => {
    if (init()) clearInterval(timer)
    else if (++tries > 50) {
      clearInterval(timer)
      failed.value = true
    }
  }, 200)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="welcome">
    <div class="card">
      <h1>🍱 團購訂餐</h1>
      <p>請使用 <strong>@hexschool.com</strong> 公司帳號登入。</p>
      <p v-if="authMessage" class="error">{{ authMessage }}</p>
      <div ref="btn" class="gbtn"></div>
      <p v-if="failed" class="error">
        無法載入 Google 登入，請檢查網路，或確認有設定 GOOGLE_CLIENT_ID。
      </p>
    </div>
  </div>
</template>
