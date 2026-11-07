import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEpisode, mediaSearchQueries,mediaVideoQuery } from '../lib/core.mjs';
import { EFFECT_TYPES, normalizeDirective, remapAnchor, buildAdvancedPlan,
  requiredSounds, validateAdvancedPlan, subjectBounds, positionProp } from '../lib/director.mjs';

const all = new Set(EFFECT_TYPES);

test('context media searches prioritize the actual subject without appending category labels',()=>{
 const article={title:'Axolotl',category:{label:'Nature & animal adaptations'}};
 const scene={subjectEntity:'Axolotl',visualRole:'context',visualQuery:'axolotl tissue regeneration close up',videoQuery:'axolotl regenerating limb'};
 const queries=mediaSearchQueries(scene,article,'Axolotl');
 assert.equal(queries[0],'Axolotl');assert.equal(mediaVideoQuery(scene,article,'Axolotl'),'Axolotl');
 assert.ok(queries.every(query=>!query.includes(article.category.label)));
 assert.equal(mediaVideoQuery({...scene,visualRole:'evidence',videoQuery:'axolotl eating worm'},article,'Axolotl'),'axolotl eating worm');
});
const source = {
  title: 'Dynamic director test', topic: 'Octopus', scenes: [
    { narration: 'Eight arms can swim.', line1: 'OCEAN', line2: 'WONDER', visualQuery: 'octopus underwater',
      setting: 'underwater', camera: 'pan-left', motion: 'float', action: 'signal',
      effects: [{ type: 'bubbles', where: 'bottom', at: .35 }, { type: 'rings', where: 'subject' }] },
    { narration: 'The secret is chemistry.', line1: 'SECRET', line2: 'SCIENCE', visualQuery: 'beetle chemical anatomy',
      setting: 'xray', camera: 'pull', action: 'release', effects: [
        { type: 'spray', where: 'subject', at: .35, rel: [.8, .6] },
        { type: 'glow', where: 'subject', at: .55, rel: [.4, .4] },
        { type: 'flow', where: 'right', at: .4 },
      ] },
    { narration: 'It is a remarkable creature.', line1: 'WOW', line2: 'REAL', visualQuery: 'beetle insect',
      setting: 'outdoor', motion: 'shake', action: 'impact', effects: [
        { type: 'burst', at: .2 }, { type: 'flash', at: .6 }, { type: 'stamp', at: .8 },
      ] },
  ],
};

test('original renderer effect catalog is fully available in the dynamic director', () => {
  assert.equal(EFFECT_TYPES.length, 31);
  assert.ok(['spray', 'smoke', 'glow', 'flow', 'bubbles', 'flash', 'polyp', 'reaction', 'rainbow', 'inflate', 'frost'].every(e => all.has(e)));
  const d = normalizeDirective({ visualQuery: 'deep ocean water', effects: [{ type: 'unknown' },
    { type: 'spray', at: 9, rel: [50, -5] }] });
  assert.equal(d.setting, 'underwater');
  assert.equal(d.effects.length, 1);
  assert.equal(d.effects[0].at, .93);
  assert.deepEqual(d.effects[0].rel, [.92, .08]);
});

test('multimodal subject anchors survive alpha-mask auto-cropping', () => {
  assert.deepEqual(remapAnchor([.5, .5], { bbox: { source: [800, 600], bbox: [100, 100, 700, 500] } }), [.5, .5]);
  assert.deepEqual(remapAnchor([.2, .3], { bbox: { source: [1000, 1000], bbox: [100, 100, 900, 900] } }), [.125, .25]);
  assert.deepEqual(remapAnchor([.7, .2], null), [.7, .2]);
});

test('Commons search removes impossible background prompts and discovers documented taxon', () => {
  const queries = mediaSearchQueries({ visual: 'cutout', visualQuery: 'archerfish shooting water cutout white background' },
    { title: 'Archerfish', extract: 'The family consists of two genera, Toxotes and Protoxotes.' }, 'Archerfish Predation');
  assert.equal(queries[0], 'archerfish');
  assert.ok(queries.includes('Toxotes'));
  assert.ok(!queries[0].includes('white background'));
});

test('builds scene-specific animation JSON with anchors, camera, backgrounds and Freesound cues', () => {
  const episode = normalizeEpisode(source);
  const timing = [{ start: 0, duration: 3.4 }, { start: 3.4, duration: 3.5 },
    { start: 6.9, duration: 3.0 }];
  const images = [{ path: '/assets/ocean.jpg', cutout: false },
    { path: '/assets/beetle.png', cutout: true }, null];
  const cues = Object.fromEntries(requiredSounds(episode).map(cue => [cue, `/assets/${cue}.mp3`]));
  const plan = buildAdvancedPlan(episode, timing, images, cues, '/tmp/output.mp4', null, { fps: 24 });
  assert.deepEqual(validateAdvancedPlan(plan), []);
  assert.equal(plan.meta.fps, 24);
  assert.equal(plan.scenes[0].water, undefined, 'Do not automatically add the same underwater sand/soil set');
  assert.equal(plan.scenes[1].page, 'dark');
  assert.equal(plan.scenes[2].scenery, undefined, 'Generic outdoor narration must not add unrelated ground/grass');
  assert.equal(plan.scenes[0].camera, 'pan-left');
  assert.equal(plan.scenes[1].camera, 'pull');
  assert.ok(!plan.scenes[1].elements.some(e => e.type === 'spray'), 'A spray must be supported by the spoken physical action');
  assert.ok(plan.scenes[1].elements.some(e => e.type === 'glow' && e.on === 'subject'));
  assert.ok(plan.scenes[2].elements.some(e => e.type === 'flash'));
  assert.ok(plan.scenes[2].elements.some(e => e.type === 'infographic'),
    'Missing factual imagery is replaced with an animated explanation, not a sticker');
  assert.ok(plan.sounds.some(e => e.sfx === 'boom'));
  assert.ok(!plan.scenes[1].elements.some(e => e.type === 'photo'));
  assert.ok(plan.scenes[1].elements.some(e => e.type === 'cutout'));
});

test('disallows malformed renderer JSON and missing anchors and SFX', () => {
  const episode = normalizeEpisode(source);
  const timing = [{ start: 0, duration: 3 }, { start: 3, duration: 3 }, { start: 6, duration: 3 }];
  const plan = buildAdvancedPlan(episode, timing, [null, null, null], {}, '/tmp/output.mp4', null);
  plan.scenes[0].elements.push({ type: 'evil_shell_exec', x: 540, y: 1300 });
  plan.scenes[0].elements.push({ type: 'spray', on: 'ghost', at: 55 });
  plan.scenes[0].elements.push({ type: 'sound', at: .4, sfx: 'missing' });
  const problems = validateAdvancedPlan(plan).join(' ');
  assert.match(problems, /unknown evil_shell_exec/);
  assert.match(problems, /missing anchor target ghost/);
  assert.match(problems, /invalid relative time/);
  assert.match(problems, /Freesound cue missing/);
});

test('physical props never cover the fish, even with crowded layout and large type', () => {
  const subject = subjectBounds({ type: 'cutout', x: 335, y: 1170,
    height: 650, max_width: 806 }, { bbox: { bbox: [15, 50, 945, 520] } });
  const occupied = [];
  const scene = { layout: 'left' };
  const thermometer = positionProp({ type: 'thermometer', x: 0, y: 0, scale: .64 }, scene, subject, occupied, 'subject');
  const flask = positionProp({ type: 'flask', x: 0, y: 0, scale: .65 }, scene, subject, occupied, 'subject');
  assert.ok(thermometer && flask);
  assert.equal(occupied.length, 2);
  assert.notDeepEqual([thermometer.x, thermometer.y], [flask.x, flask.y]);
  assert.ok(occupied.every(box => box.x0 >= 70 && box.x1 <= 1010 && box.y0 >= 705 && box.y1 <= 1850));
});

test('a spoken 50× figure remains visible above a low-left photo, never over the subject', () => {
  const photo = { type: 'photo', width: 590, x: 400, y: 1320 };
  const subject = subjectBounds(photo, null);
  const number = positionProp({ type: 'text', text: '50×', size: 190, x: 800, y: 1100 },
    { layout: 'lower-left' }, subject, [], 'right');
  assert.ok(number, 'A factual number deserves a top-row placement');
  assert.ok(number.y < subject.y0 - 50, 'No number covers the photo');
  assert.ok(number.size >= 100, 'The number must be readable on a vertical Short');
});

test('identical source images may produce varied editorial themes without invalid render JSON', () => {
  const s = { narration: 'Archerfish shoots water.', line1: 'WATER', line2: 'SHOOTER',
    visualQuery: 'archerfish animal', visual: 'cutout', layout: 'hero', theme: 'dossier',
    effects: [{ type: 'flask', where: 'subject', at: .35 }, { type: 'thermometer', where: 'subject', at: .7 }] };
  const episode = normalizeEpisode({ title: 'Varied', topic: 'Archerfish', scenes: Array.from({ length: 6 }, () => ({ ...s })) });
  const times = episode.scenes.map((_, i) => ({ start: i * 3, duration: 3 }));
  const imgs = times.map(() => ({ cutout: true, path: '/tmp/fish.png', bbox: { bbox: [10, 10, 950, 510] } }));
  const plan = buildAdvancedPlan(episode, times, imgs, {}, '/tmp/example.mp4', null, { seed: 998 });
  assert.equal(validateAdvancedPlan(plan).length, 0);
  assert.ok(new Set(plan.scenes.map(s => s.page)).size >= 2);
  for (const scene of plan.scenes) {
    assert.ok(['hero', 'left', 'right', 'poster', 'detail'].includes(scene.layout));
    assert.equal(scene.elements.filter(e => e.type === 'flask' || e.type === 'thermometer').filter(e => e.on).length, 0);
  }
});

test('wide fish cutout stays completely inside portrait frame in right-side layout', () => {
  const episode = normalizeEpisode({ title: 'Fish', topic: 'Archerfish', scenes: Array.from({ length: 3 }, (_, i) => ({
    narration: 'Water comes from mouth.', line1: 'FISH', line2: 'FACT', visualQuery: 'Toxotes jaculatrix',
    visual: 'cutout', layout: i === 0 ? 'right' : 'left', camera: 'static', motion: 'static',
    effects: [{ type: 'spray', at: .4, where: 'subject', rel: [.03, .38], direction: -171 }],
  })) });
  const t = episode.scenes.map((_, i) => ({ start: i * 4, duration: 4 }));
  const im = { path: '/tmp/fish.png', cutout: true,
    bbox: { source: [960, 465], bbox: [23, 30, 960, 462] } };
  const plan = buildAdvancedPlan(episode, t, [im, im, im], {}, '/tmp/clip.mp4', null, { seed: 111 });
  assert.deepEqual(validateAdvancedPlan(plan), []);
  for (const scene of plan.scenes) {
    const s = scene.elements.find(x => x.type === 'cutout');
    const x = s.move?.to?.[0] ?? s.x;
    const ratio = 937 / 432;
    const fullWidth = Math.min(s.height * ratio, s.max_width);
    assert.ok(x - fullWidth / 2 >= 50 && x + fullWidth / 2 <= 1030,
      `fish photo clipped in ${scene.layout} (${x} ${fullWidth})`);
  }
});

test('a mechanism diagram uses animated factual nodes instead of an unrelated stock photo', () => {
  const episode = normalizeEpisode({ title: 'Pressure', topic: 'Popcorn', scenes: Array.from({ length: 3 }, (_, i) => ({
    narration: 'Steam pressure builds inside the kernel.', line1: 'PRESSURE', line2: 'BUILDS',
    subjectEntity: 'popcorn kernel', visualRole: 'diagram', visualQuery: 'popcorn',
    visual: 'diagram', backgroundMode: 'kitchen', titleStyle: i ? 'kinetic' : 'center',
    diagram: { heading: 'INSIDE KERNEL', nodes: [{ label: 'Water', detail: 'Inside grain' },
      { label: 'Steam', detail: 'Heat rises' }, { label: 'Burst', detail: 'Shell opens' }] },
    effects: [],
  })) });
  const t = episode.scenes.map((_, i) => ({ start: i * 3, duration: 3 }));
  const plan = buildAdvancedPlan(episode, t, [null, null, null], {}, '/tmp/diagram.mp4', null, { seed: 5 });
  assert.deepEqual(validateAdvancedPlan(plan), []);
  assert.ok(plan.scenes.every(s => s.elements.some(e => e.type === 'infographic' && e.nodes.length === 3)));
  assert.ok(plan.scenes.every(s => !s.scenery && !s.water));
  assert.ok(plan.scenes.every(s => s.background_mode === 'kitchen'));
  assert.ok(plan.scenes.every(s => !s.elements.some(e => e.type === 'ruler')));
});

test('V6 paper shorts use story-dependent illustrations, Ayush-friendly pacing and no recurring figure strip', () => {
  const episode = normalizeEpisode({ title: 'Rainbow', topic: 'Rainbows', scenes: [
    { narration: 'A rainbow is a full circle hidden by the horizon.', visual: 'photo',
      visualQuery: 'Rainbow above mountains', line1: 'HIDDEN', line2: 'CIRCLE',
      photoStyle: 'poster', theme: 'cream', soundCue: 'question', sfxQuery: 'cartoon puzzling rising ping',
      effects: [] },
    { narration: 'Seen from an aeroplane, the rainbow can look circular.', visual: 'illustration',
      visualQuery: 'Circular rainbow', line1: 'FULL', line2: 'CIRCLE',
      theme: 'infographic', effects: [{ type: 'rainbow', at: .16, where: 'center' }], soundCue: 'ding' },
    { narration: 'Sunlight refracts and reflects in raindrops.', visual: 'diagram',
      line1: 'LIGHT', line2: 'BENDS', visualQuery: 'refraction rain',
      diagram: { style: 'orbit', nodes: [
        { label: 'Light', detail: 'Enters drop' }, { label: 'Reflect', detail: 'Inside drop' },
        { label: 'Colours', detail: 'Exit drop' }] }, effects: [] },
  ] });
  const timing = episode.scenes.map((_, i) => ({ start: i * 4.3, duration: 4.3 }));
  const sfx = { question: '/audio/q.mp3', ding: '/audio/d.mp3' };
  const plan = buildAdvancedPlan(episode, timing,
    [{ path: '/media/rainbow.jpg', cutout: false }, null, null], sfx,
    '/tmp/rainbow.mp4', null, { fps: 24, seed: 69 });
  assert.deepEqual(validateAdvancedPlan(plan), []);
  assert.equal(plan.meta.show_header, false);
  assert.equal(plan.meta.header, '');
  assert.equal(plan.scenes[0].elements.find(e => e.type === 'photo').photo_style, 'poster');
  assert.ok(plan.scenes[1].elements.some(e => e.type === 'rainbow'));
  assert.ok(!plan.scenes[1].elements.some(e => e.type === 'name_tag'), 'Illustration gets center stage');
  assert.equal(plan.scenes[2].elements.find(e => e.type === 'infographic').style, 'orbit');
  assert.ok(!plan.scenes.some(s => s.scenery || s.water || s.seabed));
  assert.ok(plan.sounds.some(s => s.sfx === 'question'));
  assert.ok(plan.sounds.some(s => s.sfx === 'ding'));
});

test('V7 carries Devanagari top headline and per-shot punchline through to the original renderer', () => {
  const e = normalizeEpisode({ title: 'Wood frog', topic: 'Wood frog',
    headlineHi: 'ये मेंढक जमकर भी कैसे बचता है?', scenes: Array.from({ length: 3 }, (_, i) => ({
      narration: 'ये वुड फ्रॉग ठंड में अपने शरीर को जमने देता है।',
      line1: i === 0 ? 'मेंढक' : 'बर्फ', line2: i === 0 ? 'जम गया!' : 'का कमाल',
      beatTextHi: 'फिर भी ज़िंदा!', visualQuery: 'Lithobates sylvaticus', visual: 'photo',
      effects: [{ type: 'frost', at: .4, where: 'center' }], soundCue: 'wind',
    })) });
  const t = e.scenes.map((_, i) => ({ start: i * 4.1, duration: 4.1 }));
  const imgs = t.map(() => ({ path: '/assets/woodfrog.jpg', cutout: false }));
  const plan = buildAdvancedPlan(e, t, imgs, { wind: '/audio/wind.mp3' }, '/tmp/hindi.mp4', null, { seed: 113 });
  assert.deepEqual(validateAdvancedPlan(plan), []);
  assert.equal(plan.meta.headline_hi, 'ये मेंढक जमकर भी कैसे बचता है?');
  assert.ok(plan.scenes.every(s => s.beat_text_hi === 'फिर भी ज़िंदा!'));
  assert.ok(plan.scenes.every(s => s.elements.some(x => x.type === 'frost')));
  assert.equal(plan.meta.show_header, false, 'No old FIG/strip beside the new story-specific Hindi banner');
});

test('non-targeting story-specific glow stays attached to the actual photo position', () => {
  const ep = normalizeEpisode({ title: 'Berry surface', topic: 'Strawberry', scenes: Array.from({ length: 3 }, () => ({
    narration: 'The achenes sit on the surface of the strawberry.', line1: 'REAL', line2: 'FRUITS',
    visualQuery: 'Fragaria vesca red fruit close-up', visual: 'photo', layout: 'right',
    motion: 'slide-left', effects: [{ type: 'glow', where: 'subject', at: .5 },
      { type: 'crosshair', where: 'subject', at: .6 }, { type: 'reaction', at: .7 }],
  })) });
  const timing = ep.scenes.map((_, i) => ({ start: i * 4, duration: 4 }));
  const photos = timing.map(() => ({ path: '/tmp/strawberry.jpg', cutout: false }));
  const plan = buildAdvancedPlan(ep, timing, photos, {}, '/tmp/fruit.mp4', null, { seed: 200 });
  assert.deepEqual(validateAdvancedPlan(plan), []);
  for (const shot of plan.scenes) {
    const photo = shot.elements.find(e => e.type === 'photo');
    const ring = shot.elements.find(e => e.type === 'glow');
    assert.equal(ring.x, photo.move.to[0]);
    assert.equal(ring.y, photo.move.to[1]);
    assert.ok(!shot.elements.some(e => ['crosshair', 'reaction'].includes(e.type)),
      'No target-lock overlays or cheap emoji stickers in the professional renderer');
    assert.equal(photo.micro_motion, undefined, 'Renderer has safe defaults, not a mandatory pre-render pose');
  }
});

test('white, black and random background overrides preserve three facts and adapt diagram palette', () => {
  const episode = normalizeEpisode({ title: 'Facts', topic: 'Octopus', language: 'en',
    headlineText: 'THE REAL OCTOPUS', headlineHighlight: 'THE REAL',
    facts: ['Octopuses have eight arms.', 'They can change color.', 'They squeeze through gaps.'],
    scenes: [0, 1, 2].map(i => ({ narration: ['Eight arms.', 'Color shifts.', 'Narrow gaps.'][i],
      factIndex: i, line1: ['ARMS', 'COLOR', 'ESCAPE'][i], line2: 'OCTOPUS',
      visual: 'diagram', visualQuery: 'octopus', backgroundMode: 'underwater',
      diagram: { style: i === 0 ? 'mechanism' : 'pathways', nodes: [
        { label: 'Known fact', detail: 'Evidence' }, { label: 'Meaning', detail: 'Details' }] },
      effects: [] })) });
  for (const mode of ['white', 'black', 'random']) {
    const times = episode.scenes.map((_, i) => ({ start: i * 2.2, duration: 2.2 }));
    const plan = buildAdvancedPlan(episode, times, [null, null, null], {}, '/tmp/three-facts.mp4',
      null, { backgroundPalette: mode, seed: 11 });
    assert.deepEqual(validateAdvancedPlan(plan), []);
    assert.equal(plan.meta.facts.length, 3);
    assert.deepEqual(plan.scenes.map(s => s.fact_index), [0, 1, 2]);
    for (const scene of plan.scenes) {
      assert.equal(scene.page, mode === 'random' ? scene.page : mode);
      assert.equal(scene.elements[0].background_palette, mode);
      assert.equal(scene.elements.filter(e => e.type === 'infographic').length, 1);
    }
  }
});
