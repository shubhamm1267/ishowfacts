/* Dynamic paper-doc scene director. This module never lets model-generated JSON
 * select arbitrary files, scripts or renderer APIs. Every visual is compiled
 * to the original paper_doc.py's documented primitives and verified. */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : lo));
const short = (v, n = 36) => String(v || '').replace(/[<>\[\]{}]/g, '').trim().slice(0, n);
const choose = (v, list, fallback) => list.includes(v) ? v : fallback;

export const EFFECT_TYPES = [
  'stamp', 'sticky', 'ticket', 'calendar', 'ruler', 'bracket', 'flask', 'warning',
  'thermometer', 'burst', 'name_tag', 'firecracker', 'ant', 'polyp', 'text', 'label',
  'spray', 'smoke', 'rings', 'crosshair', 'glow', 'flow', 'sparkle', 'spark',
  'bubbles', 'flash', 'sound', 'reaction', 'rainbow', 'inflate', 'frost',
];
const settings = ['plain', 'outdoor', 'underwater', 'lab', 'xray'];
const layouts = ['hero', 'left', 'right', 'detail', 'comparison', 'split', 'poster', 'lower-left', 'lower-right'];
export const VISUAL_THEMES = ['dossier', 'newsprint', 'blueprint', 'field-journal', 'infographic', 'cream'];
const backgrounds = ['paper', 'forest', 'underwater', 'sky', 'city', 'lab', 'space', 'kitchen', 'photo'];
const titleStyles = ['bold', 'center', 'typewriter', 'kinetic'];
export const ATTACHABLE_EFFECTS = new Set(['spray', 'smoke', 'rings', 'crosshair', 'glow', 'flow', 'sparkle', 'spark']);
export const PROP_EFFECTS = new Set(['stamp', 'sticky', 'ticket', 'calendar', 'ruler', 'bracket',
  'flask', 'warning', 'thermometer', 'burst', 'name_tag', 'firecracker', 'ant', 'polyp', 'text', 'label', 'reaction']);
const cameras = ['push', 'pull', 'pan-left', 'pan-right', 'static', 'handheld'];
const motions = ['reveal', 'slide-left', 'slide-right', 'float', 'shake', 'static'];
const photoStyles = ['clean', 'polaroid', 'frame', 'poster'];
const soundCues = ['whoosh', 'pop', 'thud', 'boom', 'sizzle', 'question', 'mpop', 'tick', 'ding', 'boil', 'zap', 'boing', 'squeak', 'wind'];
const actions = ['identity', 'measure', 'heat', 'release', 'impact', 'signal', 'mix', 'transform', 'compare', 'none'];

function detectSetting(query = '') {
  if (/ocean|sea |seabed|underwater|coral|fish|jellyfish|octopus|marine|reef|river|lake/i.test(query)) return 'underwater';
  if (/xray|inside|body|internal|organ|chamber|enzyme|chemical reaction/i.test(query)) return 'xray';
  if (/lab|scientist|experiment|beaker|chemical/i.test(query)) return 'lab';
  if (/forest|jungle|plant|beetle|insect|tree|grass|nature|animal|desert|mountain/i.test(query)) return 'outdoor';
  return 'plain';
}

function fallbackEffects(s) {
  const query = `${s.visualQuery || ''} ${s.narration || ''} ${s.line1 || ''} ${s.line2 || ''}`;
  if (/heat|hot|temperature|boil|burn|degrees|°|गरम|उबाल/i.test(query)) return ['thermometer', 'smoke'];
  if (/spray|shoot|jet|eject|acid|defen[sc]e|छिड़क/i.test(query)) return ['spray', 'sparkle'];
  if (/sound|click|hear|noise|signal|आवाज़/i.test(query)) return ['rings', 'burst'];
  if (/inside|organ|reaction|enzyme|chemical|body|पेट/i.test(query)) return ['glow', 'flow'];
  if (/size|long|small|centimet|meter|cm|length|लंबा/i.test(query)) return ['ruler', 'bracket'];
  if (/underwater|ocean|sea |jelly|coral|water/i.test(query)) return ['bubbles', 'sparkle'];
  if (/change|transform|switch|difference|compare|बदल/i.test(query)) return ['ticket', 'sparkle'];
  return [s.effect || 'stamp', 'sparkle'];
}

export function normalizeDirective(scene, index = 0) {
  const setting = choose(scene.setting, settings, detectSetting(scene.visualQuery));
  const layout = choose(scene.layout, layouts, layouts[index % layouts.length]);
  const camera = choose(scene.camera, cameras, ['push', 'pan-left', 'pull', 'pan-right'][index % 4]);
  const motion = choose(scene.motion, motions, setting === 'underwater' ? 'float' : 'reveal');
  const action = choose(scene.action, actions, 'none');
  const theme = choose(scene.theme, VISUAL_THEMES,
    setting === 'xray' ? 'blueprint' : VISUAL_THEMES[index % VISUAL_THEMES.length]);
  const backgroundMode = choose(scene.backgroundMode, backgrounds, setting === 'underwater' ? 'underwater' : 'paper');
  const titleStyle = choose(scene.titleStyle, titleStyles, titleStyles[index % titleStyles.length]);
  const photoStyle = choose(scene.photoStyle, photoStyles, photoStyles[index % photoStyles.length]);
  const soundCue = choose(scene.soundCue, soundCues, '');
  const sfxQuery = short(scene.sfxQuery || '', 60).replace(/[^a-zA-Z0-9 +'-]/g, '');
  // An explicit empty effects array is intentional. Never inject an unrelated
  // ruler/flask just because the model declined to animate that fact.
  const proposed = Array.isArray(scene.effects) ? scene.effects : fallbackEffects(scene).map(type => ({ type }));
  const effects = proposed.slice(0, 5).filter(e => e && EFFECT_TYPES.includes(e.type)
    && !['crosshair', 'reaction'].includes(e.type)).map((e, i) => ({
    type: e.type,
    at: clamp(e.at ?? (.32 + i * .22), 0, .93),
    where: choose(e.where, ['subject', 'left', 'right', 'center', 'bottom'], i % 2 ? 'left' : 'right'),
    text: short(e.text || e.label || '', 26),
    direction: clamp(e.direction ?? 0, -180, 180),
    intensity: clamp(e.intensity ?? .6, .1, 1),
    rel: Array.isArray(e.rel) && e.rel.length === 2 ? [clamp(e.rel[0], .08, .92), clamp(e.rel[1], .08, .92)] : null,
  }));
  return { setting, layout, camera, motion, action, theme, backgroundMode, titleStyle, photoStyle, effects,
    soundCue, sfxQuery, callout: short(scene.callout || '', 38),
    beatTextHi: short(scene.beatTextHi || '', 56) };
}

export function requiredSounds(episode) {
  const out = new Set(['whoosh']);
  for (const s of episode.scenes) {
    if (s.soundCue) out.add(s.soundCue);
    for (const e of s.effects || []) {
      const cue = soundFor(e.type);
      if (cue) out.add(cue);
    }
    if (['impact', 'release'].includes(s.action)) out.add('boom');
  }
  return [...out];
}

function soundFor(type) {
  return ({ stamp: 'thud', sticky: 'question', warning: 'question',
    name_tag: 'pop', flask: 'pop', burst: 'mpop', reaction: 'squeak', spray: 'sizzle',
    bubbles: 'boil', flash: 'boom', firecracker: 'sizzle', spark: 'sizzle',
    sound: 'ding', calendar: 'pop', ticket: 'pop', thermometer: 'tick' })[type] || null;
}

function putSound(el, sfx, soundName = soundFor(el.type)) {
  el.sfx = soundName && sfx[soundName] ? soundName : false;
  if (el.sfx) el.sfx_db = ['boom', 'sizzle', 'boil'].includes(el.sfx) ? -20 : -17;
  return el;
}

function mainVisual(img, scene) {
  if (!img) return null;
  const pos = {
    hero: [540, 1145, 790],
    left: [400, 1170, 650],
    right: [680, 1170, 650],
    detail: [540, 1120, 840],
    comparison: [400, 1130, 600],
    split: [400, 1110, 610],
    poster: [540, 1080, 900],
    'lower-left': [400, 1320, 590],
    'lower-right': [680, 1320, 590],
  }[scene.layout];
  const [x, y, width] = pos;
  const move = scene.motion === 'static'
    ? { from: [x, y], to: [x, y] }
    : scene.motion === 'slide-left'
    ? { from: [x + 170, y], to: [x, y] }
    : scene.motion === 'slide-right'
      ? { from: [x - 170, y], to: [x, y] }
      : { from: [x + 25, y + 25], to: [x, y] };
  const safeMaxWidth = Math.min(width * 1.24, 2 * Math.min(x - 52, 1080 - x - 52));
  const element = img.cutout
    ? { id: 'subject', type: 'cutout', subject: 'subject', height: width, max_width: safeMaxWidth,
      mode: scene.setting === 'xray' ? 'xray' : 'color' }
    : { id: 'subject_photo', type: 'photo', image: img.path, width,
      photo_style: scene.photoStyle };
  Object.assign(element, { x: move.from[0], y: move.from[1], anim: scene.motion === 'static' ? 'none' : 'fade',
    in: .34 });
  if (scene.motion !== 'static') element.move = { to: move.to, at: .12, dur: 1.05 };
  if (scene.motion === 'float') element.float = { amp: 9, freq: 1.25, phase: .4 };
  if (scene.motion === 'shake') element.shake = { at: .35, amp: 7, freq: 24, dur: .85, decay: 'exp' };
  return element;
}

function location(effect, scene, i, hasCutout) {
  const positions = {
    hero: { left: [280, 1545], right: [795, 1540], center: [540, 1510], bottom: [540, 1690] },
    left: { left: [230, 1600], right: [790, 1290], center: [795, 1440], bottom: [540, 1690] },
    right: { left: [270, 1310], right: [815, 1580], center: [280, 1490], bottom: [540, 1690] },
    detail: { left: [250, 1600], right: [790, 1630], center: [540, 1510], bottom: [540, 1720] },
    comparison: { left: [245, 1570], right: [800, 1235], center: [800, 1430], bottom: [540, 1680] },
    split: { left: [245, 1490], right: [825, 1230], center: [815, 1460], bottom: [540, 1720] },
    poster: { left: [245, 1670], right: [820, 1670], center: [540, 1680], bottom: [540, 1760] },
    'lower-left': { left: [250, 1050], right: [800, 1170], center: [790, 1440], bottom: [540, 1760] },
    'lower-right': { left: [250, 1170], right: [800, 1050], center: [285, 1440], bottom: [540, 1760] },
  };
  const where = effect.where === 'subject' ? 'center' : effect.where;
  const [x, y] = positions[scene.layout][where] || [540, 1530];
  if (effect.where === 'subject' && hasCutout && ATTACHABLE_EFFECTS.has(effect.type)) {
    // For effects that support relative attachment, use the real image anchor.
    return { on: 'subject', rel: effect.rel || [.55, .58], dx: i ? 8 : 0, dy: 0 };
  }
  return { x: clamp(x, 90, 990), y: clamp(y, 740, 1760) };
}

// Gemini points into the original full Wikimedia photograph, but paper_doc
// crops the alpha-masked subject. Transform its origin into cropped cutout space.
export function remapAnchor(rel, image) {
  if (!rel || !image?.bbox) return rel;
  const { source, bbox } = image.bbox;
  if (!Array.isArray(source) || !Array.isArray(bbox) || source.length !== 2 || bbox.length !== 4) return rel;
  const [left, top, right, bottom] = bbox;
  const [width, height] = source;
  if (right <= left || bottom <= top || width <= 0 || height <= 0) return rel;
  return [clamp((rel[0] * width - left) / (right - left), .04, .96),
    clamp((rel[1] * height - top) / (bottom - top), .04, .96)];
}

const PROP_DIMENSIONS = {
  stamp: [430, 190], sticky: [420, 390], ticket: [490, 260], calendar: [360, 390], reaction: [350, 350],
  ruler: [660, 120], bracket: [710, 110], flask: [350, 440], warning: [390, 360],
  thermometer: [260, 540], burst: [490, 360], name_tag: [520, 350],
  firecracker: [280, 440], ant: [330, 200], polyp: [420, 510], text: [530, 120], label: [450, 90],
};

function rect(x, y, width, height) {
  return { x0: x - width / 2, x1: x + width / 2, y0: y - height / 2, y1: y + height / 2 };
}

function intersects(a, b, margin = 0) {
  return a.x0 < b.x1 + margin && a.x1 > b.x0 - margin &&
    a.y0 < b.y1 + margin && a.y1 > b.y0 - margin;
}

export function subjectBounds(main, image) {
  if (!main) return rect(540, 1140, 700, 520);
  const [x, y] = main.move?.to || [main.x, main.y];
  if (main.type === 'photo') return rect(x, y, main.width + 110, main.width * 0.93 + 150);
  const box = image?.bbox?.bbox;
  const ratio = Array.isArray(box) && box.length === 4 && box[3] > box[1]
    ? (box[2] - box[0]) / (box[3] - box[1]) : 1.2;
  const height = Math.min(main.height, main.max_width / ratio);
  return rect(x, y, height * ratio + 95, height + 95);
}

/** Keep physical props in reserved side/bottom zones, not on top of the animal.
 * Deliberate organic effects (spray, glow, rings) can attach to the real sprite.
 * Drop a non-essential prop if no collision-free placement exists. */
export function positionProp(el, scene, subject, occupied = [], preference = 'right') {
  if (!PROP_EFFECTS.has(el.type)) return el;
  let [rawWidth, rawHeight] = PROP_DIMENSIONS[el.type] || [350, 250];
  if (el.type === 'text') {
    const letters = String(el.text || '').length;
    rawWidth = Math.max(270, Math.min(890, letters * (el.size || 84) * .7 + 60));
    rawHeight = Math.max(120, (el.size || 84) * 1.2);
  }
  const originalScale = el.scale ?? 1;
  const side = scene.layout === 'right' || scene.layout === 'lower-right' ? 'left' : 'right';
  const topRow = el.type === 'text'; // Key spoken numbers need an upper safe zone.
  const candidates = {
    right: [...(topRow ? [[810, 830]] : []), [852, 1100], [845, 1460], [837, 1720]],
    left: [...(topRow ? [[270, 830]] : []), [228, 1100], [235, 1460], [243, 1720]],
    bottom: [[540, 1710], [770, 1700], [320, 1700]],
  };
  const order = [...new Set([preference === 'subject' ? side : preference,
    side, side === 'right' ? 'left' : 'right', 'bottom'])];
  let best = null;
  for (const factor of [1, .84, .68, .55]) {
    const width = rawWidth * originalScale * factor;
    const height = rawHeight * originalScale * factor;
    for (const [rank, zone] of order.entries()) {
      for (const [cx, cy] of candidates[zone] || []) {
        const area = rect(cx, cy, width, height);
        if (area.x0 < 70 || area.x1 > 1010 || area.y0 < 705 || area.y1 > 1850) continue;
        if (intersects(area, subject, 22) || occupied.some(used => intersects(area, used, 24))) continue;
        const score = rank * 100 + (1 - factor) * 90 + Math.abs(cy - 1240) / 35;
        if (!best || score < best.score) best = { x: cx, y: cy, area, score, factor };
      }
    }
    if (best) break;
  }
  if (!best) return null;
  occupied.push(best.area);
  if (el.type === 'bracket') {
    const half = (el.x1 - el.x0) * best.factor / 2;
    el.x0 = best.x - half; el.x1 = best.x + half; el.y = best.y;
  } else if (el.type === 'label') {
    el.x = best.x - rawWidth * originalScale * best.factor / 2;
    el.y = best.y - rawHeight * originalScale * best.factor / 2;
    el.size = Math.max(24, Math.round((el.size || 34) * best.factor));
  } else {
    el.x = best.x; el.y = best.y; el.scale = originalScale * best.factor;
    if (el.type === 'text') el.size = Math.max(58, Math.round((el.size || 84) * best.factor));
  }
  delete el.on; delete el.rel; delete el.dx; delete el.dy;
  return el;
}

function effectElement(e, scene, sceneDuration, i, hasCutout, sfx) {
  const at = Math.min(Math.max(.06, sceneDuration * e.at), Math.max(.06, sceneDuration - .15));
  const intensity = e.intensity;
  const caption = short(e.text || scene.callout || '', 24);
  const loc = location(e, scene, i, hasCutout);
  const base = { ...loc, type: e.type, at };
  switch (e.type) {
    case 'stamp': return putSound({ ...base, text: caption || 'FACT', size: 82, tilt: i % 2 ? 8 : -8,
      rot: i % 2 ? 6 : -6, anim: 'slam', scale: .78 }, sfx);
    case 'sticky': return putSound({ ...base, text: caption || '?', scale: .8, rot: -5 }, sfx);
    case 'ticket': return putSound({ ...base, strike: 'MYTH', ok: caption.slice(0, 10) || 'REAL', scale: .58 }, sfx);
    case 'calendar': return putSound({ ...base, top: 'FACT', big: caption.slice(0, 8) || 'TODAY', scale: .55 }, sfx);
    case 'ruler': return { ...base, units: 'CM', count: 5, scale: .55, sfx: false };
    case 'bracket': return { type: 'bracket', x0: 170, x1: 870, y: 1650, at, dur: .5, sfx: false };
    case 'flask': return putSound({ ...base, label: caption.slice(0, 15) || 'SCIENCE',
      liquid: [120, 190, 244], scale: .65 }, sfx);
    case 'warning': return putSound({ ...base, mark: '!', scale: .6 }, sfx);
    case 'thermometer': return putSound({ ...base, level: [[0, 0], [Math.min(1.1, sceneDuration * .65), .85]],
      labels: ['0', '50', '100°C'], scale: .64 }, sfx);
    case 'burst': return putSound({ ...base, text: caption.slice(0, 9) || 'WOW!', size: .48,
      anim: 'punch', rot: -6 }, sfx);
    case 'name_tag': return putSound({ ...base, line1: caption.slice(0, 12) || 'DID YOU',
      line2: 'KNOW?', sub: '', scale: .65 }, sfx);
    case 'reaction': return putSound({ ...base, mood: ['shocked', 'laugh', 'curious'].includes(caption.toLowerCase())
      ? caption.toLowerCase() : 'shocked', scale: .72, anim: 'pop' }, sfx);
    case 'rainbow': return { ...base, type: 'rainbow', x: 540, y: 1210, r: 330,
      dur: Math.max(1.1, sceneDuration - at - .2), sfx: false };
    case 'inflate': return { ...base, type: 'inflate', x: 540, y: 1280, r: 290,
      dur: Math.max(.9, sceneDuration - at - .15), sfx: false };
    case 'frost': return { ...base, type: 'frost', x: 540, y: 1220,
      r: Math.round(240 + intensity * 155), n: Math.round(14 + intensity * 18),
      seed: 75 + i, dur: Math.max(.8, sceneDuration - at - .1), sfx: false };
    case 'firecracker': return putSound({ ...base, label: 'BOOM', scale: .55 }, sfx);
    case 'ant': return { ...base, size: .8, sfx: false };
    case 'polyp': return { ...base, n: 5, seed: 3 + i, scale: .65, sfx: false };
    case 'text': return { ...base, text: caption || '!',
      size: (caption || '').length <= 5 ? 190 : (caption || '').length <= 10 ? 130 : 86,
      color: 'red', sfx: false };
    case 'label': return { ...base, text: caption || 'EVIDENCE', size: 34, dark: scene.dark || scene.setting === 'xray', sfx: false };
    case 'spray': return putSound({ ...base, dir: e.direction, n: Math.round(40 + intensity * 55),
      length: Math.round(180 + intensity * 310), seed: 2 + i, hot: scene.setting !== 'underwater', sfx_trim: 1.0 }, sfx);
    case 'smoke': return { ...base, n: 9 + Math.round(intensity * 9), spread: 90 + Math.round(intensity * 80), seed: 3 + i, sfx: false };
    case 'rings': return { ...base, n: 3, color: scene.setting === 'xray' ? 'blue' : 'red', sfx: false };
    case 'crosshair': return { ...base, r: Math.round(135 + intensity * 110), in: .38, sfx: false };
    case 'glow': return { ...base, rx: 42 + Math.round(intensity * 42), ry: 42 + Math.round(intensity * 40),
      level: [[0, .1], [.4, .9]], color: scene.setting === 'xray' ? 'blue' : 'orange', sfx: false };
    case 'flow': return { ...base, to: [760, 1370], n: 5, dur: Math.min(.9, sceneDuration * .5), color: 'blue', sfx: false };
    case 'sparkle': return { ...base, n: 7 + Math.round(intensity * 7), r: 80 + Math.round(intensity * 55), seed: 5 + i, sfx: false };
    case 'spark': return putSound({ ...base, sfx_trim: .5 }, sfx);
    case 'bubbles': return putSound({ type: 'bubbles', x: 540, y: 1570, x0: 220, x1: 920,
      rise: 600, n: 10 + Math.round(intensity * 14), at, sfx_trim: 1.3 }, sfx);
    case 'flash': return putSound({ type: 'flash', at, dur: .18 + intensity * .08, alpha: 85,
      color: 'white' }, sfx);
    case 'sound': return sfx.ding ? { type: 'sound', at, sfx: 'ding', sfx_db: -18 } : null;
    default: return null;
  }
}

export function buildAdvancedPlan(episode, timing, images, sfx, output, voice,
  { demo = false, fps = 30, seed = Math.floor(Math.random() * 1_000_000),
    backgroundPalette = 'random' } = {}) {
  if (timing.length !== episode.scenes.length || images.length !== timing.length) throw Error('Scene/media timing mismatch');
  backgroundPalette = ['white', 'black', 'random'].includes(backgroundPalette) ? backgroundPalette : 'random';
  const subjects = {};
  const scenes = [];
  const sounds = [];
  let previousTheme = null;
  for (let i = 0; i < episode.scenes.length; i++) {
    const s = episode.scenes[i];
    const directives = normalizeDirective(s, i);
    const props = directives.effects.filter(e => PROP_EFFECTS.has(e.type)).length;
    if (props && ['hero', 'poster', 'detail'].includes(directives.layout)) {
      // An unoccupied side of the frame is essential for giant instruments.
      directives.layout = (i + seed) % 2 ? 'left' : 'right';
    }
    if (!props && i > 0 && ['left', 'right'].includes(directives.layout) && (i + seed) % 3 === 0)
      directives.layout = 'poster';
    let theme = directives.setting === 'xray' ? 'blueprint' : directives.theme;
    if (theme === previousTheme) theme = VISUAL_THEMES[(VISUAL_THEMES.indexOf(theme) + 1 + seed % 3) % VISUAL_THEMES.length];
    previousTheme = theme;
    let page = ({ dossier: 'kraft', newsprint: 'newsprint', blueprint: 'dark',
      'field-journal': 'graph', infographic: 'ivory', cream: 'cream' })[theme];
    if (directives.backgroundMode === 'space') page = 'dark';
    else if (directives.backgroundMode === 'sky') page = 'ivory';
    else if (directives.backgroundMode === 'kitchen') page = 'cream';
    else if (directives.backgroundMode === 'lab') page = 'graph';
    if (backgroundPalette === 'white') page = 'white';
    if (backgroundPalette === 'black') page = 'black';
    if (backgroundPalette !== 'random') directives.backgroundMode = 'paper';
    directives.dark = ['dark', 'black'].includes(page);
    const img = images[i];
    const duration = timing[i].duration;
    const elements = [];
    const diagram = s.visual === 'diagram' && s.diagram?.nodes?.length >= 2 ? s.diagram : null;
    const main = diagram ? null : mainVisual(img, directives);
    const subject = subjectBounds(main, img);
    const occupied = [];
    if (main) {
      if (main.type === 'photo' || main.type === 'cutout') {
        main.shot_duration = duration;
        main.micro_direction = i % 2 ? -1 : 1;
      }
      if (main.subject) {
        main.subject = `subject${i}`;
        subjects[main.subject] = { image: img.path };
      }
      elements.push(main);
    } else if (diagram) {
      elements.push({ type: 'infographic', nodes: diagram.nodes, links: diagram.links,
        heading: diagram.heading, style: diagram.style || 'cards', x: 540, y: 1180, at: .16,
        dur: Math.max(.8, duration - .3), background_palette: backgroundPalette, sfx: false });
    } else if (s.visual !== 'illustration') {
      // A missing CC-licensed photo must not turn into an unrelated stock tag.
      // Show honest factual text as source-driven motion graphics instead.
      elements.push({ type: 'infographic',
        nodes: [{ label: s.line1, detail: s.subjectEntity || '' },
          { label: s.line2, detail: s.callout || '' }], links: [{ from: 0, to: 1 }],
        heading: '', style: i % 2 ? 'pathways' : 'spotlight', x: 540, y: 1180,
        at: .1, dur: Math.max(.8, duration - .25), background_palette: backgroundPalette, sfx: false });
    }
    const hasCutout = !!img?.cutout;
    // IDs are stable within each scene; relative effects can anchor to the subject.
    for (const [k, e] of directives.effects.entries()) {
      const unsafeJet = e.where === 'subject' && !hasCutout && ['spray', 'smoke', 'spark'].includes(e.type);
      const safeEffect = unsafeJet ? { ...e, type: 'burst', text: 'THE ACTION', where: 'right' } : e;
      const relative = safeEffect.where === 'subject' && hasCutout ? remapAnchor(safeEffect.rel, img) : safeEffect.rel;
      let effect = effectElement({ ...safeEffect, rel: relative }, directives, duration, k, hasCutout, sfx);
      if (effect) {
        if (!hasCutout && main?.type === 'photo' && safeEffect.where === 'subject' &&
            ['crosshair', 'rings', 'glow', 'sparkle', 'frost'].includes(effect.type)) {
          // Photo-specific non-physical emphasis tracks the actual framed
          // visual, instead of landing in a generic empty 1500px callout zone.
          effect.x = main.move?.to?.[0] ?? main.x;
          effect.y = main.move?.to?.[1] ?? main.y;
        }
        if (PROP_EFFECTS.has(effect.type)) effect = positionProp(effect, directives, subject, occupied, safeEffect.where);
        if (!effect) continue;
        elements.push(effect);
      }
    }
    if (directives.callout && !directives.beatTextHi && !elements.some(e => e.type === 'infographic')
        && !elements.some(e => e.type === 'label' || e.type === 'text')) {
      const label = positionProp({ type: 'label', text: directives.callout, x: 180, y: 1760,
        size: 31, at: Math.min(duration * .7, Math.max(.2, duration - .4)),
        dark: page === 'dark', sfx: false }, directives, subject, occupied, 'bottom');
      if (label) elements.push(label);
    }
    const scene = { start: timing[i].start, title: [s.line1, s.line2], red: i % 3 === 0 ? 1 : 2,
      fact_index: Number.isInteger(s.factIndex) ? s.factIndex : undefined,
      page, theme, layout: directives.layout, camera: directives.camera, elements,
      title_style: directives.titleStyle, background_mode: directives.backgroundMode,
      layout_qc: { subject, overlays: occupied } };
    if (directives.beatTextHi) scene.beat_text_hi = directives.beatTextHi;
    // Backgrounds describe the story location; a decorative grass/soil layer
    // must NOT appear in every underwater/forest fact by default.
    if (s.sceneryMode === 'paper-forest' && directives.backgroundMode === 'forest') scene.scenery = 3 + i;
    if (s.sceneryMode === 'paper-seabed' && directives.backgroundMode === 'underwater') {
      scene.water = 4 + i; scene.seabed = true;
    }
    if (sfx.boom && directives.action === 'impact') sounds.push({ t: timing[i].start + Math.min(.9, duration * .55), sfx: 'boom', db: -18, trim: .7 });
    if (s.soundCue && sfx[s.soundCue]) sounds.push({
      t: timing[i].start + Math.min(Math.max(.25, duration * .47), duration - .12),
      sfx: s.soundCue, db: -18, trim: Math.min(1.2, duration * .4) });
    scenes.push(scene);
  }
  const end = timing.at(-1);
  const plan = { meta: { title: episode.title, header: '', show_header: false,
    headline_hi: String(episode.headlineText || episode.headlineHi || '').trim().slice(0, 95),
    headline_highlight: String(episode.headlineHighlight || '').trim().slice(0, 40),
    language: episode.language || 'hi', facts: episode.facts || [],
    background_palette: backgroundPalette, voice: voice || undefined,
    out: output, duration: end.start + end.duration + .45, fps,
    end_fade: .27, whoosh_db: sfx.whoosh ? -22 : null,
    visual_seed: seed, sfx_map: sfx, require_external_sfx: !demo }, subjects, sounds, scenes };
  const issues = validateAdvancedPlan(plan);
  if (issues.length) throw Error(`Director plan rejected: ${issues.slice(0, 4).join('; ')}`);
  return plan;
}

export function validateAdvancedPlan(plan) {
  const errors = [];
  if (!Array.isArray(plan.scenes) || !plan.scenes.length) return ['No scenes'];
  for (let i = 0; i < plan.scenes.length; i++) {
    const scene = plan.scenes[i];
    const next = plan.scenes[i + 1]?.start ?? plan.meta.duration;
    if (i === 0 && scene.start !== 0) errors.push('First scene must start at zero');
    if (!(next > scene.start)) errors.push(`Scene ${i + 1}: timestamps not increasing`);
    if (!Array.isArray(scene.title) || scene.title.length !== 2) errors.push(`Scene ${i + 1}: missing title`);
    if (scene.elements.length > 14) errors.push(`Scene ${i + 1}: excessive props`);
    if (scene.layout_qc) {
      const { subject, overlays = [] } = scene.layout_qc;
      for (let k = 0; k < overlays.length; k++) {
        if (intersects(subject, overlays[k], 4)) errors.push(`Scene ${i + 1}: prop overlaps subject`);
        for (let n = k + 1; n < overlays.length; n++) {
          if (intersects(overlays[k], overlays[n], 4)) errors.push(`Scene ${i + 1}: props overlap each other`);
        }
      }
    }
    const ids = new Set(scene.elements.filter(e => e.id).map(e => e.id));
    for (const el of scene.elements) {
      if (!['cutout', 'photo', 'infographic', ...EFFECT_TYPES].includes(el.type)) errors.push(`Scene ${i + 1}: unknown ${el.type}`);
      if (el.type === 'infographic' && (!Array.isArray(el.nodes) || el.nodes.length < 2 || el.nodes.length > 4))
        errors.push(`Scene ${i + 1}: invalid infographic nodes`);
      if (el.on && !ids.has(el.on)) errors.push(`Scene ${i + 1}: missing anchor target ${el.on}`);
      if (el.on && scene.elements.find(x => x.id === el.on)?.type !== 'cutout') errors.push(`Scene ${i + 1}: anchor target not a cutout`);
      if (el.at !== undefined && (el.at < -0.01 || el.at > next - scene.start)) errors.push(`Scene ${i + 1}: invalid relative time`);
      if (el.x !== undefined && (el.x < -100 || el.x > 1170)) errors.push(`Scene ${i + 1}: x out of bounds`);
      if (el.y !== undefined && (el.y < 690 || el.y > 1910)) errors.push(`Scene ${i + 1}: y overlaps title or leaves frame`);
      if (el.type === 'cutout' && !plan.subjects?.[el.subject]) errors.push(`Scene ${i + 1}: subject missing`);
      if (el.sfx && !plan.meta.sfx_map?.[el.sfx]) errors.push(`Scene ${i + 1}: Freesound cue missing`);
    }
  }
  return errors;
}
