<script setup>
import { onMounted, ref } from 'vue'
import { api } from '../api.js'

const shops = ref([])
const error = ref('')
const form = ref({ name: '', note: '' })
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
const add = () =>
  run(async () => {
    await api('/shops', { method: 'POST', body: form.value })
    form.value = { name: '', note: '' }
  })
const saveEdit = () =>
  run(async () => {
    await api(`/shops/${editing.value.id}`, { method: 'PUT', body: editing.value })
    editing.value = null
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
    <button class="primary">新增店家</button>
  </form>

  <p v-if="!shops.length" class="muted">還沒有店家，先新增一家吧。</p>
  <ul class="list">
    <li v-for="s in shops" :key="s.id" class="card">
      <template v-if="editing?.id === s.id">
        <form class="row" @submit.prevent="saveEdit">
          <input v-model="editing.name" maxlength="50" required />
          <input v-model="editing.note" maxlength="200" />
          <button class="primary">儲存</button>
          <button type="button" @click="editing = null">取消</button>
        </form>
      </template>
      <template v-else>
        <div class="grow">
          <a :href="`#/shops/${s.id}`" class="title">{{ s.name }}</a>
          <span class="muted"> · {{ s.item_count }} 個品項 · {{ s.created_by }} 建立</span>
          <div v-if="s.note" class="muted">{{ s.note }}</div>
        </div>
        <a :href="`#/shops/${s.id}`" class="btn">菜單</a>
        <button @click="editing = { id: s.id, name: s.name, note: s.note }">編輯</button>
        <button class="danger" @click="remove(s)">刪除</button>
      </template>
    </li>
  </ul>
</template>
