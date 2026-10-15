<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { api, fmtTime, imageSrc, money, toLocalInput, userName } from '../api.js'

const props = defineProps({ id: Number })

const group = ref(null)
const menu = ref([])
const orders = ref([])
const error = ref('')
const form = ref({ menu_item_id: '', quantity: 1, note: '' })
const editingOrder = ref(null) // { id, quantity, note }
const editingGroup = ref(null) // { deadline, note }
const now = ref(Date.now())
let timer

const STATUS = { open: '進行中', closed: '已截止', locked: '已鎖單' }

const isOwner = computed(() => group.value?.created_by === userName.value)
// 用 now 即時判斷，截止時間一到畫面就自動變成已截止
const status = computed(() => {
  const g = group.value
  if (!g) return 'open'
  if (g.locked) return 'locked'
  return new Date(g.deadline).getTime() <= now.value ? 'closed' : 'open'
})
const isOpen = computed(() => status.value === 'open')

const total = computed(() => orders.value.reduce((s, o) => s + o.unit_price * o.quantity, 0))
const paidTotal = computed(() =>
  orders.value.filter((o) => o.paid).reduce((s, o) => s + o.unit_price * o.quantity, 0),
)

const byPerson = computed(() => {
  const map = new Map()
  for (const o of orders.value) {
    if (!map.has(o.created_by)) map.set(o.created_by, { name: o.created_by, orders: [], sum: 0 })
    const p = map.get(o.created_by)
    p.orders.push(o)
    p.sum += o.unit_price * o.quantity
  }
  return [...map.values()]
})

const byItem = computed(() => {
  const map = new Map()
  for (const o of orders.value) {
    const key = `${o.item_name}|${o.unit_price}`
    const row = map.get(key) || { name: o.item_name, price: o.unit_price, qty: 0 }
    row.qty += o.quantity
    map.set(key, row)
  }
  return [...map.values()]
})

async function load() {
  const data = await api(`/groups/${props.id}`)
  group.value = data.group
  menu.value = data.menu
  orders.value = data.orders
  if (!form.value.menu_item_id && menu.value.length) form.value.menu_item_id = menu.value[0].id
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

const addOrder = () =>
  run(async () => {
    await api(`/groups/${props.id}/orders`, {
      method: 'POST',
      body: { ...form.value, menu_item_id: Number(form.value.menu_item_id) },
    })
    form.value.quantity = 1
    form.value.note = ''
  })
const saveOrder = () =>
  run(async () => {
    await api(`/orders/${editingOrder.value.id}`, {
      method: 'PUT',
      body: { quantity: Number(editingOrder.value.quantity), note: editingOrder.value.note },
    })
    editingOrder.value = null
  })
const removeOrder = (o) => {
  if (confirm(`刪除「${o.item_name}」？`)) run(() => api(`/orders/${o.id}`, { method: 'DELETE' }))
}
const togglePaid = (o) =>
  run(() => api(`/orders/${o.id}`, { method: 'PUT', body: { paid: !o.paid } }))
const setLocked = (locked) =>
  run(() => api(`/groups/${props.id}`, { method: 'PUT', body: { locked } }))
const startEditGroup = () =>
  (editingGroup.value = { deadline: toLocalInput(group.value.deadline), note: group.value.note })
const saveGroup = () =>
  run(async () => {
    await api(`/groups/${props.id}`, {
      method: 'PUT',
      body: {
        deadline: new Date(editingGroup.value.deadline).toISOString(),
        note: editingGroup.value.note,
      },
    })
    editingGroup.value = null
  })
async function removeGroup() {
  if (!confirm('確定刪除整個團與所有點餐？')) return
  try {
    await api(`/groups/${props.id}`, { method: 'DELETE' })
    location.hash = '#/'
  } catch (e) {
    error.value = e.message
  }
}

onMounted(() => {
  load().catch((e) => (error.value = e.message))
  // 每 10 秒同步同事的點餐；編輯中不重抓，避免蓋掉輸入
  timer = setInterval(() => {
    now.value = Date.now()
    if (!editingOrder.value && !editingGroup.value && now.value % 10000 < 1000) load().catch(() => {})
  }, 1000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <p><a href="#/">← 回團購列表</a></p>
  <p v-if="error" class="error">{{ error }}</p>

  <template v-if="group">
    <div class="card col">
      <div class="row">
        <h2 class="grow">{{ group.shop_name }}
          <span :class="['badge', status]">{{ STATUS[status] }}</span>
        </h2>
      </div>
      <div class="muted">{{ group.created_by }} 開團 · 截止 {{ fmtTime(group.deadline) }}</div>
      <div v-if="group.note" class="note">📝 {{ group.note }}</div>

      <form v-if="editingGroup" class="row" @submit.prevent="saveGroup">
        <input v-model="editingGroup.deadline" type="datetime-local" required />
        <input v-model="editingGroup.note" maxlength="300" placeholder="團主附註" />
        <button class="primary">儲存</button>
        <button type="button" @click="editingGroup = null">取消</button>
      </form>
      <div v-else-if="isOwner" class="row">
        <button v-if="!group.locked" @click="setLocked(true)">🔒 鎖單</button>
        <button v-else @click="setLocked(false)">🔓 重新開放</button>
        <button @click="startEditGroup">修改截止時間／附註</button>
        <button class="danger" @click="removeGroup">刪除這個團</button>
      </div>
    </div>

    <details v-if="group.shop_menu_image_url" class="card col">
      <summary>📷 看菜單照片</summary>
      <a :href="group.shop_menu_image_url" target="_blank" rel="noopener">
        <img :src="imageSrc(group.shop_menu_image_url)" alt="菜單照片" class="menu-img" loading="lazy" />
      </a>
    </details>

    <h3>我要點餐</h3>
    <p v-if="!isOpen" class="muted">這個團已{{ status === 'locked' ? '鎖單' : '截止' }}，不能再點餐。</p>
    <p v-else-if="!menu.length" class="muted">
      這家店還沒有菜單，請先<a :href="`#/shops/${group.shop_id}`">新增品項</a>。
    </p>
    <form v-else class="card row" @submit.prevent="addOrder">
      <select v-model="form.menu_item_id" required>
        <option v-for="m in menu" :key="m.id" :value="m.id">{{ m.name }}　{{ money(m.price) }}</option>
      </select>
      <input v-model="form.quantity" type="number" min="1" max="99" class="qty" required />
      <input v-model="form.note" maxlength="100" placeholder="備註（少冰、不要香菜…）" />
      <button class="primary">加入</button>
    </form>

    <h3>大家點的餐（{{ orders.length }} 筆）</h3>
    <p v-if="!orders.length" class="muted">還沒有人點餐。</p>
    <div v-for="p in byPerson" :key="p.name" class="card col">
      <div class="row">
        <strong class="grow">{{ p.name }}</strong>
        <strong>{{ money(p.sum) }}</strong>
      </div>
      <div v-for="o in p.orders" :key="o.id" class="row order">
        <template v-if="editingOrder?.id === o.id">
          <span class="grow">{{ o.item_name }}</span>
          <input v-model="editingOrder.quantity" type="number" min="1" max="99" class="qty" />
          <input v-model="editingOrder.note" maxlength="100" placeholder="備註" />
          <button class="primary" @click="saveOrder">儲存</button>
          <button @click="editingOrder = null">取消</button>
        </template>
        <template v-else>
          <span class="grow">
            {{ o.item_name }} × {{ o.quantity }}
            <span class="muted">{{ money(o.unit_price * o.quantity) }}</span>
            <span v-if="o.note" class="muted"> · {{ o.note }}</span>
          </span>
          <label class="paid" :title="isOwner ? '' : '只有團主可以勾選'">
            <input type="checkbox" :checked="o.paid" :disabled="!isOwner" @change="togglePaid(o)" />
            已付款
          </label>
          <template v-if="o.created_by === userName && isOpen">
            <button @click="editingOrder = { id: o.id, quantity: o.quantity, note: o.note }">編輯</button>
            <button class="danger" @click="removeOrder(o)">刪除</button>
          </template>
        </template>
      </div>
    </div>

    <template v-if="orders.length">
      <h3>品項彙整（下單用）</h3>
      <div class="card col">
        <div v-for="r in byItem" :key="r.name + r.price" class="row">
          <span class="grow">{{ r.name }}</span>
          <strong>× {{ r.qty }}</strong>
          <span class="muted">{{ money(r.price * r.qty) }}</span>
        </div>
        <div class="row total">
          <strong class="grow">全團總金額</strong>
          <strong>{{ money(total) }}</strong>
        </div>
        <div class="muted">已收 {{ money(paidTotal) }}　未收 {{ money(total - paidTotal) }}</div>
      </div>
    </template>
  </template>
</template>
