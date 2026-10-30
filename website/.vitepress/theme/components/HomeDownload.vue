<script setup lang="ts">
import { withBase } from 'vitepress';
</script>

<template>
  <section class="download" aria-labelledby="download-title">
    <h2 id="download-title">Bring your photos home</h2>
    <p>
      Free for Windows and macOS (Apple silicon). No account, no subscription, and your photos never leave
      your computer.
    </p>
    <div class="actions">
      <a class="button brand" href="https://github.com/enrique-lozano/Photokin/releases/latest"
        >Download Photokin</a
      >
      <a class="button alt" :href="withBase('/guide/getting-started')">Install guide</a>
    </div>
  </section>
</template>

<style scoped>
.download {
  max-width: 1152px;
  margin: 80px auto 96px;
  padding: 56px 32px;
  border-radius: 24px;
  text-align: center;
  color: #fff;
  background:
    radial-gradient(60% 90% at 100% 0%, rgb(91 61 240 / 0.6), transparent 70%),
    radial-gradient(50% 80% at 0% 100%, rgb(47 109 240 / 0.5), transparent 70%),
    linear-gradient(160deg, #14234a, #070c1c);
}

h2 {
  font-size: 32px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.02em;
}

p {
  max-width: 560px;
  margin: 12px auto 28px;
  color: rgb(255 255 255 / 0.78);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}

.button {
  display: inline-block;
  padding: 0 22px;
  border-radius: 20px;
  font-size: 15px;
  font-weight: 600;
  line-height: 40px;
  text-decoration: none;
  transition: background-color 0.2s ease;
}

.brand {
  background: var(--pk-blue);
}

.brand:hover {
  background: #4a80f2;
}

.alt {
  background: rgb(255 255 255 / 0.12);
}

.alt:hover {
  background: rgb(255 255 255 / 0.2);
}

@media (max-width: 1199px) {
  .download {
    margin-right: 24px;
    margin-left: 24px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .button {
    transition: none;
  }
}
</style>
