<script setup>
import { onMounted, ref } from 'vue'
import { api, fmtTime, money, toLocalInput } from '../api.js'

const groups = ref([])
const shops = ref([])
const error = ref('')
const defaultDeadline = () => toLocalInput(Date.now() + 60 * 60 * 1000)
const form = ref({ shop_id: '', deadline: defaultDeadline(), note: '' })

const STATUS = { open: '進行中', closed: '已截止', locked: '已鎖單' }

async function load() {
  ;[groups.value, shops.value] = await Promise.all([api('/groups'), api('/shops')])
  if (!form.value.shop_id && shops.value.length) form.value.shop_id = shops.value[0].id
}
async function create() {
  error.value = ''
  try {
    const data = await api('/groups', {
      method: 'POST',
      body: {
        shop_id: Number(form.value.shop_id),
        deadline: new Date(form.value.deadline).toISOString(),
        note: form.value.note,
      },
    })
    location.hash = `#/groups/${data.group.id}`
  } catch (e) {
    error.value = e.message
  }
}
onMounted(() => load().catch((e) => (error.value = e.message)))
</script>

<template>
  <h2>開團</h2>
  <p v-if="error" class="error">{{ error }}</p>

  <p v-if="!shops.length" class="muted">
    還沒有店家，請先到<a href="#/shops">「店家與菜單」</a>新增店家和品項。
  </p>
  <form v-else class="card col" @submit.prevent="create">
    <div class="row">
      <label>店家
        <select v-model="form.shop_id" required>
          <option v-for="s in shops" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </label>
      <label>截止時間
        <input v-model="form.deadline" type="datetime-local" required />
      </label>
    </div>
    <label>團主附註
      <input v-model="form.note" maxlength="300" placeholder="例如：12:00 在一樓大廳取餐" />
    </label>
    <button class="primary">開團</button>
  </form>

  <h2>所有團</h2>
  <p v-if="!groups.length" class="muted">還沒有人開團。</p>
  <ul class="list">
    <li v-for="g in groups" :key="g.id" class="card">
      <div class="grow">
        <a :href="`#/groups/${g.id}`" class="title">{{ g.shop_name }}</a>
        <span :class="['badge', g.status]">{{ STATUS[g.status] }}</span>
        <div class="muted">
          {{ g.created_by }} 開團 · 截止 {{ fmtTime(g.deadline) }} · {{ g.order_count }} 筆 · {{ money(g.total) }}
        </div>
        <div v-if="g.note" class="muted">📝 {{ g.note }}</div>
      </div>
      <a :href="`#/groups/${g.id}`" class="btn">進入</a>
    </li>
  </ul>
</template>
