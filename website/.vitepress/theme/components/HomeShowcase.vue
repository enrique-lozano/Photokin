<script setup lang="ts">
import { useData, withBase } from 'vitepress';
import { VPFeatures } from 'vitepress/theme';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const { frontmatter, isDark } = useData();

const shots = [
  {
    id: 'albums',
    label: 'Library',
    hint: 'Every photo in your folders, grouped by month.',
    alt: 'Photokin photo library with folders, a timeline and photos grouped by month',
  },
  {
    id: 'people',
    label: 'People',
    hint: 'Faces found on your computer, ready to be named.',
    alt: 'Photokin People view showing named people and their face thumbnails',
  },
  {
    id: 'search',
    label: 'Search',
    hint: 'Describe a photo in your own words.',
    alt: 'Photokin smart search results for safari animals',
  },
  {
    id: 'places',
    label: 'Places',
    hint: 'Your trips on a map, down to the city.',
    alt: 'Photokin Places map with photo pins around the world',
  },
  {
    id: 'tags',
    label: 'Tags',
    hint: 'Nested tags that other photo apps can read too.',
    alt: 'Photokin Tags view with nested tags and their photo collections',
  },
  {
    id: 'viewer',
    label: 'Photo details',
    hint: 'Camera, place and people behind every shot.',
    alt: 'Photokin photo viewer displaying Fushimi Inari with the photo details panel open',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    hint: 'Jump to any day you took photos.',
    alt: 'Photokin Calendar view with a month picker and photos from the selected month',
  },
  { id: 'appearance', label: 'Appearance', hint: '', alt: '' },
];

const themes = [
  { id: 'photokin', label: 'Photokin', color: 'hsl(221 83% 53%)' },
  { id: 'slack', label: 'Slack', color: 'hsl(266 84% 56%)' },
  { id: 'spotify', label: 'Spotify', color: 'hsl(141 73% 42%)' },
] as const;

const modes = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
] as const;

type ThemeId = (typeof themes)[number]['id'];
type ModeId = (typeof modes)[number]['id'];

const selected = ref(0);
const theme = ref<ThemeId>('photokin');
const mode = ref<ModeId>('dark');
const transition = ref('shot-next');

const active = computed(() => shots[selected.value]);
const isAppearance = computed(() => active.value.id === 'appearance');
const themeLabel = computed(() => themes.find((option) => option.id === theme.value)!.label);
const imageName = computed(() =>
  isAppearance.value ? `theme-${theme.value}-${mode.value}` : active.value.id,
);
const image = computed(() => screenshotUrl(imageName.value));
const imageAlt = computed(() =>
  isAppearance.value
    ? `Photokin photo library with the ${themeLabel.value} theme in ${mode.value} mode`
    : active.value.alt,
);
const previewLabel = computed(() =>
  isAppearance.value ? `Appearance: ${themeLabel.value}, ${mode.value}` : active.value.label,
);

const tablist = ref<HTMLElement>();
const tabs: HTMLButtonElement[] = [];
const indicator = ref({ left: 0, width: 0, animate: false });
const viewer = ref<HTMLDialogElement>();

function screenshotUrl(name: string) {
  return withBase(`/screenshots/app/${name}.webp`);
}

const preloaded = new Set<string>();
function preload(name: string) {
  if (preloaded.has(name)) return;
  preloaded.add(name);
  new Image().src = screenshotUrl(name);
}

function preloadShot(index: number) {
  if (shots[index].id !== 'appearance') return preload(shots[index].id);
  for (const option of themes) for (const { id } of modes) preload(`theme-${option.id}-${id}`);
}

function select(index: number) {
  if (index === selected.value) return;
  transition.value = index > selected.value ? 'shot-next' : 'shot-prev';
  preloadShot(index);
  selected.value = index;
}

function chooseTheme(id: ThemeId) {
  transition.value = 'shot-fade';
  theme.value = id;
}

function chooseMode(id: ModeId) {
  transition.value = 'shot-fade';
  mode.value = id;
}

function moveTab(event: KeyboardEvent, index: number) {
  let next: number;
  switch (event.key) {
    case 'ArrowRight':
      next = (index + 1) % shots.length;
      break;
    case 'ArrowLeft':
      next = (index + shots.length - 1) % shots.length;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = shots.length - 1;
      break;
    default:
      return;
  }
  event.preventDefault();
  select(next);
  tabs[next]?.focus();
}

function placeIndicator() {
  const tab = tabs[selected.value];
  if (!tab) return;
  indicator.value = { ...indicator.value, left: tab.offsetLeft, width: tab.offsetWidth };
}

let resizeObserver: ResizeObserver | undefined;

onMounted(() => {
  mode.value = isDark.value ? 'dark' : 'light';
  placeIndicator();
  // Enable the sliding animation only after the first placement.
  requestAnimationFrame(() => (indicator.value.animate = true));
  resizeObserver = new ResizeObserver(placeIndicator);
  for (const tab of tabs) resizeObserver.observe(tab);
});

onBeforeUnmount(() => resizeObserver?.disconnect());

watch(selected, async () => {
  await nextTick();
  placeIndicator();
  const list = tablist.value;
  const tab = tabs[selected.value];
  if (!list || !tab || list.scrollWidth <= list.clientWidth) return;
  list.scrollTo({ left: tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2, behavior: 'smooth' });
});
</script>

<template>
  <section id="explore" class="showcase" aria-labelledby="explore-title">
    <h2 id="explore-title">Your library, from every angle.</h2>

    <div ref="tablist" class="feature-tabs" role="tablist" aria-label="Explore Photokin features">
      <span
        v-show="indicator.width"
        class="tab-indicator"
        :class="{ animate: indicator.animate }"
        :style="{ width: `${indicator.width}px`, transform: `translateX(${indicator.left}px)` }"
        aria-hidden="true"
      />
      <button
        v-for="(shot, index) in shots"
        :id="`tab-${shot.id}`"
        :key="shot.id"
        :ref="(element) => (tabs[index] = element as HTMLButtonElement)"
        type="button"
        role="tab"
        :aria-selected="selected === index"
        aria-controls="showcase-panel"
        :tabindex="selected === index ? 0 : -1"
        @click="select(index)"
        @keydown="moveTab($event, index)"
        @pointerenter="preloadShot(index)"
      >
        {{ shot.label }}
      </button>
    </div>

    <div class="tour-caption">
      <Transition name="caption" mode="out-in">
        <div v-if="isAppearance" key="appearance" class="appearance-controls">
          <fieldset class="mode-toggle">
            <legend class="visually-hidden">Mode</legend>
            <label v-for="option in modes" :key="option.id" :class="{ selected: mode === option.id }">
              <input
                type="radio"
                name="showcase-mode"
                :value="option.id"
                :checked="mode === option.id"
                @change="chooseMode(option.id)"
              />
              <svg v-if="option.id === 'light'" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path
                  d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
                />
              </svg>
              <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
              </svg>
              {{ option.label }}
            </label>
          </fieldset>

          <fieldset class="theme-options">
            <legend class="visually-hidden">Color theme</legend>
            <label
              v-for="option in themes"
              :key="option.id"
              :class="{ selected: theme === option.id }"
              :style="{ '--swatch': option.color }"
            >
              <input
                type="radio"
                name="showcase-theme"
                :value="option.id"
                :checked="theme === option.id"
                @change="chooseTheme(option.id)"
              />
              <span class="theme-swatch" aria-hidden="true" />
              {{ option.label }}
            </label>
          </fieldset>
        </div>
        <p v-else :key="active.id" class="hint">{{ active.hint }}</p>
      </Transition>
    </div>

    <div id="showcase-panel" role="tabpanel" :aria-labelledby="`tab-${active.id}`">
      <button
        class="screenshot-button"
        type="button"
        :aria-label="`Enlarge ${active.label.toLowerCase()} screenshot`"
        @click="viewer?.showModal()"
      >
        <Transition :name="transition">
          <img :key="image" :src="image" :alt="imageAlt" width="2160" height="1350" decoding="async" />
        </Transition>
      </button>
    </div>

    <div class="why-header">
      <p class="eyebrow">Why Photokin</p>
      <h2>Your photos, your rules.</h2>
      <p class="why-subtitle">
        Built around the folders you already have &mdash; private, local, and free.
      </p>
    </div>

    <VPFeatures class="guide-cards" :features="frontmatter.showcaseFeatures" />

    <p class="credits">
      Screenshots from a demo library. Photos by NASA and Wikimedia Commons photographers.
      <a href="https://github.com/enrique-lozano/Photokin/blob/main/demo/showcase/ATTRIBUTION.md"
        >Photo credits</a
      >
    </p>

    <dialog
      ref="viewer"
      class="screenshot-dialog"
      :aria-label="`${previewLabel} screenshot`"
      @click="$event.target === viewer && viewer?.close()"
    >
      <div class="viewer-toolbar">
        <span>{{ previewLabel }} <span class="viewer-note"> / Photokin</span></span>
        <div class="viewer-actions">
          <a :href="image" target="_blank" rel="noopener"
            >Open original <span aria-hidden="true">&nearr;</span></a
          >
          <button type="button" autofocus @click="viewer?.close()">
            Close <span aria-hidden="true">&times;</span>
          </button>
        </div>
      </div>
      <img :src="image" :alt="imageAlt" width="2160" height="1350" />
    </dialog>
  </section>
</template>

<style scoped>
.showcase {
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);

  max-width: 1280px;
  margin: 0 auto;
  padding: 16px 64px 0;
  scroll-margin-top: 88px;
}

h2 {
  font-size: clamp(24px, 3vw, 32px);
  font-weight: 650;
  line-height: 1.25;
  letter-spacing: -0.035em;
  text-align: center;
}

.feature-tabs {
  position: relative;
  display: flex;
  gap: 2px;
  width: fit-content;
  max-width: 100%;
  margin: 28px auto 0;
  padding: 4px;
  overflow-x: auto;
  scrollbar-width: none;
}

.feature-tabs::-webkit-scrollbar {
  display: none;
}

.tab-indicator {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 0;
  border-radius: 999px;
  background: var(--vp-c-text-1);
}

.tab-indicator.animate {
  transition:
    transform 0.45s var(--ease-out),
    width 0.45s var(--ease-out);
}

.feature-tabs button {
  position: relative;
  flex: 0 0 auto;
  padding: 8px 16px;
  border-radius: 999px;
  color: var(--vp-c-text-2);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  transition: color 0.3s var(--ease-out);
}

.feature-tabs button:hover {
  color: var(--vp-c-text-1);
}

.feature-tabs button[aria-selected='true'] {
  color: var(--vp-c-bg);
}

button:focus-visible,
a:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}

.tour-caption {
  display: grid;
  place-items: center;
  min-height: 44px;
  margin: 10px 0 20px;
}

.hint {
  color: var(--vp-c-text-2);
  font-size: 15px;
  text-align: center;
}

.caption-enter-active,
.caption-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.25s var(--ease-out);
}

.caption-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.caption-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.appearance-controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px 16px;
}

fieldset {
  display: flex;
  gap: 4px;
  min-width: 0;
  margin: 0;
  padding: 3px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
}

fieldset label {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 12px;
  border-radius: 999px;
  color: var(--vp-c-text-2);
  font-size: 13px;
  font-weight: 500;
  line-height: 24px;
  cursor: pointer;
  transition:
    color 0.2s,
    background-color 0.2s;
}

fieldset label:hover,
fieldset label.selected {
  color: var(--vp-c-text-1);
}

fieldset label.selected {
  background: var(--vp-c-default-soft);
}

fieldset label:has(:focus-visible) {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

fieldset svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.theme-swatch {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--swatch);
  transition: box-shadow 0.25s var(--ease-out);
}

.theme-options label.selected .theme-swatch {
  box-shadow:
    0 0 0 2px var(--vp-c-bg),
    0 0 0 3.5px var(--swatch);
}

.visually-hidden,
fieldset input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.screenshot-button {
  display: grid;
  width: 100%;
  overflow: hidden;
  border-radius: 14px;
  background: var(--pk-navy);
  box-shadow:
    0 0 0 1px var(--vp-c-divider),
    0 30px 70px -30px rgb(7 12 28 / 0.55);
  cursor: zoom-in;
}

.screenshot-button img {
  grid-area: 1 / 1;
  display: block;
  width: 100%;
  height: auto;
}

.shot-next-enter-active,
.shot-next-leave-active,
.shot-prev-enter-active,
.shot-prev-leave-active {
  transition:
    opacity 0.4s ease,
    transform 0.6s var(--ease-out);
}

.shot-fade-enter-active,
.shot-fade-leave-active {
  transition: opacity 0.35s ease;
}

.shot-next-enter-from,
.shot-prev-leave-to {
  opacity: 0;
  transform: translateX(4%) scale(0.98);
}

.shot-next-leave-to,
.shot-prev-enter-from {
  opacity: 0;
  transform: translateX(-4%) scale(0.98);
}

.shot-fade-enter-from,
.shot-fade-leave-to {
  opacity: 0;
}

.why-header {
  margin-top: 112px;
  text-align: center;
}

.eyebrow {
  margin-bottom: 12px;
  color: var(--vp-c-brand-1);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.why-subtitle {
  max-width: 520px;
  margin: 12px auto 0;
  color: var(--vp-c-text-2);
  font-size: 16px;
  line-height: 1.6;
}

.guide-cards.VPFeatures {
  margin-top: 32px;
  padding: 0;
}

.guide-cards :deep(.container) {
  max-width: none;
}

.credits {
  margin-top: 24px;
  color: var(--vp-c-text-2);
  text-align: center;
  font-size: 12px;
  line-height: 1.7;
}

.credits a {
  color: var(--vp-c-brand-1);
}

.credits a:hover,
.viewer-actions a:hover {
  text-decoration: underline;
}

.screenshot-dialog {
  width: min(96vw, 2000px);
  max-width: 96vw;
  max-height: 94dvh;
  margin: auto;
  padding: 0;
  overflow: auto;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  box-shadow: 0 30px 90px rgb(0 0 0 / 0.4);
}

.screenshot-dialog::backdrop {
  background: rgb(7 12 28 / 0.85);
}

.viewer-toolbar,
.viewer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.viewer-toolbar {
  position: sticky;
  top: 0;
  padding: 12px 16px;
  background: var(--vp-c-bg);
  font-size: 14px;
}

.viewer-note {
  color: var(--vp-c-text-2);
}

.viewer-actions button {
  padding: 5px 12px;
  border-radius: 6px;
  background: var(--vp-c-default-soft);
  font-weight: 600;
}

.screenshot-dialog img {
  display: block;
  width: 100%;
  height: auto;
}

@media (max-width: 767px) {
  .showcase {
    padding: 8px 24px 0;
  }

  .why-header {
    margin-top: 72px;
  }

  .feature-tabs {
    mask-image: linear-gradient(90deg, transparent, #000 16px, #000 calc(100% - 16px), transparent);
  }

  .feature-tabs button {
    padding: 7px 14px;
  }

  .viewer-note {
    display: none;
  }

  .viewer-toolbar,
  .viewer-actions {
    gap: 12px;
    font-size: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .showcase *,
  .showcase *::before {
    transition: none !important;
  }
}
</style>
