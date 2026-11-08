// Strict contracts shared by automatic reviews; no topic-specific sample rules.
const confidence=value=>typeof value==='number'&&Number.isFinite(value)&&value>=.85&&value<=1;
const norm=text=>String(text||'').normalize('NFC').replace(/\s+/gu,' ').trim().toLowerCase();
export class QualityError extends Error{
 constructor(message,issues=[],indices=[]){super(message);this.name='QualityError';this.issues=issues;this.indices=indices;}
}

export function reviewFailureDetails(error){
 const items=Array.isArray(error?.issues)?error.issues.map(String).filter(Boolean):[];
 return items.length?[...new Set(items)].slice(0,6).join('; ').slice(0,1800):String(error?.message||'Review failed');
}

// Only clearly stylistic hook feedback is non-blocking. A weak joke must not
// trigger a rewrite; an unsupported premise or unanswered promise still must.
export function creativeHookNote(issue){
 const text=String(issue||'').trim().replace(/not only a factual question\.?$/i,'');
 if(/unsupported|unsourced|factual|false|mislead|contradict|causal|qualifier|unanswered|not answered|does not answer|grammar|spelling|matra|incorrect|inaccurate/i.test(text))return false;
 return /^(?:Opening needs a short topic-linked funny|Final spoken line needs an earned humorous callback|(?:The )?(?:hook|opening|ending|callback|punchline|comedy|humou?r|joke)\b.*\b(?:weak|stronger|funnier|not funny|missing|lacks?|needs? more|not engaging|not curious|too generic|same family)|(?:Missing|Weak|Add|Improve|Strengthen)\b.*\b(?:comedy|comic|humou?r|callback|punchline|hook variety))/i.test(text);
}

// Correct only clear slow scene outliers; never slow an energetic take down.
// A conservative cap avoids large time-stretch artifacts or pitch changes.
export function narrationTempo(text,seconds,{energetic=false,language='hi'}={}){
 const words=String(text||'').trim().split(/\s+/u).filter(Boolean).length;
 if(!energetic||words<8||!Number.isFinite(seconds)||seconds<=0)return 1;
 const target=language==='hi'?3.1:3;
 return Math.round(Math.min(1.12,Math.max(1,target*seconds/words))*1000)/1000;
}
export function editorialIssues(review,episode,source){
 const issues=[];
 if(review?.approved!==true||!confidence(review.confidence))issues.push('Missing explicit confident editorial approval');
 for(const key of ['topicMatches','hookAnswered','scopePreserved','headlineFaithful','naturalDialogue'])if(review?.[key]!==true)issues.push(key+' did not pass');
 const hook=review?.hookEvidence;
 const hookSource=source.articles?.[episode.scenes?.[0]?.factIndex??0]?.extract||source.extract;
 if(hook?.premiseSupported!==true||hook?.answered!==true||norm(hook?.sourceQuote).length<12||!norm(hookSource).includes(norm(hook?.sourceQuote))||typeof hook?.reason!=='string'||hook.reason.trim().length<15)
  issues.push('Opening premise and promised answer need explicit source evidence');
 if(!Array.isArray(review?.facts)||review.facts.length!==3)issues.push('Three fact evidence records required');
 else for(let i=0;i<3;i++){
  const record=review.facts.find(f=>f.index===i);
  const quote=norm(record?.sourceQuote);
  const evidence=source.articles?.[i]?.extract||source.extract;
  if(!record||record.supported!==true||!confidence(record.confidence)||quote.length<12||!norm(evidence).includes(quote))issues.push(`Fact ${i+1} lacks a supported exact source excerpt`);
 }
 if(!Array.isArray(review?.scenes)||review.scenes.length!==episode.scenes.length)issues.push('Review every narrated shot');
 else for(let i=0;i<episode.scenes.length;i++){
  const record=review.scenes.find(s=>s.index===i);
  if(!record||record.relevant!==true||record.faithful!==true||record.natural!==true||!confidence(record.confidence))issues.push(`Scene ${i+1} failed topic, meaning or language review`);
  const evidence=source.articles?.[episode.scenes[i].factIndex]?.extract||source.extract;
  const quote=norm(record?.sourceQuote);
  if(quote.length<12||!norm(evidence).includes(quote))issues.push(`Scene ${i+1} narration lacks a supported exact source excerpt`);
  // An early legal win is not the final outcome when adjacent source text
  // explicitly reports its reversal. Keep dated historical accounts valid;
  // this is an additional omission check, not a substitute for semantic review.
  const spoken=norm(episode.scenes[i].narration),at=norm(evidence).indexOf(quote);
  const legalWin=/(?:कोर्ट|अदालत|टैक्स|कराधान|\bcourt\b|\btax\b)/iu.test(spoken)&&/(?:साबित|छूट|बचने|बचा|जीत|\bexempt|\bwon\b|\bavoid)/iu.test(spoken);
  if(legalWin&&quote.length>=12&&at>=0){
   const context=norm(evidence).slice(Math.max(0,at-200),at+quote.length+600);
   const reversed=/(?:court of appeal|appeals court|supreme court).{0,220}(?:reversed|overturned|set aside)|(?:decision|ruling|judgment).{0,100}(?:was reversed|was overturned|was set aside)/iu.test(context);
   const group=episode.scenes.filter(s=>s.factIndex===episode.scenes[i].factIndex).map(s=>s.narration||'').join(' ');
   const qualified=/(?:पलट|उलट|अपील|उस वक्त|पहले के|उस समय|\b(?:19|20)\d\d\b|\brevers|\boverturn|\bon appeal\b|\binitially\b|\bat the time\b)/iu.test(group);
   if(reversed&&!qualified)issues.push(`Scene ${i+1} cites an earlier legal win but omits the adjacent appeal reversal; include the final outcome or remove the legal claim`);
  }
 }
 if(Array.isArray(review?.issues))issues.push(...review.issues.map(String));
 else issues.push('Editorial issues array missing');
 return [...new Set(issues)];
}
export function shotReview(review,count,{cropOnly=false,requireClean=false}={}){
 const rows=Array.isArray(review)?review:review?.frames;
 if(!Array.isArray(rows)||rows.length!==count||rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)))return {sourceApproved:false,cropApproved:false,focus:[],contain:false};
 const sourceApproved=rows.every(r=>r.topicMatches===true&&r.exactEntityMatches===true&&r.realMedia===true&&(!requireClean||(r.noEmbeddedText===true&&r.noEmbeddedBranding===true&&r.noPlaceholder===true))&&r.subjectVisible===true&&r.roleAppropriate===true&&confidence(r.confidence));
 const cropApproved=sourceApproved&&rows.every(r=>r.cropVisible===true&&r.requiredFeatureVisible===true);
 const focus=rows.map((r,i)=>({at:count===1?.5:[.12,.5,.85][i],point:Array.isArray(r.focus)&&r.focus.length===2&&r.focus.every(v=>Number.isFinite(v)&&v>=0&&v<=1)?r.focus:null}));
 return {sourceApproved,cropApproved,focus:focus.every(f=>f.point)?focus:[],contain:rows.some(r=>r.needsContain===true),cropOnly};
}
export function renderedIssues(review,indices){
 const issues=[];
 if(review?.approved!==true||!confidence(review.confidence))issues.push('Missing final-cut approval');
 const rows=review?.frames;
 if(!Array.isArray(rows)||rows.length!==indices.length)return {issues:[...issues,'Missing final-frame reviews'],indices};
 const failed=[];
 indices.forEach((index,i)=>{
  const row=rows[i];
  if(row?.topicMatches!==true||row.exactEntityMatches!==true||row.subjectVisible!==true||row.headlineCorrect!==true||row.layoutCorrect!==true||row.noPlaceholder!==true||!confidence(row.confidence)){
   failed.push(index);issues.push(`Scene ${index+1}: ${String(row?.reason||'Final frame did not pass')}`);
  }
 });
 if(!failed.length&&issues.length)failed.push(...indices);
 return {issues,indices:[...new Set(failed)]};
}
export function narrationIssues(review,{requireNatural=false}={}){
 const issues=[];
 if(review?.approved!==true||!confidence(review.confidence)||!Array.isArray(review.issues))issues.push('Missing confident narration approval');
 if(Array.isArray(review?.issues))issues.push(...review.issues.map(String));
 if(requireNatural){
  for(const key of ['naturalness','pronunciation','deliveryConsistency'])if(!Number.isFinite(review?.[key])||review[key]<7||review[key]>10)issues.push(`Narration ${key} must be 7–10/10`);
  if(review?.roboticArtifacts!==false)issues.push('Robotic artifacts not explicitly ruled out');
  if(review?.masculineDelivery!==true)issues.push('Requested male delivery not confirmed');
 }
 return [...new Set(issues)];
}
export async function repairReviewed(initial,{review,repair,validate=()=>{},attempts=2,onReview=async()=>{}}){
 let candidate=initial;
 const previousIssues=[];
 for(let attempt=0;attempt<=attempts;attempt++){
  let result;
  try{validate(candidate);}catch(error){
   if(!(error instanceof QualityError))throw error;
   result={review:null,issues:error.issues};
  }
  result ||= await review(candidate,attempt);
  await onReview(result,candidate,attempt);
  if(!result.issues.length)return {episode:candidate,review:result.review,repairs:attempt};
  if(attempt===attempts)throw new QualityError('Storyboard review failed: '+reviewFailureDetails({issues:result.issues}),result.issues);
  candidate=await repair(candidate,result.issues,attempt,[...new Set(previousIssues)]);
  previousIssues.push(...result.issues);
 }
}
