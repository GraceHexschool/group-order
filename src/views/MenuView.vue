<script setup>
import { onMounted, ref } from 'vue'
import { api, money } from '../api.js'

const props = defineProps({ shopId: Number })
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
onMounted(() => run(async () => {}))
</script>

<template>
  <p><a href="#/shops">← 回店家列表</a></p>
  <h2>{{ shop?.name }} 的菜單</h2>
  <p v-if="shop?.note" class="muted">{{ shop.note }}</p>
  <p v-if="error" class="error">{{ error }}</p>

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
