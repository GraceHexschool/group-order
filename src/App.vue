<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { signOut, user } from './api.js'
import LoginView from './LoginView.vue'
import GroupsView from './views/GroupsView.vue'
import GroupView from './views/GroupView.vue'
import ShopsView from './views/ShopsView.vue'
import MenuView from './views/MenuView.vue'

const hash = ref(location.hash || '#/')
const onHash = () => (hash.value = location.hash || '#/')

// 通行證約 1 小時過期：到期就回到登入畫面
let expiryTimer
onMounted(() => {
  addEventListener('hashchange', onHash)
  expiryTimer = setInterval(() => {
    if (user.value && user.value.exp * 1000 <= Date.now()) signOut('登入已過期，請重新登入')
  }, 30000)
})
onBeforeUnmount(() => {
  removeEventListener('hashchange', onHash)
  clearInterval(expiryTimer)
})

const route = computed(() => {
  const parts = hash.value.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'groups' && parts[1]) return { view: GroupView, props: { id: Number(parts[1]) }, tab: 'groups' }
  if (parts[0] === 'shops' && parts[1]) return { view: MenuView, props: { shopId: Number(parts[1]) }, tab: 'shops' }
  if (parts[0] === 'shops') return { view: ShopsView, props: {}, tab: 'shops' }
  return { view: GroupsView, props: {}, tab: 'groups' }
})
</script>

<template>
  <LoginView v-if="!user" />

  <div v-else class="app">
    <header>
      <a class="brand" href="#/">🍱 團購訂餐</a>
      <nav>
        <a href="#/" :class="{ active: route.tab === 'groups' }">團購</a>
        <a href="#/shops" :class="{ active: route.tab === 'shops' }">店家與菜單</a>
      </nav>
      <div class="me" :title="user.email">
        <img v-if="user.picture" :src="user.picture" alt="" class="avatar" referrerpolicy="no-referrer" />
        <span>{{ user.name }}</span>
        <button @click="signOut()">登出</button>
      </div>
    </header>
    <main>
      <component :is="route.view" v-bind="route.props" :key="hash" />
    </main>
  </div>
</template>
