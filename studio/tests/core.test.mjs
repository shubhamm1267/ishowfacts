import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEpisode, validateThreeFacts, licenseInfo, isFreesoundCC0, buildPlan, demoEpisode,
  semanticEffectAllowed, normalizeDiagram, resolveVoiceProfile, speechPerformance,
  mediaTitleMismatch } from '../lib/core.mjs';
import { validateInput } from '../server.mjs';

test('validates storyboard and requires a real narration per scene', () => {
  const episode = demoEpisode();
  assert.equal(episode.scenes.length, 4);
  assert.deepEqual(validateThreeFacts(episode), []);
  assert.equal(episode.scenes[0].line1, 'EIGHT');
  assert.throws(() => normalizeEpisode({ scenes: [{ narration: 'one', line1: 'A', visualQuery: 'cat' }] }), /incomplete/i);
});

test('a Short must contain three distinct factual claims, each mapped to a story beat', () => {
  const episode = demoEpisode();
  episode.facts[2] = episode.facts[0];
  assert.match(validateThreeFacts(episode).join(' '), /distinct/);
  episode.facts[2] = 'They can squeeze through narrow spaces.';
  episode.scenes[2].factIndex = 1;
  episode.scenes[3].factIndex = 1;
  assert.match(validateThreeFacts(episode).join(' '), /fact 3/);
  episode.scenes[2].factIndex = 2;
  episode.scenes[3].factIndex = 2;
  assert.deepEqual(validateThreeFacts(episode), []);
});

test('studio background option accepts white, black and story-random only', () => {
  const before = process.env.DEMO_MODE;
  process.env.DEMO_MODE = '1';
  try {
    for (const mode of ['white', 'black', 'random'])
      assert.equal(validateInput({ backgroundPalette: mode, demo: true }).backgroundPalette, mode);
    assert.equal(validateInput({ backgroundPalette: 'neon', demo: true }).backgroundPalette, 'random');
  } finally {
    if (before === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = before;
  }
});

test('rejects incompatible image licenses, accepts CC0 and CC BY', () => {
  const meta = license => ({ LicenseShortName: { value: license }, Artist: { value: '<b>Creator</b>' } });
  assert.equal(licenseInfo(meta('CC0')).allowed, true);
  assert.equal(licenseInfo(meta('CC BY 4.0')).allowed, true);
  assert.equal(licenseInfo(meta('CC BY-SA 4.0')).allowed, false);
  assert.equal(licenseInfo(meta('CC BY-NC 4.0')).allowed, false);
  assert.equal(licenseInfo(meta('CC BY 4.0')).author, 'Creator');
});

test('Freesound API CC0 URL is recognized, BY and NC sounds are rejected', () => {
  assert.equal(isFreesoundCC0('http://creativecommons.org/publicdomain/zero/1.0/'), true);
  assert.equal(isFreesoundCC0('https://creativecommons.org/publicdomain/zero/1.0/'), true);
  assert.equal(isFreesoundCC0('http://creativecommons.org/licenses/by/4.0/'), false);
  assert.equal(isFreesoundCC0('http://creativecommons.org/licenses/by-nc/3.0/'), false);
});

test('builds phrase-synced audiovisual plan without default SFX when missing', () => {
  const episode = demoEpisode();
  const timing = episode.scenes.map((_, i) => ({ start: i * 2, duration: 2 }));
  const plan = buildPlan(episode, timing, [null, null, null, null], {}, '/tmp/video.mp4', null, { demo: true, fps: 10 });
  assert.equal(plan.meta.duration, 8.4);
  assert.equal(plan.meta.whoosh_db, null);
  assert.equal(plan.scenes.length, 4);
  assert.equal(plan.scenes[1].start, 2);
  assert.equal(plan.scenes[1].elements[0].sfx, false);
  assert.equal(plan.scenes[2].elements[1].sfx, false);
});

test('rejects live jobs with no keys; demo only when explicitly enabled', () => {
  const previous = process.env.DEMO_MODE;
  const keys = ['GEMINI_API_KEY', 'CARTESIA_API_KEY', 'CARTESIA_VOICE_ID', 'FREESOUND_API_KEY'];
  const before = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  delete process.env.DEMO_MODE;
  assert.throws(() => validateInput({ demo: true }), /disabled/);
  assert.throws(() => validateInput({ topic: 'octopus' }), /Set GEMINI_API_KEY/);
  process.env.DEMO_MODE = '1';
  assert.equal(validateInput({ demo: true, topic: 'x', seconds: 100 }).seconds, 50);
  for (const k of keys) if (before[k]) process.env[k] = before[k];
  if (previous === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = previous;
});

test('removes unrelated rulers and flasks from a story, keeps genuinely spoken measurements', () => {
  assert.equal(semanticEffectAllowed({ narration: 'Ten species belong to this small fish family.' }, 'ruler'), false);
  assert.equal(semanticEffectAllowed({ narration: 'Length reaches 18 cm.' }, 'ruler'), true);
  assert.equal(semanticEffectAllowed({ narration: 'Fish use water to hunt.' }, 'thermometer'), false);
  assert.equal(semanticEffectAllowed({ narration: 'It reaches 180 degrees Celsius.' }, 'thermometer'), true);
  const story = normalizeEpisode({ title: 'Facts', topic: 'Archerfish', scenes: Array.from({ length: 3 }, () => ({
    narration: 'These fish swim in rivers.', line1: 'FISH', line2: 'FACT', visualQuery: 'Toxotes',
    effects: [{ type: 'ruler' }, { type: 'flask' }, { type: 'sparkle' }],
  })) });
  assert.deepEqual(story.scenes[0].effects.map(e => e.type), ['sparkle']);
});

test('selectable male narrator profiles map to native accents with distinct speaking roles', () => {
  assert.equal(resolveVoiceProfile('hi-IN').locale, 'hi-IN');
  assert.equal(resolveVoiceProfile('hi-IN-anuj').locale, 'hi-IN');
  assert.notEqual(resolveVoiceProfile('hi-IN-anuj').voiceId, resolveVoiceProfile('hi-IN-ayush').voiceId);
  assert.notEqual(resolveVoiceProfile('hi-IN-rakesh').voiceId, resolveVoiceProfile('hi-IN-ayush').voiceId);
  assert.equal(resolveVoiceProfile('en-US').language, 'en');
  assert.equal(resolveVoiceProfile('en-GB').accent, 'british');
  assert.throws(() => resolveVoiceProfile('xx-XX'), /Unsupported/);
  assert.ok(speechPerformance({ delivery: 'hook' }).speed > speechPerformance({ delivery: 'suspense' }).speed);
});

test('prevents namesake amusement rides in nature fact footage', () => {
  assert.equal(mediaTitleMismatch('File:Electric Eel roller coaster ride.jpg', 'Electrophorus electric eel'), true);
  assert.equal(mediaTitleMismatch('File:Electric Eel.jpg', 'Electrophorus electric eel'), false);
  assert.equal(mediaTitleMismatch('File:Electric eel T-shirt.jpg', 'Electrophorus electric eel'), true);
  assert.equal(mediaTitleMismatch('File:Electric Eel Roller Coaster.jpg', 'Electric Eel roller coaster'), false);
});

test('fruit documentary rejects banana-money banknotes and disease images', () => {
  assert.equal(mediaTitleMismatch('File:Japanese occupation Banana money ten dollars.jpg', 'green plantain banana fruit'), true);
  assert.equal(mediaTitleMismatch('File:Banana Bunch Top Virus.jpg', 'banana bunch fruit'), true);
  assert.equal(mediaTitleMismatch('File:Banana plant Musa acuminata.jpg', 'banana bunch fruit'), false);
  assert.equal(mediaTitleMismatch('File:Banana currency banknotes.jpg', 'banana money banknote history'), false);
});

test('vetted 2–4 node animations reject malformed Gemini diagram references', () => {
  const diagram = normalizeDiagram({ heading: 'CAUSE', nodes: [
    { label: 'Sunlight' }, { label: 'Air' }, { label: 'Blue sky' }],
  links: [{ from: 0, to: 1 }, { from: 4, to: 8 }] });
  assert.equal(diagram.nodes.length, 3);
  assert.equal(diagram.links.length, 1);
  assert.equal(normalizeDiagram({ nodes: [{ label: 'One' }] }), null);
});
