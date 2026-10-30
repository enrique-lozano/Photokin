import { defineConfig } from 'vitepress';

const REPO = 'https://github.com/enrique-lozano/Photokin';

export default defineConfig({
  base: '/Photokin/',
  title: 'Photokin',
  description: 'A local-first desktop photo gallery. Your photos, organized on your own computer.',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,
  // Build output and cache live in node_modules so they never end up in git.
  outDir: '../node_modules/.cache/photokin-website/dist',
  cacheDir: '../node_modules/.cache/photokin-website/cache',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/Photokin/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#2f6df0' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Photokin' }],
    ['meta', { property: 'og:description', content: 'Your photos, organized on your own computer.' }],
    [
      'meta',
      {
        property: 'og:image',
        content: 'https://enrique-lozano.github.io/Photokin/screenshots/01-library.webp',
      },
    ],
  ],

  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/', activeMatch: '/guide/' },
      { text: 'Download', link: `${REPO}/releases/latest` },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Start here',
          items: [
            { text: 'What is Photokin?', link: '/guide/' },
            { text: 'Install and first steps', link: '/guide/getting-started' },
          ],
        },
        {
          text: 'Organize your photos',
          items: [
            { text: 'Your library', link: '/guide/library' },
            { text: 'Browsing and viewing', link: '/guide/browsing' },
            { text: 'People', link: '/guide/people' },
            { text: 'Tags', link: '/guide/tags' },
            { text: 'Search', link: '/guide/search' },
            { text: 'Favorites, duplicates and edits', link: '/guide/curate' },
          ],
        },
        {
          text: 'Your files and privacy',
          items: [
            { text: 'Photo metadata', link: '/guide/metadata' },
            { text: 'Privacy and photo safety', link: '/guide/privacy' },
          ],
        },
        {
          text: 'Help',
          items: [{ text: 'FAQ and troubleshooting', link: '/guide/faq' }],
        },
      ],
    },
    socialLinks: [{ icon: 'github', link: REPO }],
    search: { provider: 'local' },
    editLink: {
      pattern: `${REPO}/edit/main/website/:path`,
      text: 'Suggest a change to this page',
    },
    outline: { level: [2, 3] },
    footer: {
      message: 'Free software under the AGPL-3.0 license.',
      copyright: '© Enrique Lozano and contributors',
    },
  },
});
