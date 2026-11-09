// Mèo chó trang trí. Nội dung toàn hằng số trong file này nên gắn bằng innerHTML được.
const INK = '#5A2A41';
const WHITE_CAT = { fill: '#FFFFFF', spot: '#FF9DBE' };
const LILAC_CAT = { fill: '#E3D4F7', spot: '#B79BE0' };
const DOG = { fill: '#FFE7C2', spot: '#E8B583' };

const line = (d, width, color) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
const limb = (d, fill) => line(d, 11, INK) + line(d, 6, fill);
const outlined = `stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"`;

function catHead({ fill, spot }) {
  return `
    <path d="M-13 -8 -15 -28 0 -17ZM3 -17 17 -27 15 -8Z" fill="${fill}" ${outlined}/>
    <path d="M-11 -13 -12 -22 -5 -17ZM7 -17 13 -21 12 -13Z" fill="${spot}"/>
    <circle r="17" fill="${fill}" ${outlined}/>
    <circle cx="-6" cy="-3" r="2.6" fill="${INK}"/><circle cx="8" cy="-3" r="2.6" fill="${INK}"/>
    <path d="M-1 2h4l-2 3Z" fill="${spot}"/>
    ${line('M1 5q-3 5-6 2M1 5q3 5 6 2', 1.8, INK)}
    ${line('M-18 2h-8M-17 7l-8 2M20 2h8M19 7l8 2', 1.6, INK)}`;
}

function dogHead({ fill, spot }) {
  return `
    <circle r="17" fill="${fill}" ${outlined}/>
    <ellipse cx="9" cy="6" rx="11" ry="8" fill="#FFFFFF" ${outlined}/>
    <path d="M7 13q0 9 5 8t3-8Z" fill="#FF9DBE" ${outlined}/>
    <ellipse cx="15" cy="2" rx="4" ry="3" fill="${INK}"/>
    <circle cx="-3" cy="-5" r="2.6" fill="${INK}"/><circle cx="10" cy="-7" r="2.6" fill="${INK}"/>
    <path d="M-9 -14C-24 -13 -26 8 -18 12C-10 10 -9 -4 -6 -13Z" fill="${spot}" ${outlined}/>`;
}

const headOf = (kind, look) => (kind === 'cat' ? catHead(look) : dogHead(look));
const TAILS = { cat: 'C10 42 6 26 14 14', dog: 'C18 36 13 28 16 18' };

function runningPet(kind, look) {
  const leg = (x, phase) => `<g class="pet-leg ${phase}">${limb(`M${x} 58V78`, look.fill)}</g>`;
  return `<svg class="pet pet-run" viewBox="0 0 122 92" aria-hidden="true">
    <g class="pet-tail">${limb(`M28 44${TAILS[kind]}`, look.fill)}</g>
    ${leg(38, 'b')}${leg(72, 'a')}
    <ellipse cx="54" cy="48" rx="31" ry="17" fill="${look.fill}" ${outlined}/>
    <ellipse cx="46" cy="41" rx="11" ry="7" fill="${look.spot}"/>
    ${leg(30, 'a')}${leg(64, 'b')}
    <g transform="translate(90 36)">${headOf(kind, look)}</g>
  </svg>`;
}

function sittingPet(kind, look) {
  return `<svg class="pet pet-sit" viewBox="0 0 122 92" aria-hidden="true">
    <g class="pet-tail">${limb(`M38 76${kind === 'cat' ? 'C16 78 10 62 18 48' : 'C26 76 18 64 20 54'}`, look.fill)}</g>
    <ellipse cx="50" cy="62" rx="21" ry="24" fill="${look.fill}" ${outlined}/>
    <ellipse cx="46" cy="58" rx="9" ry="10" fill="${look.spot}"/>
    <ellipse cx="38" cy="78" rx="15" ry="9" fill="${look.fill}" ${outlined}/>
    ${limb('M58 66 60 82', look.fill)}
    <g class="pet-paw">${limb('M62 60 88 50', look.fill)}</g>
    <g transform="translate(60 32)">${headOf(kind, look)}</g>
  </svg>`;
}

const yarnSvg = `<svg class="pet pet-yarn" viewBox="0 0 40 40" aria-hidden="true">
  <circle cx="20" cy="20" r="17" fill="#FF9DBE" ${outlined}/>
  ${line('M6 14c9-4 20-3 28 3M5 23c9-4 21-3 30 2M11 33c0-10 6-20 15-27M20 36c0-9 5-17 13-24', 1.8, INK)}
</svg>`;

const volley = (left, right) => `
  <div class="volley-side left">${left}</div>
  <div class="volley-side right mirrored">${right}</div>
  <div class="volley-x"><div class="volley-y">${yarnSvg}</div></div>`;

const chase = `
  <div class="runner"><div class="troupe">
    <div class="troupe-dog">${runningPet('dog', DOG)}</div>
    <div class="troupe-cat">${runningPet('cat', LILAC_CAT)}</div>
    <div class="troupe-yarn">${yarnSvg}</div>
  </div></div>`;

const SCENES = {
  hero: `${sittingPet('cat', WHITE_CAT)}<div class="hero-yarn">${yarnSvg}</div>`,
  gap: `<div class="mirrored">${sittingPet('dog', DOG)}</div>`,
  stage: `<div class="stage-volley">${volley(sittingPet('cat', LILAC_CAT), sittingPet('dog', DOG))}</div>
    <div class="stage-run">${chase}</div>`,
  wide: `<div class="wide-volley">${volley(sittingPet('cat', WHITE_CAT), sittingPet('cat', LILAC_CAT))}</div>
    <div class="wide-cat mirrored">${sittingPet('dog', DOG)}</div>
    <div class="wide-run">${chase}</div>`,
};

document.querySelectorAll('[data-pets]').forEach((slot) => {
  slot.innerHTML = SCENES[slot.dataset.pets];
});
