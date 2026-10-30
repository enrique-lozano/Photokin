<script setup lang="ts">
import { withBase } from 'vitepress';
import { ref } from 'vue';
import japanPhoto from '../assets/memories/japan-fushimi-inari.webp';
import giraffesPhoto from '../assets/memories/kenya-giraffes.webp';
import puffinPhoto from '../assets/memories/iceland-puffin.webp';
import fjordPhoto from '../assets/memories/norway-reine.webp';

const paused = ref(false);
const memories = [
  { photo: japanPhoto, caption: 'That long-awaited trip.' },
  { photo: giraffesPhoto, caption: 'Out in the wild.' },
  { photo: puffinPhoto, caption: 'An unexpected hello.' },
  { photo: fjordPhoto, caption: 'A view worth the journey.' },
];
</script>

<template>
  <div class="hero-scene">
    <a class="app-window" href="#explore" aria-label="Explore the real Photokin app">
      <img
        :src="withBase('/screenshots/app/albums.webp')"
        alt="Photokin's photo library, with folders and a timeline of travel, wildlife and space photos"
        width="2160"
        height="1350"
        fetchpriority="high"
      />
    </a>
    <figure class="memory-print" :class="{ 'is-paused': paused }">
      <div class="memory-slides" aria-hidden="true">
        <div
          v-for="(memory, index) in memories"
          :key="memory.photo"
          class="memory-slide"
          :style="{ '--memory-delay': `${index === 0 ? 0 : (index - memories.length) * 3}s` }"
        >
          <div class="memory-photo">
            <img :src="memory.photo" alt="" width="640" height="640" decoding="async" />
          </div>
          <p class="memory-caption">{{ memory.caption }}</p>
        </div>
      </div>
      <figcaption class="visually-hidden">
        Sample memories from Photokin's demo library: a trip to Japan, giraffes in Kenya, a puffin in Iceland
        and a fjord in Norway.
      </figcaption>
      <button
        class="memory-toggle"
        type="button"
        :aria-label="paused ? 'Play photo memories' : 'Pause photo memories'"
        @click="paused = !paused"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path v-if="paused" d="m8 5 10 7-10 7Z" />
          <path v-else d="M7 5h4v14H7zm6 0h4v14h-4z" />
        </svg>
      </button>
    </figure>
  </div>
</template>

<style scoped>
.hero-scene {
  position: relative;
  isolation: isolate;
  width: 100%;
  aspect-ratio: 1.25;
}

.hero-scene::before {
  position: absolute;
  z-index: -1;
  inset: 0 -4%;
  border-radius: 50%;
  background: radial-gradient(ellipse, var(--vp-c-brand-soft), transparent 70%);
  filter: blur(20px);
  content: '';
}

.app-window {
  position: absolute;
  top: 10%;
  right: 0;
  width: 96%;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--pk-navy);
  box-shadow: 0 32px 70px -24px rgb(7 12 28 / 0.45);
  transform: rotate(2deg);
}

.app-window img {
  display: block;
  width: 100%;
  height: auto;
}

.app-window:focus-visible {
  outline: 3px solid var(--vp-c-brand-1);
  outline-offset: 6px;
}

.memory-print {
  position: absolute;
  bottom: 4%;
  left: -2%;
  width: 31%;
  margin: 0;
  padding: 8px 8px 0;
  border: 1px solid rgb(7 12 28 / 0.08);
  background: var(--vp-c-white);
  box-shadow: 0 16px 40px -12px rgb(7 12 28 / 0.4);
  transform: rotate(-8deg);
}

.memory-slides {
  display: grid;
}

.memory-slide {
  grid-area: 1 / 1;
  min-width: 0;
  opacity: 0;
}

.memory-slide:first-child {
  opacity: 1;
}

.memory-photo {
  overflow: hidden;
  aspect-ratio: 1;
  background: var(--pk-navy);
}

.memory-photo img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.memory-caption {
  display: grid;
  align-items: center;
  min-height: 3.6em;
  margin: 0;
  padding: 8px 0;
  color: var(--pk-navy);
  text-align: center;
  font-family: Georgia, serif;
  font-size: clamp(12px, 1.1vw, 16px);
  font-style: italic;
  line-height: 1.3;
}

.memory-toggle {
  display: none;
  position: absolute;
  top: 14px;
  right: 14px;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid rgb(255 255 255 / 0.6);
  border-radius: 50%;
  background: var(--pk-navy);
  color: var(--vp-c-white);
}

.memory-toggle svg {
  width: 16px;
  height: 16px;
}

.memory-toggle:focus-visible {
  outline: 3px solid var(--pk-blue);
  outline-offset: 3px;
}

@keyframes memory-cycle {
  0%,
  21.6667%,
  100% {
    opacity: 1;
  }
  25%,
  96.6667% {
    opacity: 0;
  }
}

@keyframes scene-enter {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .hero-scene {
    animation: scene-enter 800ms 160ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
  }

  .app-window {
    transition: transform 300ms ease;
  }

  .memory-slide {
    animation: memory-cycle 12s linear infinite;
    animation-delay: var(--memory-delay);
  }

  .is-paused .memory-slide {
    animation-play-state: paused;
  }

  .memory-toggle {
    display: grid;
  }
}

@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
  .memory-toggle {
    opacity: 0;
    pointer-events: none;
    transition: opacity 150ms ease;
  }

  .memory-print:hover .memory-toggle,
  .memory-toggle:focus-visible {
    opacity: 1;
    pointer-events: auto;
  }

  .app-window:hover {
    transform: translateY(-4px) rotate(1deg);
  }
}

@media (max-width: 959px) {
  .hero-scene {
    max-width: 640px;
    margin: 0 auto;
    aspect-ratio: 1.4;
  }

  .memory-print {
    bottom: 0;
    left: 1%;
    width: 28%;
    padding: 5px 5px 0;
  }

  .memory-caption {
    font-size: 12px;
  }

  .memory-toggle {
    top: 9px;
    right: 9px;
  }
}
</style>
