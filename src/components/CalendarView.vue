<template>
  <Calendar :notebook="notebook" />
</template>
<script lang="ts" setup>
import { CusNotebook } from '@/utils/notebook';
import Calendar from './Calendar.vue';

defineProps<{ notebook: CusNotebook | undefined }>();
</script>

<style scoped>
/* 所有样式已移至 Calendar.vue */
</style>
