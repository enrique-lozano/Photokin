<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { withBase } from 'vitepress';

type Os = 'windows' | 'macos';

interface Asset {
  name: string;
  browser_download_url: string;
}

const REPO = 'enrique-lozano/Photokin';
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

const PLATFORMS: Record<Os, { label: string; detail: string; match: RegExp }> = {
  windows: { label: 'Windows', detail: 'Windows 10 or 11 (64-bit) · .exe installer', match: /\.exe$/i },
  macos: { label: 'macOS', detail: 'Mac with Apple silicon (M1 or newer) · .dmg', match: /\.dmg$/i },
};

const detected = ref<Os | null>(null);
const unsupported = ref(false);
const version = ref<string | null>(null);
const assets = ref<Asset[]>([]);

function detectOs(): Os | 'other' {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = (nav.userAgentData?.platform || nav.userAgent).toLowerCase();

  // iPadOS reports a Mac user agent, so check for touch to rule it out.
  if (/iphone|ipad|android|linux|cros/.test(platform) || (/mac/.test(platform) && nav.maxTouchPoints > 1)) {
    return 'other';
  }
  if (/win/.test(platform)) return 'windows';
  if (/mac/.test(platform)) return 'macos';
  return 'other';
}

function urlFor(os: Os) {
  return assets.value.find((a) => PLATFORMS[os].match.test(a.name))?.browser_download_url ?? RELEASES_URL;
}

const platformOrder = computed<Os[]>(() => {
  const all: Os[] = ['windows', 'macos'];
  return detected.value ? [detected.value, ...all.filter((os) => os !== detected.value)] : all;
});

onMounted(async () => {
  const os = detectOs();
  detected.value = os === 'other' ? null : os;
  unsupported.value = os === 'other';

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (!res.ok) return;
    const release = await res.json();
    version.value = release.tag_name ?? null;
    assets.value = release.assets ?? [];
  } catch {
    // Offline or rate limited: buttons fall back to the releases page.
  }
});
</script>

<template>
  <section class="download-page">
    <h1>Download Photokin</h1>
    <p class="lead">Free and open source. No account needed, and your photos never leave your computer.</p>

    <template v-if="detected">
      <a class="button brand" :href="urlFor(detected)">Download for {{ PLATFORMS[detected].label }}</a>
      <p class="meta">
        {{ PLATFORMS[detected].detail }}<template v-if="version"> · {{ version }}</template>
      </p>
    </template>
    <template v-else-if="unsupported">
      <p class="notice">
        Photokin isn't available for your device yet. It runs on Windows and on Macs with Apple silicon. Open
        this page from one of those computers to download it.
      </p>
    </template>
    <a v-else class="button brand" :href="RELEASES_URL">Download Photokin</a>

    <h2>All downloads</h2>
    <ul class="platforms">
      <li v-for="os in platformOrder" :key="os">
        <a :href="urlFor(os)">
          <strong>{{ PLATFORMS[os].label }}</strong>
          <span>{{ PLATFORMS[os].detail }}</span>
        </a>
      </li>
    </ul>
    <p class="meta">
      Linux and Intel Macs aren't available yet. Photokin isn't code-signed, so your system may warn you the
      first time. See the
      <a :href="withBase('/guide/getting-started')">install guide</a> for the steps, or browse
      <a :href="RELEASES_URL">every release</a>.
    </p>
  </section>
</template>

<style scoped>
.download-page {
  max-width: 640px;
  margin: 0 auto;
  padding: calc(var(--vp-nav-height) + 64px) 24px 96px;
  text-align: center;
}

h1 {
  font-size: 40px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

h2 {
  margin: 56px 0 16px;
  font-size: 18px;
  font-weight: 600;
}

.lead {
  margin: 12px 0 32px;
  color: var(--vp-c-text-2);
}

.meta {
  margin-top: 12px;
  font-size: 14px;
  color: var(--vp-c-text-2);
}

.notice {
  padding: 16px 20px;
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}

.button {
  display: inline-block;
  padding: 0 28px;
  border-radius: 24px;
  font-size: 16px;
  font-weight: 600;
  line-height: 48px;
  color: #fff;
  text-decoration: none;
  background: var(--pk-blue);
  transition: background-color 0.2s ease;
}

.button:hover {
  background: #4a80f2;
}

.platforms {
  display: grid;
  gap: 12px;
  padding: 0;
  list-style: none;
  text-align: left;
}

.platforms a {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 14px 18px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  text-decoration: none;
  color: var(--vp-c-text-1);
  transition: border-color 0.2s ease;
}

.platforms a:hover {
  border-color: var(--vp-c-brand-1);
}

.platforms span {
  font-size: 14px;
  color: var(--vp-c-text-2);
}

@media (prefers-reduced-motion: reduce) {
  .button,
  .platforms a {
    transition: none;
  }
}
</style>
