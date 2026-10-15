<script setup>
import { onMounted, ref } from 'vue'
import { api, imageSrc, money } from '../api.js'

const props = defineProps({ shopId: Number, autoScan: Boolean })
const shop = ref(null)
const items = ref([])
const error = ref('')
const form = ref({ name: '', price: '' })
const editing = ref(null)

async function load() {
  const data = await api(`/shops/${props.shopId}/items`)
  shop.value = data.shop
  items.value = data.items
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
const add = () =>
  run(async () => {
    await api(`/shops/${props.shopId}/items`, { method: 'POST', body: form.value })
    form.value = { name: '', price: '' }
  })
const saveEdit = () =>
  run(async () => {
    await api(`/items/${editing.value.id}`, { method: 'PUT', body: editing.value })
    editing.value = null
  })
const remove = (i) => {
  if (confirm(`確定刪除「${i.name}」？`)) run(() => api(`/items/${i.id}`, { method: 'DELETE' }))
}

// ---- 從菜單照片辨識 ----
const scanning = ref(false)
const found = ref(null) // [{ name, price, exists, selected }]
async function recognize() {
  error.value = ''
  found.value = null
  scanning.value = true
  try {
    const data = await api(`/shops/${props.shopId}/recognize-menu`, { method: 'POST' })
    found.value = data.items.map((i) => ({ ...i, selected: !i.exists }))
  } catch (e) {
    error.value = e.message
  } finally {
    scanning.value = false
  }
}
const picked = () => (found.value || []).filter((i) => i.selected)
async function addFound() {
  const items = picked().map(({ name, price }) => ({ name, price }))
  if (!items.length) return
  await run(async () => {
    await api(`/shops/${props.shopId}/items/bulk`, { method: 'POST', body: { items } })
    found.value = null
  })
}

onMounted(async () => {
  await run(async () => {})
  if (props.autoScan && shop.value?.menu_image_url) recognize()
})
</script>

<template>
  <p><a href="#/shops">← 回店家列表</a></p>
  <h2>{{ shop?.name }} 的菜單</h2>
  <p v-if="shop?.note" class="muted">{{ shop.note }}</p>
  <p v-if="error" class="error">{{ error }}</p>
  <a v-if="shop?.menu_image_url" :href="shop.menu_image_url" target="_blank" rel="noopener">
    <img :src="imageSrc(shop.menu_image_url)" alt="菜單照片" class="menu-img" />
  </a>

  <div v-if="shop?.menu_image_url" class="card col">
    <div class="row">
      <button :disabled="scanning" @click="recognize">
        {{ scanning ? '辨識中…（約 10–20 秒）' : '🔍 從照片辨識菜單' }}
      </button>
      <span class="muted">辨識結果可能有錯字，請確認後再加入。</span>
    </div>
    <template v-if="found">
      <div v-for="(i, idx) in found" :key="idx" class="row found">
        <input v-model="i.selected" type="checkbox" />
        <input v-model="i.name" maxlength="50" :disabled="!i.selected" />
        <input v-model.number="i.price" type="number" min="0" step="1" class="price" :disabled="!i.selected" />
        <span v-if="i.exists" class="muted">已在菜單</span>
      </div>
      <div class="row">
        <button class="primary" :disabled="!picked().length" @click="addFound">
          加入選取的 {{ picked().length }} 項
        </button>
        <button @click="found = null">取消</button>
      </div>
    </template>
  </div>

  <form class="card row" @submit.prevent="add">
    <input v-model="form.name" placeholder="品名" maxlength="50" required />
    <input v-model="form.price" type="number" min="0" step="1" placeholder="單價" required />
    <button class="primary">新增品項</button>
  </form>

  <p v-if="!items.length" class="muted">這家店還沒有品項。</p>
  <ul class="list">
    <li v-for="i in items" :key="i.id" class="card">
      <template v-if="editing?.id === i.id">
        <form class="row" @submit.prevent="saveEdit">
          <input v-model="editing.name" maxlength="50" required />
          <input v-model="editing.price" type="number" min="0" step="1" required />
          <button class="primary">儲存</button>
          <button type="button" @click="editing = null">取消</button>
        </form>
      </template>
      <template v-else>
        <span class="grow title">{{ i.name }}</span>
        <strong>{{ money(i.price) }}</strong>
        <button @click="editing = { id: i.id, name: i.name, price: i.price }">編輯</button>
        <button class="danger" @click="remove(i)">刪除</button>
      </template>
    </li>
  </ul>
</template>
