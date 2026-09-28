// One-off: extract the Debt Freedom plant art from the bundled design HTML into
// app-ready SVG files under assets/debt-freedom/.
//
// The design files build their SVGs with JavaScript at runtime, so this opens each
// one in Chromium, waits for it to render, and serializes the frames it drew.
//
//   npm i --no-save playwright-core@1.62.0    # matches the preinstalled chromium-1234
//   node scripts/extract-plant-svgs.mjs
//
// Output (every file keeps the 0 0 1000 1250 canvas, so layers line up 1:1):
//   plant-<n>/frame-XX-back.svg   plant parts drawn BEHIND the pot (stems, stalks)
//   plant-<n>/frame-XX.svg        plant parts drawn IN FRONT of the pot
//   plant-<n>/paid-off.svg        the finished paid-off art (fragments + stake)
//   plant-<n>/paid-off-base.svg   paid-off without fragments / stake / mound (completion anim)
//   plant-3/frame-XX-top.svg      flytrap: trap_2 and everything above it (steps 05–10)
//   plant-3/frame-XX-snap.svg     flytrap: same, with trap_2 shut (catch pose c)
//   plant-3/frame-XX-bug-a|b.svg  flytrap: the bug in flight / landed (poses a, b)
//   plant-3/frame-XX-puff.svg     flytrap: the little puff (pose d)
//   pot-kit/*.svg                 the shared pot, soil ball, fragments, stake, seed
//   layout.json                   bounding boxes + fragment fall transforms
//
// assets/debt-freedom/.svgrrc turns off SVGO's cleanupIds for this folder, so the
// named groups (pot_label, fragment_01, trap_2, …) survive the Metro SVG transform.
//
// The pot, soil and grain groups are removed from the plant layers: the pot is drawn
// once from pot-kit/ so it can break apart, and the grain texture is left out for
// weight (see GRAIN below).

import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'docs', 'design-debt-freedom');
const OUT = path.resolve(HERE, '..', 'assets', 'debt-freedom');

const GRAIN = process.argv.includes('--grain'); // keep the grain overlay (comparison only)

const PLANTS = [
  { n: 1, file: 'plant-1/DollarSeeds Plant Pothos.html' },
  { n: 2, file: 'plant-2/Plant 2 - Cactus.html' },
  { n: 3, file: 'plant-3/Plant 3 Flytrap.html' },
  { n: 4, file: 'plant-4/DollarSeeds Plant 4 Flowering Bush.html' },
];

const POT_IDS = ['soil', 'pot_body', 'pot_label', 'pot_rim'];
const DROP_IDS = ['grain', '_mock_label_text', '_flight_path'];
const FLYTRAP_FIRST_TOP = 'trap_2'; // the trap the bug lands in
const BUG_MIN_STEP = 5; // trap_2 is visible from frame 5

const browser = await chromium.launch();

// Runs in the page. Classifies every rendered <svg> by the card label beside it
// and serializes the requested layers. Pure DOM work, no app knowledge.
function collect(opts) {
  const { POT_IDS, DROP_IDS, GRAIN, FLYTRAP_FIRST_TOP, BUG_MIN_STEP } = opts;
  const svgs = [...document.querySelectorAll('svg')];
  const labelOf = (s) => {
    let el = s;
    for (let k = 0; k < 6 && el; k++) {
      el = el.parentElement;
      const t = el && el.innerText && el.innerText.trim();
      if (t) return t.split('\n')[0].trim();
    }
    return '';
  };
  const ser = new XMLSerializer();
  const idsOf = (s) => [...s.children].map((c) => c.id);

  // Serialize `svg` keeping only the top-level children that pass `keep`, on the full
  // canvas. <defs> is kept, minus the grain pattern when grain is dropped.
  const layer = (svg, keep) => {
    const clone = svg.cloneNode(true);
    clone.removeAttribute('width');
    clone.removeAttribute('style');
    clone.setAttribute('viewBox', '0 0 1000 1250');
    for (const c of [...clone.children]) {
      if (c.tagName.toLowerCase() === 'defs') {
        if (!GRAIN) for (const p of [...c.querySelectorAll('pattern')]) if (/_gr$/.test(p.id)) p.remove();
        if (!c.children.length) c.remove();
        continue;
      }
      if (!keep(c.id)) c.remove();
    }
    return ser.serializeToString(clone);
  };
  const withoutDropped = (id) => GRAIN ? !DROP_IDS.filter((d) => d !== 'grain').includes(id) : !DROP_IDS.includes(id);

  // Split one plant frame into back (before soil) / front (after pot_rim) around the pot.
  const split = (svg, frontStop) => {
    const ids = idsOf(svg);
    const iSoil = ids.indexOf('soil');
    const iRim = ids.indexOf('pot_rim');
    const iStop = frontStop ? ids.indexOf(frontStop) : -1;
    const back = new Set(ids.slice(0, iSoil));
    const front = new Set(ids.slice(iRim + 1, iStop > 0 ? iStop : undefined));
    const top = iStop > 0 ? new Set(ids.slice(iStop)) : null;
    // grain sits last and covers the pot: it belongs with the pot, never a plant layer
    const plant = (set) => (id) => set.has(id) && !POT_IDS.includes(id) && id !== 'grain' && withoutDropped(id);
    return {
      back: layer(svg, plant(back)),
      front: layer(svg, plant(front)),
      top: top ? layer(svg, plant(top)) : null,
    };
  };

  const frames = [];
  const byLabel = {};
  for (const s of svgs) {
    const label = labelOf(s);
    const m = /^(\d+) · /.exec(label);
    const ids = idsOf(s);
    if (m && ids.includes('pot_body') && s.getAttribute('viewBox') === '0 0 1000 1250' && !/^2 · Frame 10/.test(label)) {
      frames[+m[1]] = s;
    }
    byLabel[label] = s;
  }
  const find = (re) => svgs.find((s) => re.test(labelOf(s)));

  const isFlytrap = idsOf(frames[10]).includes(FLYTRAP_FIRST_TOP);
  const out = { frames: [], extras: {} };
  frames.forEach((s, i) => {
    const stop = isFlytrap && i >= BUG_MIN_STEP ? FLYTRAP_FIRST_TOP : null;
    out.frames[i] = split(s, stop);
  });

  const paid = find(/Paid off$/);
  const paidIds = idsOf(paid);
  out.paidOff = layer(paid, (id) => withoutDropped(id) && (GRAIN || id !== 'grain'));
  out.paidOffBase = layer(paid, (id) => withoutDropped(id) && id !== 'grain' && id !== 'stake' && id !== 'mound' && !/^fragment_/.test(id));

  // ── layout: measured in canvas units from the rendered geometry
  const bbox = (el) => {
    // getBBox is in the element's own user space; map its corners to the root canvas
    const b = el.getBBox();
    const m = el.getCTM();
    const root = el.ownerSVGElement.getCTM() || new DOMMatrix();
    const toCanvas = root.inverse().multiply(m);
    const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
      .map(([x, y]) => new DOMPoint(x, y).matrixTransform(toCanvas));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const r = (v) => Math.round(v * 10) / 10;
    return { x: r(Math.min(...xs)), y: r(Math.min(...ys)), width: r(Math.max(...xs) - Math.min(...xs)), height: r(Math.max(...ys) - Math.min(...ys)) };
  };
  out.layout = {
    potLabel: bbox(frames[5].querySelector('#pot_label')),
    stakeTag: bbox(paid.querySelector('#stake_tag')),
    stakeTagRotation: (() => {
      const t = paid.querySelector('#stake_tag').getAttribute('transform') || '';
      const m = /rotate\(([-\d.]+)/.exec(t);
      return m ? +m[1] : 0;
    })(),
    seed: bbox(frames[0].querySelector('#seed')),
    soilTop: bbox(frames[0].querySelector('#soil')),
  };

  // ── flytrap catch poses, re-targeted onto each growth step's trap_2
  if (isFlytrap) {
    const pose = (letter) => find(new RegExp('^' + letter + ' · '));
    const mat = (el) => {
      const t = el.transform.baseVal.consolidate();
      return t ? t.matrix : new DOMMatrix();
    };
    const fmt = (m) => `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map((v) => +v.toFixed(4)).join(' ')})`;
    const t10 = mat(frames[10].querySelector('#' + FLYTRAP_FIRST_TOP));
    const t10inv = DOMMatrix.fromMatrix(t10).inverse();
    const retarget = (poseSvg, id, stepSvg) => {
      // pose element → trap-local → this step's trap
      const ts = mat(stepSvg.querySelector('#' + FLYTRAP_FIRST_TOP));
      const pm = mat(poseSvg.querySelector('#' + id));
      return fmt(DOMMatrix.fromMatrix(ts).multiply(t10inv).multiply(pm));
    };
    const shown = (el) => { el.removeAttribute('opacity'); return el; };
    const onlyGroup = (svg, id, transform) => {
      const clone = svg.cloneNode(true);
      clone.removeAttribute('width');
      clone.removeAttribute('style');
      clone.setAttribute('viewBox', '0 0 1000 1250');
      for (const c of [...clone.children]) if (c.id !== id) c.remove();
      const g = shown(clone.querySelector('#' + id));
      g.setAttribute('transform', transform);
      return ser.serializeToString(clone);
    };
    const a = pose('a'), b = pose('b'), c = pose('c'), d = pose('d');
    frames.forEach((s, i) => {
      if (i < BUG_MIN_STEP) return;
      // snap: this step's top layer, with trap_2's inner art swapped for the shut one
      const snap = s.cloneNode(true);
      const open = snap.querySelector('#' + FLYTRAP_FIRST_TOP);
      const shut = c.querySelector('#' + FLYTRAP_FIRST_TOP).cloneNode(true);
      shut.setAttribute('transform', open.getAttribute('transform'));
      shut.setAttribute('data-pivot', open.getAttribute('data-pivot'));
      open.replaceWith(shut);
      const ids = idsOf(snap);
      const iStop = ids.indexOf(FLYTRAP_FIRST_TOP);
      const top = new Set(ids.slice(iStop));
      out.extras[i] = {
        snap: layer(snap, (id) => top.has(id) && id !== 'grain' && withoutDropped(id) && id !== 'bug' && id !== 'puff'),
        bugA: onlyGroup(a, 'bug', retarget(a, 'bug', s)),
        bugB: onlyGroup(b, 'bug', retarget(b, 'bug', s)),
        puff: onlyGroup(d, 'puff', retarget(d, 'puff', s)),
      };
    });
  }

  // ── shared pot kit (full canvas so every part lines up with the plant frames)
  const kit = (re, drop = []) => {
    const s = find(re);
    return layer(s, (id) => withoutDropped(id) && (GRAIN || id !== 'grain') && !drop.includes(id));
  };
  out.kit = {
    'empty-pot': kit(/^Empty pot/),
    'soil-ball': kit(/^Soil ball/),
    'fragments-fitted': kit(/^Fragments, fitted/),
    'fragments-scattered': kit(/^Fragments, scattered/),
    stake: kit(/^Stake/),
    seed: layer(find(/^Seed/), (id) => id === 'seed'),
  };
  // one file per fitted fragment, for the fall animation
  const fitted = find(/^Fragments, fitted/);
  const scattered = find(/^Fragments, scattered/);
  out.fragments = [];
  for (let k = 1; k <= 8; k++) {
    const id = 'fragment_' + String(k).padStart(2, '0');
    const t = scattered.querySelector('#' + id).getAttribute('transform') || '';
    const tr = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(t);
    const ro = /rotate\(([-\d.]+)[ ,]+([-\d.]+)[ ,]+([-\d.]+)\)/.exec(t);
    out.fragments.push({
      id,
      svg: layer(fitted, (cid) => cid === id),
      fall: {
        dx: tr ? +tr[1] : 0, dy: tr ? +tr[2] : 0,
        rotate: ro ? +ro[1] : 0, cx: ro ? +ro[2] : 500, cy: ro ? +ro[3] : 625,
      },
    });
  }
  out.paidIds = paidIds;
  return out;
}

function write(rel, content) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.replace(/\s+xmlns:xlink="[^"]*"/g, '') + '\n');
}

const layout = { canvas: { width: 1000, height: 1250, potBottom: 1150 }, species: {} };
let kitRef = null;

for (const plant of PLANTS) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await page.goto(pathToFileURL(path.join(SRC, plant.file)).href);
  await page.waitForFunction(() => document.querySelectorAll('svg').length > 18, null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  const out = await page.evaluate(collect, { POT_IDS, DROP_IDS, GRAIN, FLYTRAP_FIRST_TOP, BUG_MIN_STEP });
  await page.close();

  if (out.frames.length !== 11 || out.frames.some((f) => !f)) throw new Error(`plant-${plant.n}: expected 11 growth frames, got ${out.frames.length}`);
  const dir = `plant-${plant.n}`;
  out.frames.forEach((f, i) => {
    const xx = String(i).padStart(2, '0');
    write(`${dir}/frame-${xx}-back.svg`, f.back);
    write(`${dir}/frame-${xx}.svg`, f.front);
    if (f.top) write(`${dir}/frame-${xx}-top.svg`, f.top);
  });
  write(`${dir}/paid-off.svg`, out.paidOff);
  write(`${dir}/paid-off-base.svg`, out.paidOffBase);
  for (const [i, e] of Object.entries(out.extras)) {
    const xx = String(i).padStart(2, '0');
    write(`${dir}/frame-${xx}-snap.svg`, e.snap);
    write(`${dir}/frame-${xx}-bug-a.svg`, e.bugA);
    write(`${dir}/frame-${xx}-bug-b.svg`, e.bugB);
    write(`${dir}/frame-${xx}-puff.svg`, e.puff);
  }

  // The pot kit is shared: write it once, and fail loudly if a species drifted.
  const kitJson = JSON.stringify(out.kit);
  if (!kitRef) {
    kitRef = kitJson;
    for (const [name, svg] of Object.entries(out.kit)) write(`pot-kit/${name}.svg`, svg);
    for (const f of out.fragments) write(`pot-kit/${f.id.replace('_', '-')}.svg`, f.svg);
    layout.fragments = out.fragments.map((f) => ({ id: f.id, ...f.fall }));
    layout.potLabel = out.layout.potLabel;
    layout.seed = out.layout.seed;
    layout.soilTop = out.layout.soilTop;
  } else if (kitJson !== kitRef) {
    console.warn(`plant-${plant.n}: pot kit differs from plant-1 — using plant-1's`);
  }
  layout.species[plant.n] = {
    stakeTag: out.layout.stakeTag,
    stakeTagRotation: out.layout.stakeTagRotation,
    bugSteps: Object.keys(out.extras).map(Number),
  };
  console.log(`plant-${plant.n}: ${out.frames.length} frames, bug steps [${Object.keys(out.extras).join(',')}]`);
}

fs.writeFileSync(path.join(OUT, 'layout.json'), JSON.stringify(layout, null, 2) + '\n');
await browser.close();
console.log('wrote', path.relative(process.cwd(), OUT));
