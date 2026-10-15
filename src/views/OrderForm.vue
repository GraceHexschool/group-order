<script setup>
import { ref, watch } from 'vue'
import { api, money } from '../api.js'

// 直接輸入餐點與價格就能點餐；menu 只是輸入時的建議（選到會自動帶入價格）
const props = defineProps({ groupId: Number, menu: { type: Array, default: () => [] } })
const emit = defineEmits(['added'])

const form = ref({ item_name: '', unit_price: '', quantity: 1, note: '' })
const error = ref('')
const busy = ref(false)
const listId = `menu-${props.groupId}`
const pick = ref('')

// 從菜單下拉選一項，就帶入餐點和價格（之後仍可自己改）
function choose() {
  const hit = props.menu.find((m) => m.id === Number(pick.value))
  if (hit) {
    form.value.item_name = hit.name
    form.value.unit_price = hit.price
  }
  pick.value = ''
}

watch(
  () => form.value.item_name,
  (name) => {
    const hit = props.menu.find((m) => m.name === name.trim())
    if (hit) form.value.unit_price = hit.price
  },
)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await api(`/groups/${props.groupId}/orders`, {
      method: 'POST',
      body: {
        item_name: form.value.item_name,
        unit_price: form.value.unit_price,
        quantity: form.value.quantity,
        note: form.value.note,
      },
    })
    form.value = { item_name: '', unit_price: '', quantity: 1, note: '' }
    emit('added')
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="col" @submit.prevent="submit">
    <select v-if="menu.length" v-model="pick" class="pick" @change="choose">
      <option value="">📋 從菜單選（{{ menu.length }} 項）</option>
      <option v-for="m in menu" :key="m.id" :value="m.id">{{ m.name }}　{{ money(m.price) }}</option>
    </select>
    <div class="row">
      <input v-model="form.item_name" :list="listId" maxlength="50" placeholder="想吃什麼？" required />
      <input v-model="form.unit_price" type="number" min="0" step="1" class="price" placeholder="價格" required />
      <input v-model="form.quantity" type="number" min="1" max="99" class="qty" title="數量" required />
      <input v-model="form.note" maxlength="100" placeholder="備註（少冰、不要香菜…）" />
      <button class="primary" :disabled="busy">加入</button>
    </div>
    <datalist :id="listId">
      <option v-for="m in menu" :key="m.id" :value="m.name">{{ money(m.price) }}</option>
    </datalist>
    <p v-if="error" class="error">{{ error }}</p>
  </form>
</template>
