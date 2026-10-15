<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { setUserName, userName } from './api.js'
import GroupsView from './views/GroupsView.vue'
import GroupView from './views/GroupView.vue'
import ShopsView from './views/ShopsView.vue'
import MenuView from './views/MenuView.vue'

const hash = ref(location.hash || '#/')
const onHash = () => (hash.value = location.hash || '#/')
onMounted(() => addEventListener('hashchange', onHash))
onBeforeUnmount(() => removeEventListener('hashchange', onHash))

const route = computed(() => {
  const parts = hash.value.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'groups' && parts[1]) return { view: GroupView, props: { id: Number(parts[1]) }, tab: 'groups' }
  if (parts[0] === 'shops' && parts[1]) return { view: MenuView, props: { shopId: Number(parts[1]) }, tab: 'shops' }
  if (parts[0] === 'shops') return { view: ShopsView, props: {}, tab: 'shops' }
  return { view: GroupsView, props: {}, tab: 'groups' }
})

const draft = ref('')
const editingName = ref(false)
const save = () => {
  if (!draft.value.trim()) return
  setUserName(draft.value)
  editingName.value = false
}
const startEdit = () => {
  draft.value = userName.value
  editingName.value = true
}
</script>

<template>
  <div v-if="!userName || editingName" class="welcome">
    <form class="card" @submit.prevent="save">
      <h1>🍱 團購訂餐</h1>
      <p>請輸入你的名字，同事會看到你點的餐。</p>
      <input v-model="draft" maxlength="30" placeholder="例如：小明" autofocus />
      <button class="primary" :disabled="!draft.trim()">開始使用</button>
      <button v-if="editingName" type="button" @click="editingName = false">取消</button>
    </form>
  </div>

  <div v-else class="app">
    <header>
      <a class="brand" href="#/">🍱 團購訂餐</a>
      <nav>
        <a href="#/" :class="{ active: route.tab === 'groups' }">團購</a>
        <a href="#/shops" :class="{ active: route.tab === 'shops' }">店家與菜單</a>
      </nav>
      <button class="link" @click="startEdit">👤 {{ userName }}</button>
    </header>
    <main>
      <component :is="route.view" v-bind="route.props" :key="hash" />
    </main>
  </div>
</template>
