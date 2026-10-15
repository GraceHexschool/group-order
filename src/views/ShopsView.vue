<script setup>
import { onMounted, ref } from 'vue'
import { api } from '../api.js'

const shops = ref([])
const error = ref('')
const form = ref({ name: '', note: '', menu_image_url: '' })
const editing = ref(null) // { id, name, note }

async function load() {
  shops.value = await api('/shops')
}
async function run(fn) {
  error.value = ''
  try {
    await fn()
    await load()
  } catch (e) {
    error.value = e.message
  }
}
// 有貼菜單照片連結時，存完直接跳到菜單頁並自動辨識
const scan = (id) => (location.hash = `#/shops/${id}?scan=1`)
const add = () =>
  run(async () => {
    const shop = await api('/shops', { method: 'POST', body: form.value })
    const hasImage = !!form.value.menu_image_url.trim()
    form.value = { name: '', note: '', menu_image_url: '' }
    if (hasImage) scan(shop.id)
  })
const saveEdit = () =>
  run(async () => {
    const { id, menu_image_url } = editing.value
    const before = shops.value.find((s) => s.id === id)?.menu_image_url || ''
    await api(`/shops/${id}`, { method: 'PUT', body: editing.value })
    editing.value = null
    if (menu_image_url.trim() && menu_image_url.trim() !== before) scan(id)
  })
const remove = (s) => {
  if (confirm(`確定刪除「${s.name}」與它的菜單？`)) run(() => api(`/shops/${s.id}`, { method: 'DELETE' }))
}
onMounted(() => run(async () => {}))
</script>

<template>
  <h2>店家與菜單</h2>
  <p v-if="error" class="error">{{ error }}</p>

  <form class="card row" @submit.prevent="add">
    <input v-model="form.name" placeholder="店家名稱" maxlength="50" required />
    <input v-model="form.note" placeholder="備註（電話、營業時間…）" maxlength="200" />
    <input v-model="form.menu_image_url" type="url" placeholder="菜單照片連結（選填，例如 Google Drive 分享連結）" maxlength="500" />
    <button class="primary">新增店家</button>
  </form>

  <p v-if="!shops.length" class="muted">還沒有店家，先新增一家吧。</p>
  <ul class="list">
    <li v-for="s in shops" :key="s.id" class="card">
      <template v-if="editing?.id === s.id">
        <form class="row" @submit.prevent="saveEdit">
          <input v-model="editing.name" maxlength="50" required />
          <input v-model="editing.note" maxlength="200" />
          <input v-model="editing.menu_image_url" type="url" placeholder="菜單照片連結" maxlength="500" />
          <button class="primary">儲存</button>
          <button type="button" @click="editing = null">取消</button>
        </form>
      </template>
      <template v-else>
        <div class="grow">
          <a :href="`#/shops/${s.id}`" class="title">{{ s.name }}</a>
          <span class="muted"> · {{ s.item_count }} 個品項 · {{ s.created_by_name }} 建立</span>
          <div v-if="s.note" class="muted">{{ s.note }}</div>
          <a v-if="s.menu_image_url" :href="s.menu_image_url" target="_blank" rel="noopener" class="muted">📷 菜單照片</a>
        </div>
        <a :href="`#/shops/${s.id}`" class="btn">菜單</a>
        <button @click="editing = { id: s.id, name: s.name, note: s.note, menu_image_url: s.menu_image_url }">編輯</button>
        <button class="danger" @click="remove(s)">刪除</button>
      </template>
    </li>
  </ul>
</template>
