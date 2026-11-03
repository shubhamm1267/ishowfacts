import { writeFile, readFile } from 'node:fs/promises';
import { AsyncLocalStorage } from 'node:async_hooks';
import { normalizeDirective } from './director.mjs';

const providerScope = new AsyncLocalStorage();

export function runWithProviders(keys, operation) {
  return providerScope.run(keys || {}, operation);
}

function providerValue(name) {
  const supplied = providerScope.getStore()?.[name];

  if (typeof supplied === 'string' && supplied.trim()) {
    return supplied.trim();
  }

  return process.env[name] || '';
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const brief = (s, n = 150) => String(s || '').trim().slice(0, n);

// Public voice IDs are deliberately separate from authentication secrets.
// These are native male voices, not a clone of any reference-video narrator.
export const VOICE_PROFILES = Object.freeze({
  'hi-IN': { label: 'Hindi (India) · energetic male Sagar', language: 'hi', locale: 'hi-IN',
    accent: 'standard-hindi', env: 'CARTESIA_VOICE_HI_MALE_ID', id: '6303e5fb-a0a7-48f9-bb1a-dd42c216dc5d' },
  'hi-IN-anuj': { label: 'Hindi (India) · expressive storyteller Anuj', language: 'hi', locale: 'hi-IN',
    accent: 'standard-hindi', env: 'CARTESIA_VOICE_HI_ANUJ_ID', id: '7e8cb11d-37af-476b-ab8f-25da99b18644' },
  'hi-IN-ayush': { label: 'Hindi (India) · bright young male Ayush', language: 'hi', locale: 'hi-IN',
    accent: 'standard-hindi', env: 'CARTESIA_VOICE_HI_AYUSH_ID', id: '791d5162-d5eb-40f0-8189-f19db44611d8' },
  'hi-IN-rakesh': { label: 'Hindi (India) · expressive narrator Rakesh', language: 'hi', locale: 'hi-IN',
    accent: 'standard-hindi', env: 'CARTESIA_VOICE_HI_RAKESH_ID', id: '6b7468f5-d6b0-4d6b-b38a-46f6d6e5bac7' },
  'en-US': { label: 'English (US) · male', language: 'en', locale: 'en-US',
    accent: 'general-american', env: 'CARTESIA_VOICE_EN_US_MALE_ID', id: '47c38ca4-5f35-497b-b1a3-415245fb35e1' },
  'en-GB': { label: 'English (UK) · male', language: 'en', locale: 'en-GB',
    accent: 'british', env: 'CARTESIA_VOICE_EN_GB_MALE_ID', id: 'ef191366-f52f-447a-a398-ed8c0f2943a1' },
});

export function resolveVoiceProfile(input = 'hi-IN-ayush') {
  const key = input === 'hi' ? 'hi-IN-ayush' : input === 'en' ? 'en-US' : String(input);
  if (!(key in VOICE_PROFILES)) throw Error('Unsupported voice accent');
  const v = VOICE_PROFILES[key];
  return { key, language: v.language, locale: v.locale, accent: v.accent,
    name: v.label, voiceId: process.env[v.env] || v.id };
}

export function speechPerformance(scene = {}, style = 'energetic') {
  const role = ['hook', 'suspense', 'explain', 'reveal', 'payoff'].includes(scene.delivery)
    ? scene.delivery : 'explain';
  const speed = ({ hook: 1.27, suspense: 1.18, explain: 1.24, reveal: 1.28, payoff: 1.28 })[role] -
    (style === 'balanced' ? .10 : 0);
  return { role, speed, emotion: ({ hook: 'excited', suspense: 'curious', explain: 'curious',
    reveal: 'excited', payoff: 'excited' })[role] };
}

export async function api(url, init = {}, retries = 2) {
  for (let i = 0; ; i++) {
    let response;
    try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(45_000) }); }
    catch (e) { if (i >= retries) throw Error(`Network failed: ${e.message}`); await sleep(900 * (i + 1) ** 2); continue; }
    if (response.ok) return response;
    const reason = (await response.text()).slice(0, 300);
    if (i >= retries || ![429, 500, 502, 503, 504].includes(response.status)) throw Error(`Provider HTTP ${response.status}: ${reason}`);
    await sleep(900 * (i + 1) ** 2);
  }
}

export async function gemini(prompt, imagePath = null) {
  if (!providerValue('GEMINI_API_KEY')) throw Error('GEMINI_API_KEY missing in .env');
  const model = providerValue('GEMINI_MODEL') || 'gemini-3.5-flash-lite';
  if (!/^[a-z\d.-]+$/i.test(model)) throw Error('Invalid Gemini model');
  const parts = [{ text: prompt }];
  for (const path of (imagePath ? (Array.isArray(imagePath) ? imagePath : [imagePath]) : [])) {
    const bytes = await readFile(path);
    if (bytes.byteLength > 8_000_000) throw Error('Image audit input too large');
    const mimeType = bytes[0] === 0x89 && bytes.subarray(1, 4).toString('ascii') === 'PNG'
      ? 'image/png' : 'image/jpeg';
    parts.push({ inlineData: { mimeType, data: bytes.toString('base64') } });
  }
  let lastReason = 'empty response';
  for (let attempt = 0; attempt < 3; attempt++) {
    const tunedParts = attempt ? [...parts, { text: '\nRETRY: Output one COMPLETE, compact JSON object. End with the final closing brace; no extra commentary or long prose.' }] : parts;
    const response = await api(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'x-goog-api-key': providerValue('GEMINI_API_KEY'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: tunedParts }], generationConfig: {
        responseMimeType: 'application/json', temperature: attempt ? 0.45 : 0.65,
        maxOutputTokens: attempt ? 14000 : 11000,
      } }),
    });
    const data = await response.json();
    const value = data.candidates?.[0]?.content?.parts?.map(x => x.text || '').join('') || '';
    const clean = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { if (clean) return JSON.parse(clean); } catch { /* Retry a truncated/malformed output. */ }
    lastReason = `${data.candidates?.[0]?.finishReason || 'unknown finish'}; ${value.length} characters`;
  }
  throw Error(`Gemini could not return valid JSON after retries (${lastReason})`);
}

export async function inspectImage(path, subject, narration, effects, { visualRole = 'subject', topic = '' } = {}) {
  const info = await gemini(`You are a STRICT factual footage editor, not an imaginative scene planner. TARGET PRIMARY ENTITY: ${brief(subject, 100)}. ROLE: ${visualRole}. VIDEO TOPIC: ${brief(topic, 80)}. Spoken line: ${brief(narration, 350)}. Inspect ONLY what is ACTUALLY visible in the photograph. If the target is archerfish and the photo prominently shows a crab, satellite map, any other fish or random landscape, matches MUST be false even when similar habitat plants are in the background. A context photo needs its own named entity visibly DOMINANT (e.g. mangrove trees must be the primary subject, not a tiny bit of foliage behind an unrelated crab). For scientific species, do not confuse with a close-looking different species. Is the entire main subject visibly complete and isolated enough for a clean cutout, with no objects crossing it? Reject tiny blurry specimens, partial tails/fins/legs, crowds and occluded specimens. For effects ${effects.map(e => e.type).join(', ')} give anchors ONLY for actually VISIBLE physical features; water spray must start at visible MOUTH, beetle chemical jet at rear abdomen, and not a plausible invented location. Coordinates are fractions of ORIGINAL IMAGE width/height, not cropped PNG; give confidence below .5 if ambiguous. JSON ONLY: {"matches":true,"confidence":0.95,"cutoutSuitable":true,"anchors":{"spray":{"point":[0.12,0.4],"confidence":0.92,"feature":"visible open mouth"}}}.`, path);
  const anchors = {}, confidences = {}, features = {};
  for (const [k, item] of Object.entries(info.anchors || {})) {
    const p = Array.isArray(item) ? item : item?.point;
    if (!Array.isArray(p) || p.length !== 2 || !p.every(v => Number.isFinite(Number(v)))) continue;
    anchors[k] = [clamp(Number(p[0]), .01, .99), clamp(Number(p[1]), .01, .99)];
    confidences[k] = clamp(Number(Array.isArray(item) ? .65 : item.confidence), 0, 1);
    features[k] = brief(item?.feature, 60);
  }
  return { matches: info.matches === true, confidence: clamp(Number(info.confidence) || .5, 0, 1),
    cutoutSuitable: info.cutoutSuitable === true, anchors, confidences, features };
}

export async function auditCutout(originalPath, cutoutPath, subject) {
  const r = await gemini(`You are a strict visual quality reviewer checking a background removal. FIRST image is the complete original photo. SECOND image is the isolated transparent foreground. Compare the same main subject (${brief(subject, 100)}). Are ALL clearly visible important body parts preserved (antennae, fins, legs, tail, arms) with no unnatural slicing, major holes or cut-off sections? Ignore the transparent background. Reject if any important part has been accidentally erased or if the background remains attached. JSON only: {"usable":true,"confidence":0.9,"missingParts":[],"reason":"clean complete mask"}.`, [originalPath, cutoutPath]);
  return { usable: r.usable !== false, confidence: clamp(Number(r.confidence) || .5, 0, 1),
    missingParts: Array.isArray(r.missingParts) ? r.missingParts.map(x => brief(x, 50)).slice(0, 5) : [],
    reason: brief(r.reason, 130) };
}

/** An attractive prop is not sufficient reason to show it. Only permit
 * physical instruments or creatures when the spoken FACT requires them. */
export function semanticEffectAllowed(scene, type) {
  const phrase = `${scene.narration || ''} ${scene.line1 || ''} ${scene.line2 || ''} ${scene.callout || ''}`.toLowerCase();
  const match = exp => exp.test(phrase);
  const rules = {
    ruler: /\b\d+(?:\.\d+)?\s*(cm|mm|km|m|feet|ft|inch|inches|meter|metre|miles?)\b|सेमी|सेंटीमीटर|मीटर|लंबाई|दूरी|नाप|माप|कितना (बड़ा|लंबा)/i,
    bracket: /\b(size|width|length|jaw|mouth|part|anatomy|measure|diameter|distance)\b|जबड़ा|मुंह|आकार|लंबाई|चौड़ाई|शरीर का हिस्सा/i,
    thermometer: /\b(heat|degrees?|temperature|celsius|fahrenheit|hot|cold|boiling|°)\b|गरम|गर्म|ठंड|तापमान|डिग्री|उबल/i,
    calendar: /\b(year|years|days?|months?|centur|date|age|hour|minute)\b|साल|दिन|महीन|इतिहास|शताब्दी/i,
    flask: /\b(chemical|reaction|acid|fluid|laboratory|experiment|compound|enzyme)\b|रसायन|एसिड|प्रयोग|केमिकल|अम्ल/i,
    firecracker: /\b(explod|blast|bomb|detonat|burst|firework)\b|धमाका|विस्फोट|फट/i,
    spray: /\b(spray|water jet|spit|eject|squirt|shoot water|splash)\b|पानी की धार|पानी फेंक|फुहार|छिड़क|थूक/i,
    ant: /\bants?\b|चींटी/i,
    polyp: /\b(polyps?|coral)\b|पॉलिप|कोरल/i,
    bubbles: /\b(underwater|ocean|sea|water|aquatic|air bubble|dive)\b|पानी|समुद्र|बुलबुल/i,
    rainbow: /rainbow|spectrum|इंद्रधनुष|रंगीन|सात रंग|प्रकाश/i,
    inflate: /inflate|inflation|swell|puffer|balloon|फुल|गुब्बारा|पफर/i,
    frost: /freez|frozen|ice|snow|cold|winter|फ्रीज|जम|बर्फ|ठंड|सर्दी/i,
  };
  return !rules[type] || match(rules[type]);
}

export function normalizeDiagram(diagram) {
  if (!diagram || !Array.isArray(diagram.nodes)) return null;
  const nodes = diagram.nodes.slice(0, 4).map(n => ({
    label: brief(n?.label, 24).replace(/[<>]/g, ''),
    detail: brief(n?.detail, 34).replace(/[<>]/g, ''),
  })).filter(n => n.label);
  if (nodes.length < 2) return null;
  const links = Array.isArray(diagram.links) ? diagram.links.slice(0, 4)
    .map(x => ({ from: Number(x?.from), to: Number(x?.to), label: brief(x?.label, 18) }))
    .filter(x => Number.isInteger(x.from) && Number.isInteger(x.to) && x.from >= 0 && x.to > x.from && x.to < nodes.length) : [];
  const styles = ['cards', 'contrast', 'orbit', 'timeline', 'steps', 'pathways', 'mechanism', 'spotlight'];
  return { nodes, links, heading: brief(diagram.heading, 30),
    style: styles.includes(diagram.style) ? diagram.style : 'cards' };
}

export function normalizeEpisode(raw) {
  if (!Array.isArray(raw?.scenes)) throw Error('No storyboard scenes');
  const scenes = raw.scenes.slice(0, 12).map((s, i) => {
    const base = {
      narration: brief(s.narration, 550), line1: brief(s.line1, 32),
      line2: brief(s.line2, 32), visualQuery: brief(s.visualQuery, 90),
      visual: ['photo', 'cutout', 'diagram', 'xray', 'illustration'].includes(s.visual) ? s.visual : 'photo',
      effect: ['stamp', 'warning', 'burst', 'ticket', 'ruler', 'flask', 'calendar'].includes(s.effect) ? s.effect : 'stamp',
      subjectEntity: brief(s.subjectEntity || raw.topic || '', 70),
      visualRole: ['subject', 'context', 'evidence', 'diagram', 'comparison'].includes(s.visualRole) ? s.visualRole : 'subject',
      delivery: ['hook', 'suspense', 'explain', 'reveal', 'payoff'].includes(s.delivery) ? s.delivery :
        (i === 0 ? 'hook' : i === raw.scenes.length - 1 ? 'payoff' : 'explain'),
      factIndex: Number.isInteger(Number(s.factIndex)) && Number(s.factIndex) >= 0 && Number(s.factIndex) <= 2
        ? Number(s.factIndex) : null,
      diagram: normalizeDiagram(s.diagram),
    };
    const safe = { ...s, ...base };
    if (Array.isArray(s.effects)) safe.effects = s.effects.filter(effect => semanticEffectAllowed(s, effect?.type));
    return { ...base, ...normalizeDirective(safe, i) };
  });
  if (scenes.length < 3 || scenes.some(s => !s.narration || !s.line1 || !s.visualQuery)) throw Error('Storyboard incomplete');
  const headlineText = brief(raw.headlineText || raw.headlineHi || raw.headline_hi || '', 95);
  const facts = Array.isArray(raw.facts) ? raw.facts.slice(0, 3).map(x => brief(x, 250)) : [];
  return { title: brief(raw.title, 110) || 'Paper Facts', topic: brief(raw.topic, 90),
    headlineText, headlineHi: headlineText,
    headlineHighlight: brief(raw.headlineHighlight || '', 40),
    language: raw.language === 'en' ? 'en' : 'hi', facts, scenes };
}

/** Three sourced observations, not three numbered tutorial stages. */
export function validateThreeFacts(episode) {
  const errors = [];
  const facts = episode?.facts || [];
  if (facts.length !== 3 || facts.some(f => String(f).trim().length < 12))
    errors.push('Exactly three concrete source-backed fact statements required');
  if (new Set(facts.map(f => String(f).toLowerCase().replace(/[\p{P}\p{S}\p{Z}]/gu, ''))).size !== 3)
    errors.push('The three fact claims must be distinct');
  const used = (episode?.scenes || []).map(s => s.factIndex);
  for (const index of [0, 1, 2]) if (!used.includes(index))
    errors.push(`No storyboard shot explaining fact ${index + 1}`);
  if (used.some(x => x !== null && ![0, 1, 2].includes(x))) errors.push('Invalid fact mapping');
  const active = used.filter(x => x !== null);
  if (active.some((x, i) => i > 0 && x < active[i - 1]))
    errors.push('Fact groups must progress through the documentary, not jump back');
  return errors;
}

/** Wikimedia searches work best with short subject labels; generative-image
 * prompt words ("cutout white background") rarely appear in Commons titles.
 * Use a verifiable source-mentioned scientific genus as a nature fallback. */
export function mediaSearchQueries(scene, source, topic) {
  const visual = brief(scene.visualQuery, 90);
  const stripped = visual.replace(/\b(shooting water|water jet|cutout|isolated|transparent|white background|photo(graph)?|high resolution|close[- ]?up|shooting|splashing|head)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  const genus = /\b(?:genus|genera)\s*,?\s*([A-Z][a-z]{4,})\b/.exec(source?.extract || '')?.[1];
  const subject = brief(source?.title || topic, 75);
  // Commons search may otherwise return a nutrition-label photograph for a
  // kernel scene, or a crab for a species scene. Pair the spoken subject with
  // the scene noun before exhausting the broad article-name fallback.
  const contextual = stripped && subject && subject.length < 46 &&
    !stripped.toLowerCase().includes(subject.toLowerCase()) ? `${subject} ${stripped}` : null;
  const order = scene.visual === 'cutout'
    ? [stripped, contextual, genus, subject, visual]
    : [visual, contextual, stripped, subject, genus];
  return [...new Set(order.filter(x => x && x.length >= 3))];
}

export async function chooseTopic() {
  const r = await gemini(`Select ONE visually striking, evergreen, scientifically well-established nature/space/history topic with AT LEAST THREE independently verifiable, visually distinct facts for a rapid YouTube Short. Avoid contentious, medical or news topics. Change the choice for each seed. Answer JSON {"topic":"..."}. Seed ${crypto.randomUUID()}`);
  if (!brief(r.topic, 90)) throw Error('Topic selection failed');
  return brief(r.topic, 90);
}

export async function wikipediaSource(topic) {
  // REST summary is a lighter, directly attributable official Wikipedia route.
  // The older w/api.php search endpoint can return transient 429s during
  // bursts of Shorts creation; try the exact article summary first.
  try {
    const title = brief(topic, 125).replaceAll(' ', '_');
    const summaryURL = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const response = await api(summaryURL, { headers: {
      'User-Agent': 'PaperFactsStudio/4.2 (local educational documentary maker)',
      Accept: 'application/json',
    } }, 1);
    const data = await response.json();
    const extract = brief(data.extract, 12000);
    if (data.type !== 'disambiguation' && extract.length >= 180) {
      return { title: data.title || topic,
        url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
        extract };
    }
  } catch { /* Search API fallback handles approximate/free-form user topics. */ }
  const search = new URL('https://en.wikipedia.org/w/api.php');
  Object.entries({ action: 'query', list: 'search', srsearch: topic, srlimit: '3', format: 'json' })
    .forEach(([k, v]) => search.searchParams.set(k, v));
  const result = await (await api(search)).json();
  const name = result.query?.search?.[0]?.title;
  if (!name) throw Error(`No encyclopedia entry: ${topic}`);
  const endpoint = new URL('https://en.wikipedia.org/w/api.php');
  Object.entries({ action: 'query', prop: 'extracts', exintro: '1', explaintext: '1', titles: name, format: 'json', redirects: '1' })
    .forEach(([k, v]) => endpoint.searchParams.set(k, v));
  const body = await (await api(endpoint)).json();
  const page = Object.values(body.query?.pages || {})[0];
  const extract = brief(page?.extract, 12000);
  if (extract.length < 120) throw Error('Source has insufficient facts; try a specific subject');
  return { title: page.title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(' ', '_'))}`, extract };
}

export async function writeEpisode(topic, source, language, seconds, humorIntensity = 'cheeky') {
  const speech = language === 'hi'
    ? 'Energetic male Hindi facts-presenter writing in fluent natural DEVANAGARI Hindi. Short punchy spoken phrases, deliberate suspense, strong emphasis on ONE surprise per scene; not robotic and not a formal lecture. IMPORTANT: ALL on-screen line1, line2, headlineHi and beatTextHi must also be readable DEVANAGARI HINDI, not Latin transliteration, except unavoidable English scientific names/units.'
    : 'Energetic male English factual-presenter writing in conversational clear English, sharp hook and reveal, rising curiosity and strategic short pauses; EVERY caption, headline, callout, diagram node and title must be LATIN-script English. NO Devanagari anywhere.';
  const humor = humorIntensity === 'edgy'
    ? (language === 'hi' ? 'Allow at most ONE naturally fitting mild comic exclamation like "अरे साला!" or playful "बेन स्टोक्स!" after a reveal. No insulting people, families, protected groups, or forced swearing.' : 'Allow at most ONE light irreverent punchline, such as "what the heck" or "bloody clever", when earned by the fact.')
    : humorIntensity === 'clean' ? 'No swearing. Clever, non-insulting humor is fine.'
    : 'Use occasional clever, mildly cheeky human humor when earned; do not force a joke or swear.';
  let prompt = `YOU ARE THE FACT CHECKER, DOCUMENTARY EDITOR, AND CREATIVE ANIMATION DIRECTOR of a 9:16 Shorts channel. The sample references use fast curiosity hooks, direct proof, clear mechanism graphics and a memorable reveal—not a single repeated centred template.
SOURCE ${source.url}\n${source.extract}\nTOPIC ${topic}. Target roughly ${seconds}s / ${Math.round(seconds * 2.85)} natural spoken words. ${speech}
Use ONLY facts explicitly present in the cited source. If precise numerals are unsupported, OMIT them. Never add a different animal, invented scientific experiment, unrelated graph, satellite map, appliance, ruler or flask as stock filler.
One 9:16 SHORT uses a SHARP HINDI TOP BANNER headlineHi of 6–13 easy Hindi words, derived from the ACTUAL topic and curiosity gap (e.g. 'ये मेंढक बर्फ में कैसे ज़िंदा रहता है?'). This will sit in a dark rounded banner at the VERY TOP, visible through every shot. For each scene provide line1 and line2 as 1–4 LARGE HINDI words EACH (avoid long words and do not repeat exact same pair). A separate optional beatTextHi is 1–4 emotionally punchy HINDI words for an animated lower-third proof or comedy reaction. All these fields must be in Devanagari if the narration language is Hindi. Relevance matters more than decorations; each title must describe the current actual image/action.
Create 5–8 SHOTS (roughly 2–5s each). DO NOT ALWAYS USE THE SAME story formula or three-step tutorial. For this video randomly choose a natural creative structure fitting the source: (A) impossible-sounding hook→proof→surprising reveal, (B) audience challenge→comic demonstration→scientific punchline, (C) misdirection→identity reveal→real-world consequence, (D) mystery→visual clue→twist, (E) size/power comparison→unexpected truth. Choose the best, vary shot lengths/compositions, and keep the facts defensible. FIRST or SECOND spoken sentence MUST EXPLICITLY NAME THE MAIN TOPIC/ANIMAL/OBJECT in its natural Hindi (e.g. 'इलेक्ट्रिक ईल', 'वीनस फ्लाइट्रैप', 'इंद्रधनुष'); no nameless 'ये पौधा' for the whole video. The opening must be a punchy, surprising, sourced 1–2 sentence CURIOSITY GAP whose answer the viewer wants. Finish with a memorable factual twist. Where suited, a quick harmless visual comedy moment (comic anticipation, surprised expression, playful one-liner) is welcome but do not invent an animal action or laugh at something unrelated. Speech must sound like a human fast facts presenter, with punctuation for breaths and excitement (short questions, a well-placed '!' or pause '…'). For each shot provide delivery hook/suspense/explain/reveal/payoff; alternate energetic and measured lines. NO greeting, filler, subscribe request, or repeating the hook.
EACH shot must SAY an actual sourced fact, mechanism, or question that is immediately answered; no empty lines like "देखो जादुई मेकैनिज्म", "यह बहुत हैरान करने वाला है" or another hype sentence with zero information. When the source contains a striking precise number, work the number and correct UNIT into an appropriate spoken line and a large on-screen numeric text effect (e.g. "860 V" for voltage, never a centimetre ruler for voltage). Do not exaggerate "only", "always", "never", or a species' geographic range beyond what the source actually states.
VISUAL TRUTH: every shot must specify subjectEntity (an EXACT visible object or named organism), visualRole subject/context/evidence/diagram/comparison and a SHORT Wikimedia Commons search term visualQuery (prefer exact species/binomial name for animals). If this story is ABOUT ARCHERFISH, the foreground image must be of ARCHERFISH; a crab standing among mangrove plants IS NOT archerfish footage. Context shots need their own explicitly stated and narrated subject. If the narrative discusses anatomy inside an animal, use a labeled conceptual diagram rather than pretending an ordinary photo reveals hidden organs. No location aerial shot unless location itself is the spoken fact.
If the story discusses the TRAP of a Venus flytrap, show its actual trapping leaves, not an unrelated flower, unless the flower is itself the narrated fact. A document photo for a historical claim must be the ACTUAL named document or genuinely relevant dated historical record, not a random parchment. Choose evidence you could truthfully caption in a documentary.
Choose the shot's backgroundMode paper/forest/underwater/sky/city/lab/space/kitchen/photo based on what is physically relevant. No default grass/soil/seabed scenery: a documentary about sky, physics, electricity or history MUST NOT contain decorative soil, grass or a fish-tank seabed. Select scene-specific layout hero/left/right/detail/comparison/split/poster/lower-left/lower-right; theme dossier/newsprint/blueprint/field-journal/infographic/cream; titleStyle bold/center/typewriter/kinetic; photoStyle clean/polaroid/frame/poster (vary; NEVER use the same one throughout); camera push/pull/pan-left/pan-right/static/handheld; motion reveal/slide-left/slide-right/float/shake/static; setting plain/outdoor/underwater/lab/xray; action identity/measure/heat/release/impact/signal/mix/transform/compare/none. CHANGE composition and visual grammar across scenes. No 'FIG. 01' or 'PAPER FACTS' overlay; the renderer deliberately hides these.
For an invisible mechanism or causal process USE visual="diagram" and provide diagram with 2–4 FACTUAL nodes [{"label":"...","detail":"..."}] and optional links [{"from":0,"to":1,"label":"..."}]. Set diagram.style to cards/contrast/orbit/timeline; reserve steps ONLY for a real temporal sequence. These are different animated infographic compositions without default 1-2-3 step labels. Use at most TWO diagram shots per 6-shot episode, only if they explain an otherwise invisible mechanism. Prefer 4+ real photos/cutouts showing the EXACT topic, when licensed evidence exists.
For story-specific sound design select soundCue from whoosh/pop/thud/boom/sizzle/question/mpop/tick/ding/boil/zap/boing/squeak/wind for 2–3 appropriate shots and supply sfxQuery e.g. 'short playful balloon boing', 'quick electric shock zap' for Freesound CC0 search; sound cues MUST reflect the narrated physical event. Use comedy cue only when it genuinely improves the beat, not constant random laughter or deafening booms.
For a true geometric/scientific phenomenon with an exact procedural visual (e.g. full rainbow circle), choose visual="illustration" and matching code-native rainbow effect instead of fabricating a photographic claim. This produces an animated vector paper diagram with no stock image. Only choose illustration when the physics truly supports it; otherwise actual photos/cutouts.
Only select relevant animated effect types: stamp,sticky,ticket,calendar,ruler,bracket,flask,warning,thermometer,burst,name_tag,firecracker,ant,polyp,text,label,spray,smoke,rings,crosshair,glow,flow,sparkle,spark,bubbles,flash,sound,reaction,rainbow,inflate,frost. Only use rainbow for an actual rainbow/spectrum, inflate for a puffing/swelling subject, and frost for a physically cold/frozen scene. For ONE funny twist shot, reaction text 'shocked'/'laugh'/'curious' shows a small animated paper expression sticker; only when story-motivated. Set effects=[] when NO physical effect is relevant. Strict: ruler is ONLY for explicitly SPOKEN size/distance, thermometer ONLY for temperature, calendar ONLY for date/time, flask ONLY for chemistry, ant ONLY if ants actually appear, bubbles ONLY in water. Sprays must start at an actual visible emitting mouth/organ; image QA validates the exact anchor. NEVER put instruments on top of the primary subject. Effects timing 'at' is a 0–1 fraction of scene duration. Keep fact graphic labels short and readable in Hindi, and use complete silhouettes for true cutouts.
JSON schema ONLY: {"title":"...","topic":"...","headlineHi":"ये अनोखी चीज़ ऐसा कैसे करती है?","scenes":[{"narration":"...","line1":"हिंदी शीर्षक","line2":"हिंदी शब्द","beatTextHi":"सच में!","subjectEntity":"exact visible entity","visualRole":"subject","visualQuery":"specific photo search","visual":"cutout","photoStyle":"clean","diagram":{"heading":"MECHANISM","style":"contrast","nodes":[{"label":"...","detail":"..."},{"label":"...","detail":"..."}],"links":[{"from":0,"to":1,"label":"..."}]},"delivery":"hook","backgroundMode":"sky","setting":"plain","layout":"left","theme":"newsprint","titleStyle":"kinetic","camera":"push","motion":"reveal","action":"identity","soundCue":"boing","sfxQuery":"short cartoon bounce boing","callout":"...","effects":[{"type":"sparkle","at":0.4,"where":"right","intensity":0.65}]}]}`;
  prompt += `\nV8 FINAL DIRECTOR OVERRIDES (these take precedence over any earlier example): ${speech} ${humor}
LANGUAGE=${language}. Output language:${language === 'hi' ? ' EVERY onscreen field (headlineText, headlineHighlight, line1, line2, beatTextHi, callout, diagram heading, nodes, details and link labels) MUST be natural Devanagari Hindi.' : ' EVERY onscreen field MUST be natural Latin-script ENGLISH; do not output any Devanagari Hindi.'}
Use headlineText as the STATIC black banner's punchy curiosity title, and headlineHighlight as EXACT first 1–3 words to paint yellow; remainder white. Top banner remains fixed through every shot. This replaces headlineHi in all old instructions, although the renderer accepts both keys.
Use diagram.style pathways (animated luminous causal paths), mechanism (dynamic orbital mechanism), spotlight (central insight plus evidence) or contrast (cinematic split-screen), NOT simple beige cards, generic numbered steps, or 'VS' labels. At most two explanatory diagrams per video; graphical labels match chosen language. Never request crosshair, targeting ring, generic happy emoji sticker or basic 'reaction'. Actual photography must show correct named species. Prefer photographic causality, object motion and physical effects rather than stickers.
No title-card template covering the whole frame. Each scene should move its actual subject or causal diagram. Variation of formats is mandatory, but factual accuracy is more important than novelty. JSON schema includes top-level language, headlineText, headlineHighlight, scenes. Each scene still has mandatory narration,line1,line2,visualQuery,visual and optional diagram.
MANDATORY THREE-FACT FORMAT: provide EXACTLY THREE separate, concrete, non-duplicated, source-supported claims in top-level "facts": ["fact claim A", "fact claim B", "fact claim C"], all in narration language. Do NOT confuse three FACTS with an ordinary three-step process. Each claim must be objectively checkable against SOURCE. Create 5–7 VERY FAST shots, each 1 concise punchy sentence (roughly 8–17 spoken words) and scene.factIndex 0, 1 or 2. A short visual hook may share factIndex 0. Explain all three facts with at least one scene each; factIndex values must appear in that order but NEVER print "1,2,3", "fact one", or step cards onscreen. Example story grammar: shocking fact A, evidence, totally different fact B, demonstration, surprising fact C, memorable callback. Strong natural energetic Hindi/English delivery with no robotic pauses, no filler and fast 1–3-second visual transitions. On-screen labels use at most 4 short words and MUST NOT cover the subjects. JSON also has facts and factIndex on EVERY scene.`;
  let problem = 'invalid scene structure';
  for (let attempt = 0; attempt < 3; attempt++) {
    const answer = await gemini(attempt === 0 ? prompt : `${prompt}\nIMPORTANT REPAIR: Previous attempt gave ${problem}. Produce a SINGLE TOP-LEVEL JSON object with scenes as an ARRAY of 5–8 complete shot objects. The key MUST be named exactly "scenes". No nested planning or metadata-only answer.`);
    const data = Array.isArray(answer?.scenes) ? answer
      : [answer?.storyboard, answer?.episode, answer?.video].find(x => Array.isArray(x?.scenes)) || answer;
    try {
      const candidate = normalizeEpisode(data);
      const factIssues = validateThreeFacts(candidate);
      if (factIssues.length) throw Error(`Three-fact storyboard required: ${factIssues.join('; ')}`);
      const needsHindiFactTranslation = language === 'hi' &&
        candidate.facts.some(f => !/[\u0900-\u097F]/.test(f));
      if (language === 'en' && candidate.facts.some(f => /[\u0900-\u097F]/.test(f)))
        throw Error('All three fact claims must be in English');
      if (language === 'hi' && (!/[\u0900-\u097F]/.test(candidate.headlineText) ||
        candidate.scenes.some(s => !/[\u0900-\u097F]/.test(s.line1) || !/[\u0900-\u097F]/.test(s.line2))))
        throw Error('Hindi Short requires a Devanagari top headline and shot-specific Devanagari title cards');
      if (language === 'en' && /[\u0900-\u097F]/.test([candidate.headlineText,
        candidate.headlineHighlight, ...candidate.scenes.flatMap(s => [s.line1, s.line2, s.beatTextHi,
          s.callout, s.diagram?.heading, ...(s.diagram?.nodes || []).flatMap(n => [n.label, n.detail])])].join(' ')))
        throw Error('English Short cannot contain Hindi/Devanagari visual labels');
      candidate.language = language;
      if (candidate.scenes.filter(s => s.visual === 'diagram').length > Math.max(2, Math.floor(candidate.scenes.length / 3)))
        throw Error('Too many diagrams for one factual Short; vary with actual photographs and object actions');
      if (language === 'hi') {
        // Gemini's first creative pass can make plausible-looking but unusable
        // phonetic Hindi typos. A dedicated grammar pass corrects spoken words,
        // scientific names and Devanagari visuals before Cartesia speaks them.
        try {
          const copy = await gemini(`You are a meticulous native-Hindi documentary copyeditor. PROOFREAD this exact factual Short, correcting garbled Hindi spellings, Hindi grammar, proper nouns and scientific terminology. Keep the same scene count, topic, exact factual claims, values, scene JSON objects, media queries, diagrams, humor and delivery. Do NOT introduce or remove any facts. CRITICAL: "पथब" is not "पत्थर", "बरय" is not "बर्फ", "भलटे" is not "चलते". Fix such nonsense. Translate EACH of the three top-level facts into natural factual Hindi Devanagari; retain factIndex mapping. Headline, captions, all scene labels must stay Hindi Devanagari. Return the WHOLE corrected JSON object, not a summary. Source: ${source.extract.slice(0, 2400)}\nDRAFT:${JSON.stringify(candidate)}`);
          const changed = normalizeEpisode(copy);
          if (changed.scenes.length === candidate.scenes.length &&
              validateThreeFacts(changed).length === 0 &&
              changed.facts.every(f => /[\u0900-\u097F]/.test(f)) &&
              changed.scenes.every(s => /[\u0900-\u097F]/.test(s.narration) &&
                /[\u0900-\u097F]/.test(s.line1))) {
            changed.language = 'hi';
            return changed;
          }
        } catch { /* Keep the validated source-backed draft if proofreading is unavailable. */ }
      }
      if (needsHindiFactTranslation)
        throw Error('All three fact claims must be in Devanagari; Hindi copy-edit must translate facts');
      return candidate;
    }
    catch (error) { problem = `${error.message}; received keys ${Object.keys(answer || {}).join(',').slice(0, 100)}`; }
  }
  throw Error(`Gemini could not produce a complete factual storyboard after 3 attempts (${problem})`);
}

export function licenseInfo(metadata) {
  const field = name => String(metadata?.[name]?.value || '').replace(/<[^>]*>/g, '').trim();
  const license = field('LicenseShortName');
  const allowed = /^(cc0(?: 1\.0)?|public domain(?: mark)?|pd)$/i.test(license) || /^cc by(?: [234]\.[05])?$/i.test(license);
  return { allowed, license, author: field('Artist').slice(0, 250), credit: field('Credit').slice(0, 250),
    licenseUrl: field('LicenseUrl') };
}

export async function commonsImage(query, dest, alreadyUsed = new Set()) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({ action: 'query', generator: 'search', gsrsearch: brief(query, 90), gsrnamespace: '6',
    gsrlimit: '20', prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '850', format: 'json' })
    .forEach(([k, v]) => url.searchParams.set(k, v));
  const result = await (await api(url)).json();
  // MediaWiki returns pages keyed by numeric page IDs; Object.values alone
  // silently sorts by ID, NOT search rank. Keep search relevance and diversity.
  const pages = Object.values(result.query?.pages || {}).sort((a, b) => (a.index ?? 9999) - (b.index ?? 9999));
  for (const page of pages) {
    if (alreadyUsed.has(page.title)) continue;
    if (mediaTitleMismatch(page.title, query)) continue;
    // Structural mismatch: a photo of a package's ingredient table is not
    // suitable evidence of the food itself (or of its physical expansion).
    if (/nutrition(?:al)?|ingredients|barcode|product label|nutrition facts|table of contents/i.test(page.title)
        && !/nutrition|ingredient|barcode|product label/i.test(query)) continue;
    const item = page.imageinfo?.[0];
    const credit = licenseInfo(item?.extmetadata);
    const candidate = item?.thumburl || item?.url;
    if (!credit.allowed || !candidate || !['image/jpeg', 'image/png'].includes(item.mime) || (item.size || 0) > 30_000_000) continue;
    const officialCDNs = new Set(['upload.wikimedia.org', 'thumb.wikimedia.org']);
    if (!officialCDNs.has(new URL(candidate).hostname)) continue;
    try {
      const response = await api(candidate, {}, 1);
      if (!officialCDNs.has(new URL(response.url).hostname)) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 1000 || bytes.length > 8_000_000) continue;
      await writeFile(dest, bytes);
      return { file: dest, title: page.title,
        source: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replaceAll(' ', '_'))}`, ...credit };
    } catch { /* next candidate */ }
  }
  return null;
}

/** Openverse is an anonymous, openly-licensed search fallback when Commons is
 * throttled or cannot find the exact organism. Gemini still checks every
 * selected photograph against the spoken entity before it reaches a video. */
export async function openverseImage(query, dest, alreadyUsed = new Set()) {
  const url = new URL('https://api.openverse.org/v1/images/');
  Object.entries({ q: brief(query, 82), license: 'cc0,pdm,by', page_size: '18',
    mature: 'false' }).forEach(([k, v]) => url.searchParams.set(k, v));
  const results = (await (await api(url, { headers: { 'User-Agent':
    'PaperFactsStudio/9 (local educational fact-film generator)' } }, 1)).json()).results || [];
  for (const item of results) {
    if (!['cc0', 'pdm', 'by'].includes(item.license?.toLowerCase()) ||
        item.mature || alreadyUsed.has(item.id) || mediaTitleMismatch(item.title, query)) continue;
    const original = String(item.url || item.thumbnail || '');
    let address;
    try { address = new URL(original); } catch { continue; }
    // Do not turn third-party search metadata into a request to a local host.
    if (address.protocol !== 'https:' || !address.hostname.includes('.') ||
        /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[|0\.)/i.test(address.hostname) ||
        address.username || address.password || address.port) continue;
    try {
      const response = await api(address, {}, 0);
      const resolved = new URL(response.url);
      if (resolved.protocol !== 'https:' || !resolved.hostname.includes('.') ||
          /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[|0\.)/i.test(resolved.hostname)) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
      const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      if ((!jpeg && !png) || bytes.length < 3000 || bytes.length > 8_000_000) continue;
      await writeFile(dest, bytes);
      return { file: dest, title: item.title || query, source: item.foreign_landing_url ||
        item.detail_url || 'https://openverse.org/', author: item.creator || 'Unknown',
        credit: item.attribution || '', license: item.license === 'pdm' ? 'Public domain' :
          item.license === 'cc0' ? 'CC0' : `CC BY ${item.license_version || '4.0'}`,
        licenseUrl: item.license_url || '', openverseId: item.id };
    } catch { /* Try the next independently licensed result. */ }
  }
  return null;
}

// Wikimedia full-text search also returns namesakes (an 'Electric Eel' roller
// coaster) and merchandise. Treat those as impossible evidence for a natural
// history topic before making expensive image-QA requests.
export function mediaTitleMismatch(title, query) {
  const unrelated = /roller.coaster|amusement.park|theme.park|theme.ride|t.shirt|souvenir|advertisement|logo|poster|book.cover/i;
  if (unrelated.test(title) && !unrelated.test(query)) return true;
  // Wikimedia has "banana money" (Japanese occupation banknotes), fruit
  // packaging and disease diagrams. Those are NOT a photograph of a banana.
  // Query-scoped semantic negatives stop this kind of namesake collision
  // without blocking legitimate historical/currency footage on other topics.
  if (/banana|plantain|strawberry|fruit|berry|केला|स्ट्रॉबेरी/i.test(query) &&
      /banknote|bank.note|currency|money|banking|coin|occupied.malaya|ten.dollars|scrip|virus|disease|infestation/i.test(title) &&
      !/banknote|currency|disease|virus/i.test(query)) return true;
  return false;
}

export function isFreesoundCC0(license) {
  return /^https?:\/\/creativecommons\.org\/publicdomain\/zero\/1\.0\/?$/i.test(String(license || ''));
}

export async function freesound(effect, dest, storyIntent = '') {
  if (!providerValue('FREESOUND_API_KEY')) throw Error('FREESOUND_API_KEY missing in .env');
  const words = { whoosh: 'short whoosh transition', pop: 'small pop', thud: 'soft impact thud',
    question: 'comic question', mpop: 'mouth pop', ding: 'bell ding',
    zap: 'short electric zap', boing: 'cartoon spring boing', squeak: 'comic tiny squeak',
    wind: 'quick airy wind sweep', sizzle: 'short electricity sizzle', boil: 'short water bubble' };
  const topicSpecific = brief(storyIntent, 60).replace(/[^a-zA-Z0-9 '-]/g, '').trim();
  for (const keyword of [...new Set([topicSpecific, words[effect] || effect, effect].filter(Boolean))]) {
    const u = new URL('https://freesound.org/apiv2/search/text/');
    Object.entries({ query: keyword, filter: 'license:"Creative Commons 0"',
      fields: 'id,name,license,previews,url,duration', page_size: '30' }).forEach(([k, v]) => u.searchParams.set(k, v));
    const r = await (await api(u, { headers: { Authorization: `Token ${providerValue('FREESOUND_API_KEY')}` } })).json();
    for (const sound of r.results || []) {
      const preview = sound.previews?.['preview-hq-mp3'];
      // Freesound returns the CC0 *URL*, not the human-readable license label.
      if (!isFreesoundCC0(sound.license) || !preview) continue;
      // Short single-shot cues synchronize to scene actions; long ambiences smear transitions.
      const maxDuration = ['boil', 'sizzle', 'smoke'].includes(effect) ? 3.5 : 2.2;
      if (!Number.isFinite(sound.duration) || sound.duration < .07 || sound.duration > maxDuration) continue;
      if (!/\.freesound\.org$/.test(new URL(preview).hostname)) continue;
      try {
        const response = await api(preview);
        if (!/\.freesound\.org$/.test(new URL(response.url).hostname)) continue;
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > 3_000_000 || bytes.length < 100) continue;
        await writeFile(dest, bytes);
        return { file: dest, id: sound.id, name: sound.name, license: sound.license, source: `https://freesound.org/s/${sound.id}/` };
      } catch { /* try next sound */ }
    }
  }
  return null;
}

export async function cartesiaVoice(text, voiceProfile, dest, scene = {}, style = 'energetic') {
  if (!providerValue('CARTESIA_API_KEY')) throw Error('Cartesia API key missing in .env');
  const voice = typeof voiceProfile === 'object' && voiceProfile?.voiceId ? voiceProfile : resolveVoiceProfile(voiceProfile);
  const performance = speechPerformance(scene, style);
  const body = { model_id: providerValue('CARTESIA_MODEL') || 'sonic-3.6', transcript: text,
    // Cartesia 2026 API rejects language + locale together. Locale alone
    // selects native language/accent, with the explicit accent as a hint.
    voice: voice.voiceId, locale: voice.locale, accent: voice.accent,
    normalization: voice.language === 'hi' ? 'hi-IN' : 'auto',
    output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 44100 },
    generation_config: { speed: performance.speed, volume: 1.0, emotion: performance.emotion } };
  const options = { method: 'POST', headers: { Authorization: `Bearer ${providerValue('CARTESIA_API_KEY')}`,
    'Cartesia-Version': providerValue('CARTESIA_VERSION') || '2026-08-14', 'Content-Type': 'application/json' } };
  let response;
  try { response = await api('https://api.cartesia.ai/tts/bytes', { ...options, body: JSON.stringify(body) }); }
  catch (e) {
    if (!/HTTP 400/.test(e.message) || !/emotion|unsupported|generation_config/i.test(e.message)) throw e;
    // Some accent/model combinations reject emotion controls; speed, voice and
    // punctuation still provide natural prosody without voice-cloning.
    delete body.generation_config.emotion;
    response = await api('https://api.cartesia.ai/tts/bytes', { ...options, body: JSON.stringify(body) });
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 44 || bytes.subarray(0, 4).toString() !== 'RIFF') throw Error('Invalid Cartesia WAV output');
  await writeFile(dest, bytes);
}

export function buildPlan(episode, timing, images, sounds, output, voice, { demo = false, fps = 30 } = {}) {
  const subjects = {};
  const scenes = episode.scenes.map((s, i) => {
    const img = images[i];
    const duration = timing[i].duration;
    const at = Math.min(0.76, duration * 0.35);
    const elements = [];
    if (img) {
      if (img.cutout) subjects[`subject${i}`] = { image: img.path };
      elements.push(img.cutout
        ? { type: 'cutout', subject: `subject${i}`, height: 760, max_width: 940, x: 540, y: 1170,
          anim: 'fade', in: 0.4, move: { to: [550, 1135], at: 0.1, dur: Math.max(.5, duration * .8) } }
        : { type: 'photo', image: img.path, width: 745, x: 540, y: 1180, anim: 'fade', in: .35,
          rot: i % 2 ? 3 : -3, move: { to: [550, 1145], at: 0.1, dur: Math.max(.5, duration * .8) } });
    } else elements.push({ type: 'warning', mark: '?', x: 540, y: 1150, anim: 'pop', sfx: false });
    const extras = {
      stamp: { type: 'stamp', text: 'FACT', size: 104, x: 752, y: 1580, anim: 'slam', rot: -8,
        sfx: sounds.thud ? 'thud' : false, sfx_db: -16 },
      warning: { type: 'warning', x: 780, y: 1510, scale: .62, sfx: sounds.question ? 'question' : false },
      burst: { type: 'burst', text: 'WOW!', size: .53, x: 780, y: 1500, sfx: sounds.mpop ? 'mpop' : false },
      ruler: { type: 'ruler', x: 540, y: 1585, scale: .62, sfx: false },
      ticket: { type: 'ticket', strike: 'MYTH', ok: 'FACT', x: 540, y: 1520, scale: .60, sfx: false },
      calendar: { type: 'calendar', top: 'FACT', big: 'NOW', x: 780, y: 1520, scale: .53, sfx: false },
      flask: { type: 'flask', label: 'SCIENCE', liquid: [115, 180, 241], x: 760, y: 1500, scale: .6, sfx: false },
    };
    elements.push({ ...extras[s.effect], at });
    return { start: timing[i].start, title: [s.line1, s.line2], red: i % 3 === 0 ? 1 : 2,
      page: s.visual === 'xray' ? 'dark' : 'kraft', scenery: i % 3 === 1 ? 2 + i : undefined, elements };
  });
  const final = timing.at(-1);
  return { meta: { title: episode.title, header: 'PAPER FACTS', voice: voice || undefined, out: output,
    duration: final.start + final.duration + 0.4, fps, end_fade: .25,
    whoosh_db: sounds.whoosh ? -20 : null, sfx_map: sounds, require_external_sfx: !demo },
    subjects, scenes };
}

export function demoEpisode() {
  return normalizeEpisode({ title: 'Octopus Facts (Offline Renderer Demo)', topic: 'Octopus',
    facts: ['An octopus has eight arms.', 'Octopuses can change their colour.',
      'They can squeeze through narrow spaces.'], language: 'en', scenes: [
    { narration: 'An octopus has eight arms.', factIndex: 0, line1: 'EIGHT', line2: 'ARMS', visualQuery: 'octopus underwater', effect: 'ruler' },
    { narration: 'Octopuses can change their colour.', factIndex: 1, line1: 'COLOUR', line2: 'SHIFT', visualQuery: 'octopus reef', effect: 'stamp' },
    { narration: 'They squeeze through narrow spaces.', factIndex: 2, line1: 'ESCAPE', line2: 'ARTIST', visualQuery: 'octopus rocks', effect: 'warning' },
    { narration: 'What an incredible animal.', factIndex: 2, line1: 'OCEAN', line2: 'GENIUS', visualQuery: 'octopus ocean', effect: 'burst' },
  ] });
}
