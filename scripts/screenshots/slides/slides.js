// The slides behind the README/website screenshots. Each one frames raw
// captures (`config.mjs` SHOTS) with a headline. `pnpm screenshots` renders
// every slide to website/public/screenshots/<file>.webp.

const CAPTURES = '../../../node_modules/.cache/photokin-screenshots';
const CAPTURE_RATIO = 1440 / 900;

export const SLIDES = [
  {
    file: '01-library',
    shot: 'albums',
    theme: 'navy',
    layout: 'top',
    eyebrow: 'Local-first photo gallery',
    title: 'Your photos, <mark>organized</mark> on your own computer',
  },
  {
    file: '02-people',
    shot: 'people',
    theme: 'light',
    layout: 'side',
    eyebrow: 'Faces, on-device',
    title: 'Find <mark>everyone</mark> in your photos',
    text: 'Faces are found on your computer, and names you set in other apps come along.',
  },
  {
    file: '03-search',
    shot: 'search',
    theme: 'navy',
    layout: 'side',
    eyebrow: 'Smart search',
    title: 'Search the way you <mark>remember</mark>',
    text: 'Describe a moment in your own words, or filter by date, camera, person or rating.',
  },
  {
    file: '04-places',
    shot: 'places',
    theme: 'light',
    layout: 'top',
    eyebrow: 'Places',
    title: 'Every <mark>place</mark> you have been',
  },
  {
    file: '05-tags',
    shot: 'tags',
    theme: 'navy',
    layout: 'side',
    eyebrow: 'Tags',
    title: 'Tags that <mark>travel</mark> with your photos',
    text: 'Nested tags, written in the standard formats Lightroom, digiKam and Windows read.',
  },
  {
    file: '06-viewer',
    shot: 'viewer',
    theme: 'light',
    layout: 'top',
    eyebrow: 'Viewer',
    title: 'Every <mark>detail</mark>, one click away',
  },
  {
    file: '07-calendar',
    shot: 'calendar',
    theme: 'navy',
    layout: 'side',
    eyebrow: 'Calendar',
    title: 'Jump to <mark>any day</mark> in your life',
    text: 'See at a glance when you took photos, and open any day in a click.',
  },
  {
    file: '08-themes',
    shots: ['theme-photokin-dark', 'theme-photokin-light', 'theme-slack-light', 'theme-spotify-dark'],
    theme: 'light',
    layout: 'grid',
    eyebrow: 'Make it yours',
    title: 'Light, dark and <mark>your colors</mark>',
    text: 'Six color themes, six fonts and adjustable text size.',
  },
];

function captureUrl(shot) {
  return `${CAPTURES}/${shot}.png`;
}

function windowFor(shot) {
  const frame = document.createElement('div');
  frame.className = 'window';
  const image = new Image();
  image.alt = '';
  image.src = captureUrl(shot);
  image.addEventListener('error', () => {
    frame.innerHTML = `<div class="missing">Missing capture “${shot}”.<br />Run pnpm screenshots</div>`;
  });
  frame.append(image);
  return frame;
}

/** Card showing `crop` = [x, y, width, height] (percent of the capture), placed with `style`. */
function zoomFor(shot, { crop: [x, y, w, h], style }) {
  const card = document.createElement('div');
  card.className = 'zoom';
  Object.assign(card.style, style);
  card.style.backgroundImage = `url("${captureUrl(shot)}")`;
  card.style.backgroundSize = `${(100 / w) * 100}% auto`;
  card.style.backgroundPosition = `${(x / (100 - w || 1)) * 100}% ${(y / (100 - h || 1)) * 100}%`;
  card.style.aspectRatio = `${w * CAPTURE_RATIO} / ${h}`;
  return card;
}

function render(slide) {
  const element = document.createElement('section');
  element.className = `slide ${slide.theme} layout-${slide.layout}`;
  element.dataset.file = slide.file;

  const copy = document.createElement('div');
  copy.className = 'copy';
  copy.innerHTML = `
    <span class="eyebrow">${slide.eyebrow}</span>
    <h1>${slide.title}</h1>
    ${slide.text ? `<p>${slide.text}</p>` : ''}
  `;

  element.append(copy);
  if (slide.shots) {
    const grid = document.createElement('div');
    grid.className = 'window-grid';
    grid.append(...slide.shots.map(windowFor));
    element.append(grid);
  } else {
    element.append(windowFor(slide.shot));
  }
  for (const zoom of slide.zooms ?? []) element.append(zoomFor(slide.shot, zoom));
  return element;
}

document.getElementById('slides').append(...SLIDES.map(render));
