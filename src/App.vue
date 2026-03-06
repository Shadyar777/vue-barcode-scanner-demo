<script setup lang="ts">
import BarcodeScannerPanel from './features/barcode-scanner/components/BarcodeScannerPanel.vue'
import { ScannerDemo } from '@/shared/lib/web-scanner'
</script>

<template>
  <main class="min-h-screen bg-slate-50 p-4 sm:p-8">
    <div class="mx-auto w-full max-w-4xl">
      <!--      <BarcodeScannerPanel />-->
      <ScannerDemo />
    </div>
  </main>
</template>