export const HINDI_HOOK_BANK=Object.freeze({
 curiosity:[
  'क्या तुमने कभी सोचा है कि...',
  'क्या कभी तुम्हारे दिमाग में ये सवाल आया है...',
  'भाई, कभी गौर किया है कि...',
  'तुम्हें पता है दुनिया में एक ऐसी चीज भी है...',
  'क्या होगा अगर मैं तुमसे कहूँ कि...',
  'तुमने कभी नोटिस किया कि...',
  'बचपन से एक चीज देख रहे हो, लेकिन उसका राज नहीं जानते!',
  'भाई, इस सवाल का जवाब तुम्हें भी नहीं पता होगा!'
 ],
 shocking:[
  'भाई, ये जानकर तुम्हारा दिमाग घूम जाएगा!',
  'अबे भाई, ये क्या बवाल है!',
  'ये फैक्ट सुनकर मेरे तो होश उड़ गए!',
  'भाईसाहब, ऐसा भी होता है क्या!',
  'कसम से, ये जानकर मेरी आत्मा हिल गई!',
  'ये सुनकर तुम भी बोलोगे—ये क्या देख लिया!',
  'भाई, आज तो विज्ञान ने भी दिमाग घुमा दिया!',
  'ये कोई मजाक नहीं, सच में ऐसा होता है!'
 ],
 'desi-surprise':[
  'भाई, ये फैक्ट सुनकर मेरा कुत्ता भी सदमे में चला गया!',
  'अबे यार, दुनिया में कैसे-कैसे नमूने भरे पड़े हैं!',
  'भाई, ये जानकर मेरा दिमाग छुट्टी पर चला गया!',
  'अरे ओ भाई, ये कैसा कांड हो गया!',
  'भाई, ये तो गजब का झोल है!',
  'इतना अजीब फैक्ट है कि मेरी हँसी नहीं रुक रही!',
  'भाई, इसका दिमाग तो हम सबसे चार कदम आगे निकला!',
  'कसम से भाई, ये देखकर मेरा सिस्टम ही हैंग हो गया!'
 ],
 mystery:[
  'आखिर ऐसा क्यों होता है?',
  'इसके पीछे की असली वजह जानकर हैरान रह जाओगे!',
  'ये चीज जितनी सीधी दिखती है, उतनी है नहीं!',
  'एक सेकंड रुको, असली खेल तो कुछ और है!',
  'इस छोटे से राज के पीछे बड़ी कहानी छिपी है!',
  'लेकिन कहानी में असली ट्विस्ट तो अब आएगा!'
 ],
 challenge:[
  'शर्त लगा लो, ये बात तुम्हें नहीं पता होगी!',
  'खुद को बहुत होशियार समझते हो? तो ये बताओ!',
  'भाई, दस में से नौ लोग इस सवाल पर अटक जाते हैं!',
  'अगर इसका जवाब पता है तो तुम जीनियस हो!',
  'पहले अंदाजा लगाओ, फिर असली जवाब सुनो!'
 ]
});
const hookNorm=text=>String(text||'').normalize('NFC').toLowerCase().replace(/[\p{P}\p{S}]/gu,' ').replace(/\s+/gu,' ').trim();

export function hookStyleDirection(context,language='hi'){
 const previous=context?.recent?.at(-1)?.opening;
 return `HOOK VARIETY CONTRACT: Suggested next family: ${context?.style||'curiosity'}. Choose the strongest SOURCE-SUPPORTED family for this topic, but never repeat the previous video's family or merely swap thought/saw/noticed in the same template. Previous opening:${JSON.stringify(previous||'none')}. ${language==='hi'?`All FIVE user-requested families and their examples are available: ${JSON.stringify(HINDI_HOOK_BANK)}. These are INSPIRATION, not empty lines to prepend verbatim. Adapt ONE example/creative variant to name the actual subject and puzzle within the first 6-10 words. Shocking and funny openings must contain the actual surprise, not just generic hype; keep figurative reactions visibly figurative. Do not invent survey statistics such as nine out of ten people, personal events, or scientific facts for a challenge/joke. Mystery must be answered; challenge must be grounded in the fact. Keep the opening question/statement short, ideally 6-12 words, then add brief comedy. Never stack several hooks.`:'Use original English equivalents: curiosity, surprising fact, relatable comedy, mystery or a guess-the-answer challenge. Do not translate Hindi examples literally.'}`;
}

export function hindiDialogueDirection(humor='edgy'){
 return `HINDI REGISTER: conversational desi Hindi, as a lively Indian friend explains a surprising fact. Write Devanagari, but NOT textbook/shuddh Hindi. Natural words such as भाई, अरे यार, देखो, चक्कर, सीन, ट्रिक, जुगाड़ are welcome when they fit; use only 1-2 slang phrases TOTAL, not a repeated भाई in every scene. A scientific proposal/research finding is NOT a जुगाड़ or a trick: reserve such slang for a clearly figurative human comparison. Prefer ये/इसका/सांस/खून to formal lecture language. Explain rare terms in everyday words or choose another sourced fact; do not throw unexplained taxonomy at the viewer. Common Hinglish in Devanagari is allowed. TTS SPEAKABILITY: Write short connected clauses as a fast conversational speaker would actually say them. Prefer familiar everyday words over academic compounds, literal translations, unexplained English acronyms or long transliterated technical names. Explain an essential rare term once in simple language without changing its fact or qualifier. Avoid repeated ellipses, dash interruptions, semicolon-heavy sentences and artificial presenter filler. Use punctuation for meaning, not theatrical long pauses. Keep correct spelling and meaning; slang is not a spelling error. Preserve this register during proofreading, never turn it into formal Hindi. ${humor==='edgy'?'One earned topic-related comic comparison and at most one mild non-targeted exclamation such as अरे साला may follow a reveal. Do not open with a swear word. No abuse directed at people, families or groups.':humor==='clean'?'Use friendly colloquial humor without swearing.':'Use one light cheeky joke without forced swearing.'} Keep source qualifiers and real scientific meaning even when simplifying terminology.`;
}

export function englishDialogueDirection(){
 return `ENGLISH AUDIENCE AND DELIVERY: Write original conversational English for a broad English-speaking Shorts audience, including US/UK/global viewers. Be an energetic, witty friend, not a lecturer or a literal translation of Hindi slang. Use familiar situations: grocery packaging, airports, smartphones, everyday money, food science, unexpected history and documented mysteries. Do not assume every viewer lives in one country. Avoid bhai/desi expressions, forced internet slang, fabricated brand accusations or stereotypes. Name the actual subject within the first 8 spoken words; do not lead with a long food simile or unrelated comparison. Use concise, logically coherent humour, not mixed metaphors or invented personal anecdotes. Open with ONE specific curiosity hook in 1-3 seconds and a brief playful comparison/surprise. Rotate specific questions, personal stakes, counter-intuitive observations and guess-the-reason challenges. Inspiration only: Ever wondered why...; Your ... does this for a reason; This looks ordinary, until...; Guess what happens when... . Do not repeat Did you know in every video. Give a meaningful reveal every 5-7 seconds, an earned relatable comic analogy and a short final callback. All humor is clearly figurative, never a false factual claim. Keep source qualifiers, short spoken clauses, clear pronunciation and one consistent narrator. All narration, facts, captions, on-video headline and upload title must be English. No Hindi/Devanagari text or read-out acting directions.`;
}

export function englishHookIssues(episode){
 const opening=String(episode.scenes?.[0]?.narration||'');
 if(/^(?:hello|hi everyone|welcome|in this video)\b/i.test(opening))return ['English opening must begin with a topic-specific hook, not a greeting.'];
 const stop=new Set('the a an of in on at to is are why how what does do for and with this that'.split(' '));
 const norm=w=>w.toLowerCase().replace(/s$/,'');
 const keywords=(String(episode.topic||'')+' '+String(episode.scenes?.[0]?.subjectEntity||'')).match(/[a-z]{3,}/gi)?.filter(w=>!stop.has(w.toLowerCase())).map(norm)||[];
 const first=(opening.match(/[a-z]+/gi)||[]).slice(0,10).map(norm);
 return keywords.length&&!first.some(w=>keywords.some(k=>w===k||(k.length>=4&&w.endsWith(k))))?['Name the actual topic/object within the first 10 spoken words; move long unrelated similes after the curiosity hook.']:[];
}

export function hindiHookIssues(episode){
 const opening=String(episode.scenes?.[0]?.narration||'').trim();
 const firstClause=opening.split(/\s+/u).slice(0,12).join(' ');
 // Questions, personal stakes and counter-intuitive statements are all hooks.
 // Semantic truth/relevance is checked separately against the actual source.
 const curiosity=/[?？]|(?:क्या|कभी|कैसे|क्यों|कहाँ|कहां|कौन|कब|किस(?!ी)|कितन|पता|सोचो|सोचा|मान लो|कल्पना|तुम|आप|लेकिन|मगर|फिर भी|असल में|दिखता|दिखती|लगता|लगती|समझते|समझती|गौर|नोटिस|राज|रहस्य|असली खेल|झोल|बवाल|अंदाजा|अंदाज़ा|शर्त)/u.test(firstClause);
 const filler=/^(?:नमस्ते|नमस्कार|हेलो|हैलो|अरे साला|देखो भाई|आज (?:हम|मैं)|इस वीडियो में)/u.test(opening);
 const earlyContrast=/सिर्फ|केवल|जितने|जितनी|मत भूलो|यकीन|यक़ीन/u.test(firstClause)&&hookFamily(opening)==='shocking';
 return (curiosity||earlyContrast||['shocking','desi-surprise','mystery','challenge'].includes(hookFamily(firstClause)))&&!filler?[]:['Opening needs a concrete question, viewer situation or sourced contradiction before the explanation; no greeting or generic introduction'];
}

export function hookFamily(text){
 const normalized=hookNorm(text);
 // Classify the hook itself, not a joke or payoff later in the same shot.
 for(const [family,examples] of Object.entries(HINDI_HOOK_BANK))
  if(examples.some(example=>normalized.startsWith(hookNorm(example))))return family;
 const start=String(text||'').split(/[?？!！।]/u)[0].split(/\s+/u).slice(0,16).join(' ');
 if(/(?:सिर्फ|केवल).*(?:नहीं|बल्कि)|जितन[ेी].*(?:उतन|मासूम)|मत भूलो|यक[ी़]न.*नहीं/u.test(start))return 'shocking';
 if(/शर्त|खुद को.*होशियार|दस में से|अगर.*जीनियस|पहले.*अंदा[जज़]/u.test(start))return 'challenge';
 if(/कुत्ता.*सदमे|नमूने|दिमाग.*छुट्टी|कांड|झोल|हँसी|हंसी|चार कदम|सिस्टम.*हैंग/u.test(start))return 'desi-surprise';
 if(/होश.*उड़|आत्मा.*हिल|दिमाग.*घूम|दिमाग.*घुमा|भाईसाहब.*ऐसा|ये क्या बवाल|ये कोई मजा[कक़]/u.test(start)||/\b(?:shocking|unbelievable|sounds impossible)\b/i.test(start))return 'shocking';
 if(/आखिर|असली वजह|जितनी सीधी|एक सेकंड रुको|छोटे से राज|असली ट्विस्ट/u.test(start))return 'mystery';
 text=start;
 if(/\b(?:guess|bet you|can you explain)\b/i.test(text))return 'challenge';
 if(/ever noticed|ever wondered/i.test(text))return 'observation';
 if(/this looks|secret|mystery|real reason/i.test(text))return 'mystery';
 if(/गौर|नोटिस|बचपन|देख रहे/u.test(text))return 'observation';
 if(/अंदाजा|अंदाज़ा|बताओ|जवाब|शर्त|जीनियस/u.test(text))return 'challenge';
 if(/झोल|कांड|बवाल|हैंग|छुट्टी|नमूने/u.test(text))return 'desi-surprise';
 if(/खेल|राज|रहस्य|सीधी|ट्विस्ट|छिप/u.test(text))return 'mystery';
 return 'curiosity';
}
export function hookContextFor(history=[]){
 const families=['curiosity','shocking','desi-surprise','mystery','challenge'];
 const previous=history.at(-1);
 const last=previous?.opening?hookFamily(previous.opening):previous?.style;
 const canonical=last==='observation'?'curiosity':last;
 return {style:families[(families.indexOf(canonical)+1)%families.length],recent:history.slice(-6)};
}
export function repeatedHookIssues(episode,context){
 if(!context?.recent?.length)return [];
 const norm=s=>String(s||'').replace(/[\p{P}\p{S}]/gu,'').replace(/\s+/g,' ').trim();
 const opening=norm(episode.scenes?.[0]?.narration),prefix=opening.split(' ').slice(0,5).join(' ');
 const last=norm(context.recent.at(-1)?.opening);
 const issues=opening&&(opening===last||(prefix.split(' ').length>=5&&last.startsWith(prefix)))?['Opening repeats the previous video; use a different hook construction naming this topic']:[];
 const family=value=>{const key=hookFamily(value);return key==='observation'?'curiosity':key;};
 if(opening&&last&&family(opening)===family(context.recent.at(-1).opening))issues.push('Opening repeats the previous hook family; choose another topic-specific curiosity, shocking, funny, mystery or challenge construction.');
 const template=value=>hookNorm(value).replace(/^(?:अरे |ओ )?भाई\s+/u,'').replace(/^(?:क्या )?(?:तुमने|तुम्हें|आपने) कभी (?:सोचा|देखा|नोटिस किया|गौर किया)(?: है)?(?: कि)?/u,'familiar-question');
 if(template(opening).startsWith('familiar-question')&&context.recent.slice(-3).some(row=>template(row.opening).startsWith('familiar-question')))
  issues.push('Recent opening already uses the thought/saw/noticed question template; do not swap one verb to repeat it.');
 return [...new Set(issues)];
}

export function narrationFormatIssues(episode){
 return (episode.scenes||[]).flatMap((scene,index)=>{
  const text=String(scene.narration||'');
  return /\p{Extended_Pictographic}|[\[\]<>]|(?:^|\n)\s*(?:HOOK|INTRO|SCENE\s*\d*|END|हुक|इंट्रो|सीन\s*\d*|अंत)\s*[:：]/iu.test(text)
   ?[`Scene ${index+1} narration must contain spoken words only, without labels, emoji or bracketed directions`]:[];
 });
}

export function unsupportedDrama(headline,source={}){
 const sensational=/खौफनाक|जानलेवा|मौत|घातक|deadly|lethal|terrifying/iu.test(headline);
 return sensational&&!/\b(?:deadly|lethal|death|fatal|kill|venom|poison)\b|जानलेवा|मौत|घातक|ज़हर|जहर/iu.test(source.extract||'');
}

// Keep the opening fixed and group already-labelled shots BEFORE copyediting.
// This repairs a common harmless JSON ordering mistake without another full
// creative API request. Missing/invalid fact assignments still fail validation.
export function groupFactScenes(episode){
 const scenes=episode.scenes||[];
 const assigned=scenes.every(s=>Number.isInteger(s.factIndex)&&s.factIndex>=0&&s.factIndex<=2);
 const order=[...new Set(scenes.map(s=>s.factIndex))];
 if(assigned&&episode.facts?.length===3&&order.length===3&&order[0]!==0){
  const facts=episode.facts;episode.facts=order.map(i=>facts[i]);
  for(const scene of scenes)scene.factIndex=order.indexOf(scene.factIndex);
 }
 if(scenes[0]?.factIndex===0&&assigned)
  episode.scenes=scenes.toSorted((a,b)=>a.factIndex-b.factIndex);
 return episode;
}

export function applyHindiCopy(episode,copy){
 if(!Array.isArray(copy?.scenes)||copy.scenes.length!==episode.scenes.length||!Array.isArray(copy.facts)||copy.facts.length!==3)
  throw Error('Hindi copyeditor must return three facts and one text update per shot');
 const result=structuredClone(episode);
 if(copy.facts.some(f=>typeof f!=='string'||!f.trim()))throw Error('Missing corrected fact text');
 result.facts=copy.facts;
 for(const [i,edit] of copy.scenes.entries()){
  if(typeof edit?.narration!=='string'||!edit.narration.trim())throw Error('Missing corrected narration');
  const scene=result.scenes[i];
  for(const key of ['narration','line1','line2','beatTextHi','callout'])if(typeof edit[key]==='string')scene[key]=edit[key];
  if(scene.pointOut&&typeof edit.pointOutLabel==='string')scene.pointOut.label=edit.pointOutLabel;
  if(scene.diagram&&edit.diagram){
   if(typeof edit.diagram.heading==='string')scene.diagram.heading=edit.diagram.heading;
   if(edit.diagram.nodes?.length!==scene.diagram.nodes.length)throw Error('Copyeditor cannot change diagram structure');
   scene.diagram.nodes.forEach((node,j)=>{for(const key of ['label','detail'])if(typeof edit.diagram.nodes[j]?.[key]==='string')node[key]=edit.diagram.nodes[j][key];});
   if(Array.isArray(edit.diagram.links)){
    if(edit.diagram.links.length!==scene.diagram.links.length)throw Error('Copyeditor cannot change diagram links');
    scene.diagram.links.forEach((link,j)=>{if(typeof edit.diagram.links[j]?.label==='string')link.label=edit.diagram.links[j].label;});
   }
  }
 }
 return result;
}

export function episodePrompt(topic,source,language,seconds,humor,mediaPolicy=null,hookContext=null){
 return `Create ONE source-backed 3:4 facts Short. Return only the complete JSON object below, never executable code or SVG.
TOPIC: ${topic}
SOURCE: ${source.url}\n${source.extract}
${source.category?`SELECTED STORY CATEGORY: ${source.category.label}. ${source.category.direction} Keep the story in this category and tie its surprise to the viewer's everyday experience. Do not replace it with generic scenery trivia.`:''}
LANGUAGE: ${language}. Approximate narration target: ${Math.ceil(Math.max(25,seconds)*3.5)} spoken words / ${seconds} seconds.
${hookStyleDirection(hookContext,language)}
${!source.articles?`SINGLE-STORY SCOPE: Choose ONE narrow question and make ALL THREE facts[] distinct supporting claims answering THAT SAME question. Every shot must advance its answer. Do not pivot from a physical mechanism to an invention date, business margin, habitat or unrelated animal just to fill the third fact. The final factual reveal must complete the opening's explanation, followed by a short earned comic callback about that same explanation. A shared Wikipedia article is not enough to make unrelated claims one story. Prefer an angle illustrated honestly with common footage of ONE visible subject and varied angles; avoid an angle requiring rare species behaviour, hidden nests or archival footage unless essential to the actual hook.`:''}
${mediaPolicy?`VISUAL IDENTITY CONTRACT: Each subjectEntity must name the concrete object actually discussed in that spoken line, preserving specific identity. If the line mentions a chocolate packet, require a packaged chocolate bar, never grocery products, shopping carts, vegetables or supermarket shoppers. If a named manuscript is discussed, require that exact manuscript, never an ancient book. If packaged-food manufacture is discussed, do not ask for any industrial production line such as carpet washing. General facts may use honest context of the exact object; evidence roles require actual visible demonstrations. Prefer context for invisible economics, pressure or internal structure rather than pretending unrelated footage proves the claim.
MANDATORY MEDIA PLAN: EXACTLY ${mediaPolicy.total} narrated shots, timed to the requested narration length, with an early hook and subsequent meaningful beats. For single-fact videos up to 50 seconds, target one distinct real source per 3-4 second shot: keep each spoken line around 10-14 words, including a short first-shot topic-linked curiosity question; continue the explanation or joke in the next shot instead of making the opening one long sentence. Prefer REAL VIDEO for EVERY shot. There is NO fixed video/photo quota: if all footage is found, the entire film uses video clips; a verified image is allowed only when suitable footage cannot be found. Preserve the shot count through repairs. Prefer accessible real subjects and varied angles. A historical or invisible process may use honest contextual footage of the relevant place/object; never pretend stock proves a specific event or hidden mechanism. No standalone diagram scenes; optional SVG pointers overlay real media only where needed.`:''}
${source.articles?`RANDOM FACTS COMPILATION: Create exactly THREE different surprising facts, ONE about EACH of these researched topics in this order: ${source.articles.map(a=>a.title).join(' | ')}. facts[i] and its shots must use ONLY source article i. This is an original fast ${language==='hi'?'desi':'English-audience'} curiosity compilation: specific opening hook, quick surprising answer, a short relatable comic comparison where appropriate, then a fresh curiosity reset between topics and strongest payoff last. Do not copy a creator's wording, catchphrases or unsourced viral claims. The headline may tease the strongest fact or the compilation; every promised answer must appear. Do not make all three facts about the first topic. Each scene subjectEntity, visualQuery and videoQuery MUST name its own fact's actual visible subject; do not use the combined compilation title as a search query.`:''}
${language==='hi'?hindiDialogueDirection(humor):englishDialogueDirection()}

${language==='hi'?`USER'S HINDI SHORTS STYLE:
MANDATORY OPENING ORDER: The FIRST sentence must be a short concrete curiosity question, personal-stakes question or source-supported surprising contradiction about the actual topic. Put its curiosity cue within the first 6-10 words. Do not lead with a greeting, a long joke or a comparison. THEN add a brief playful comparison or comic surprise in the rest of the opening shot. Merely saying bhai or asking a factual question is NOT a comedy hook. End with a distinct earned funny callback, not another dry factual statement. Keep all humor clearly figurative and preserve it through proofreading and repairs. Narration must retain at least ${Math.ceil(Math.max(25,seconds)*3.2)} whitespace-separated words TOTAL; expand source-backed explanations and conversational transitions, never add silence or invented facts.
Start with ONE natural topic-specific hook in the FIRST 1-3 seconds, ideally 6-9 spoken words. The first clause itself must carry curiosity, not a long setup followed by a question. Inspiration: क्या तुमने कभी सोचा…, भाई कभी गौर किया…, तुम्हें पता है…, तुमने कभी नोटिस…, पहले अंदाजा लगाओ…, असली खेल…, ये कैसा झोल…. Invent a fresh version tied to the actual fact. Do not merely prepend भाई or देखो भाई to a bland definition. Shock/comedy must contain the actual surprising subject, not an empty दिमाग घूम जाएगा line. Do not use invented statistics such as दस में नौ or pretend a narrator's dog literally reacted. No stacked hooks. ${hookContext?`Preferred opening family this time: ${hookContext.style}. Recent openings to AVOID repeating: ${JSON.stringify(hookContext.recent)}.`:''}
Natural energetic desi conversation, not a lecture. A new meaningful reveal, small twist or earned comic reaction roughly every 5-7 seconds. Use भाई/अबे यार/भाईसाहब/कसम से/अब सुन असली बात sparingly where natural; never all of them or repeated filler. Light non-targeted roasting is allowed. Humor never changes facts; exaggeration must be obviously figurative. Final ~3 seconds: one SHORT funny callback/punchline grounded in the explanation, no new unsourced claim, generic closing or subscribe request.
Structure scales to selected duration: first 0-3s hook, next few seconds setup, middle explanation/reveal with one earned comparison, strongest payoff near the end, brief final callback. For ~30-35s use ONE complete fact STORY; in random-three mode ~90-100s gives three distinct complete fact stories, each with a reveal and short transition. The three source claims in facts[] are internal evidence records, not a requirement to narrate three unrelated facts in single-topic mode.
Every narration field is directly usable Hindi Devanagari voiceover ONLY: no HOOK/INTRO/SCENE/END labels, camera instructions, emoji, markdown, bracketed acting directions or quoted prompt text. Keep required JSON, media directions and the on-video headline in their separate fields; these are never spoken.`:''}

${language==='en'?`ENGLISH SHORTS REQUIREMENTS: ${englishDialogueDirection()} Retain at least ${Math.ceil(Math.max(25,seconds)*3.2)} spoken words TOTAL. Preserve the topic-specific funny opening and final callback through copyedits. Preferred hook family: ${hookContext?.style||'curiosity'}. Recent English hooks to avoid: ${JSON.stringify(hookContext?.recent||[])}.`:''}

HOOK AND STORY: Build an ORIGINAL mini-story, not an encyclopedia list. Select the strongest source-supported angle: an everyday mystery, an unexpected consequence, a consumer misconception, a documented historical oddity or a surprising physical mechanism. The FIRST spoken sentence names a concrete object/situation and makes the viewer care within the first 1-3 seconds. Vary between a specific question, a viewer-in-the-situation challenge, a direct personal stake, and a counter-intuitive statement. Do NOT force every opening into क्या तुम्हें पता है. No greeting, swear-word opening, empty hype, insecurity shaming, guaranteed outcome or lengthy setup. Give a useful first reveal by the second shot; open a smaller follow-up question as the explanation progresses. In single-topic mode the THREE claims form ONE connected setup → mechanism/context → consequence/twist, rather than three unrelated trivia entries. Save a meaningful final payoff, not the entire answer, for the end. Include one SHORT earned ${language==='hi'?'desi':'audience-relatable English'} comic comparison AFTER a reveal, unless the subject is a tragedy or serious harm. It must be clearly figurative, easy to picture, and add no factual claim; mild slang alone is not a punchline. Never say मज़ाक में कहें तो before every joke. Return immediately to the explanation. End with the hook answered and a short earned funny callback grounded in the source. No subscribe/like request, fake suspense, generic filler or copying a creator's wording. A source saying an object IS round does not explain WHY it is round; never invent a mechanism or danger.

SPOKEN RHYTHM: Write for clear energetic ${language==='hi'?'Hindi':'English'} at about 2.6-2.9 spoken words/second, not a rushed list or a solemn storyteller. Use short clauses and naturally varied sentence lengths. Punctuation may create a brief pause BEFORE an important reveal or punchline; no ellipsis chains, fake breathing or bracketed acting instructions. Alternate direct hook, clear explanation and emphatic reveal using each scene's delivery field. Keep ONE consistent narrator identity; energy comes from wording and emphasis, not changing voices or cranking the pitch on every line.

CAUSAL ACCURACY: A question carries factual assumptions too. Its premise and promised cause must BOTH be supported by the source. Do not confuse a product's empty space with a documented reduction in its contents over time, a correlation with a cause, a cost-management option with the ONLY available option, or some customers with all customers. Never imply a specific pictured brand changed quantity without sourced evidence. Use general context footage and conditional language when the source is general. Facts[] must actually be explained in narration; a vague final slogan is not a third fact or a payoff.

NO PAYOFF GUARANTEES: A process that can repair something does not promise perfect, brand-new results, identical taste, guaranteed profit or universal safety. Do not add those claims to make the ending sound stronger. Describe a harmless named condition without implying every similar-looking symptom or coating is that condition. Prefer a surprising supported consequence over a boast. Keep important source qualifiers in the actual spoken lines, not only facts[] metadata.

FACTS: EXACTLY THREE distinct, objectively checkable source-supported claims in facts[], in narration language. Prefer a recognizable subject with a surprising WHY/HOW/hidden connection and a concrete consequence over taxonomy, rankings or classification trivia. Consumer, technology, food, nature, historical and place-based subjects are all welcome when evidence is sufficient. Do not present an anecdote/legend as established history, a medical condition as a desirable superpower, a corporate relationship as proof of fraud, or an unverified survival trick as advice. Preserve uncertainty and relevant dates for changing claims. Avoid dated population counts and emerging/disputed classification in an evergreen Short. Use ONLY this source; no extra numbers, health/crash scares or made-up consequences. Keep important qualifiers: tallest land animal is not largest animal; most intelligent invertebrate is not smartest sea animal. Translate meaning, not word-for-word idioms: trailing limbs must not imply detached limbs. Create ${mediaPolicy?mediaPolicy.total:seconds>50?Math.min(20,Math.ceil(seconds/5)):'5-7'} shots, with a short 6-9-word opening clause and remaining narration distributed across shots to meet the requested total word budget, with factIndex 0/1/2 in that order and all three covered. Example 6-shot sequence: [0,0,1,1,2,2]. No visible fact numbering or generic three-step formula. A short question/reveal can share the same factIndex. End on the strongest fact C payoff. Never jump back to fact A or B at the end.

HEADLINE: 4-7 SHORT familiar words tied to this exact story; natural grammar and ${language==='hi'?'correct matras/conjuncts':'correct English spelling' }. Use a curiosity gap the script answers. Exactly one final emoji from 😲 🤔 🔍 ⚡. headlineHighlight is the exact first 1-2 words. Fixed black top strip, highlighted phrase yellow, remainder white, thin yellow line underneath. The title must fit at readable size; do not write a long sentence. All on-screen fields must be Devanagari for Hindi or Latin-script English for English, apart from essential units/names. line1/line2 each 1-4 short words. beatTextHi defaults to empty; do not clutter every shot.

MEDIA: ${mediaPolicy?`Prefer a real video clip for EVERY shot; use a checked image only when no suitable clip is available. No forced photo slots`:'Alternate 2-3 real video shots with at least TWO real photos'}; use different shots/angles. visualQuery is a short English photo search of 2-4 words. videoQuery is a broad searchable stock tag of 1-3 concrete words, not a camera direction, a full sentence or an abstract claim. subjectEntity identifies ONE actual visible entity, preferably a scientific species where needed; avoid compound demands for unrelated props or a specific worker performing a rare action when general context footage suffices. No unrelated stock, toys, animation, AI artwork or fake evidence. Real photos can illustrate the named subject but must not be presented as proof of hidden anatomy, invisible numbers or events they do not show. visualRole is subject/context/evidence/diagram/comparison. Do not demand rare internal-organ photos when ordinary subject footage can honestly serve as context. Never replace unavailable stock with an empty text screen.

EXPLANATION: Default NO diagram. At most ONE diagram, only for an essential invisible mechanism or comparison. It must have a specific diagram.reason, 2-4 factual nodes with short labels/details, icons from wind/water/solar/leaf/energy/heat/clock/heart/globe/object/phone/radio/plane, and forward links {from,to,label}. Use animation process-flow or comparison. wave-field requires exactly wind then water nodes and is ONLY for wind over water; solar-flow requires solar then energy and is ONLY for photovoltaic output; radio-link requires phone then radio and is ONLY for sourced airplane communications. No generic Input/Output cards, invented ratios or arbitrary code.

VISIBLE SUBJECT VS EXPLANATION: For an invisible or slow process, subjectEntity must name the concrete object/place actually pictured, not the abstract process. Use visualRole=context for ordinary footage illustrating erosion, pressure, years of movement or hidden forces. Never demand that a few seconds of footage prove a long-term mechanism. Use evidence/comparison only when the required observable action/features genuinely need to appear, and keep those requirements honest.

POINTER: Optional pointOut only for a clearly visible physical feature relevant to the narration: {target,label,kind:"arrow|circle|underline",at:0.3}. Do not invent coordinates; visual inspection finds the feature. Omit pointers to invisible forces/hidden organs and decorative dots/crosshairs. Full-view clean media, no blurred side fills, halftone or ornamental effects. effects defaults to []; a physical effect is allowed ONLY if tied to an actual narrated event. No ruler unless distance is spoken, thermometer unless temperature is spoken, or flask unless chemistry is spoken. Avoid stickers and generic reaction animations.

SOUND: Default soundCue, sfxQuery and sfxReason to empty on EVERY shot. At most TWO short cues, only when they clarify a specific narrated physical event or one earned comic beat. Supply a concrete sfxReason, a specific English sfxQuery and sfxAt fraction .05-.95 aligned to that event. No random transitions/whooshes, reaction dings, booms or constant laughter. If no event needs SFX, request none.

JSON SHAPE:
{"title":"upload draft","topic":"${topic}","language":"${language}","headlineText":"short headline 😲","headlineHighlight":"first words","facts":["claim A","claim B","claim C"],"scenes":[{"narration":"spoken line","factIndex":0,"line1":"short caption","line2":"short caption","beatTextHi":"","subjectEntity":"exact visible subject","visualRole":"subject","visualQuery":"short English photo search","videoQuery":"short English video search","visual":"video|photo|diagram","delivery":"hook|suspense|explain|reveal|payoff","pointOut":null,"diagram":null,"backgroundMode":"photo","setting":"plain","layout":"hero","theme":"infographic","titleStyle":"bold","photoStyle":"clean","camera":"push|pull|pan-left|pan-right|static","motion":"reveal","action":"identity","soundCue":"","sfxQuery":"","sfxReason":"","sfxAt":0.5,"callout":"","effects":[]}]}
Choose different suitable camera/layout values per shot. Return ${mediaPolicy?mediaPolicy.total:'5-7'} COMPLETE scene objects, not one placeholder. Before returning, check that one shot contains an earned, clearly figurative comic comparison tied to the preceding fact; merely adding भाई or अरे यार is not comedy. Prefer an observable consequence or counter-intuitive use for the final payoff, not another technical label, word origin or category list. ${language==='hi'?'Preserve correct Hindi while keeping dialogue desi and easy to say.':'Preserve fluent idiomatic English and familiar, audience-relatable humour. No Hindi text or Hindi slang.'}`;
}
