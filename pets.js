// Mèo chó trang trí. Ảnh dùng chung số phiên bản với chính file này.
const version = new URL(import.meta.url).search;
const pet = (name, motion) => `<img class="pet ${motion}" src="pets/${name}.webp${version}" alt="" draggable="false">`;

const yarn = pet('yarn', 'pet-yarn');

const volley = (left, right, middle = '') => `
  <div class="volley-side left">${left}</div>
  ${middle}
  <div class="volley-side right mirrored">${right}</div>
  <div class="volley-x"><div class="volley-y">${yarn}</div></div>`;

const chase = `
  <div class="runner"><div class="troupe">
    <div class="troupe-dog">${pet('dog-run', 'pet-run')}</div>
    <div class="troupe-cat">${pet('cat-run', 'pet-run pet-run-alt')}</div>
    <div class="troupe-yarn">${yarn}</div>
  </div></div>`;

const kitten = `<div class="volley-kitten">${pet('kitten-play', 'pet-wiggle')}</div>`;

const SCENES = {
  hero: `${pet('cat-swat', 'pet-swat')}<div class="hero-yarn">${yarn}</div>`,
  gap: `<div class="mirrored">${pet('dog-sit', 'pet-rock')}</div>`,
  stage: `<div class="stage-volley">${volley(pet('cat-swat', 'pet-swat'), pet('dog-sit', 'pet-swat'), kitten)}</div>
    <div class="stage-run">${chase}</div>`,
  wide: `<div class="wide-volley">${volley(pet('cat-swat', 'pet-swat'), pet('dog-sit', 'pet-swat'))}</div>
    <div class="wide-kitten">${pet('kitten-play', 'pet-wiggle')}</div>
    <div class="wide-run">${chase}</div>`,
};

document.querySelectorAll('[data-pets]').forEach((slot) => {
  slot.innerHTML = SCENES[slot.dataset.pets];
});
