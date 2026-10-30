import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import HomeShowcase from './components/HomeShowcase.vue';
import HomeDownload from './components/HomeDownload.vue';
import HomeHeroVisual from './components/HomeHeroVisual.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'home-hero-image': () => h(HomeHeroVisual),
      'home-hero-actions-after': () =>
        h('ul', { class: 'hero-facts' }, [
          h('li', 'Free & open source'),
          h('li', 'Windows & macOS'),
          h('li', 'No account needed'),
        ]),
      'home-hero-after': () => h(HomeShowcase),
      'home-features-after': () => h(HomeDownload),
    }),
};
