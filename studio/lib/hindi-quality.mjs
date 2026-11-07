export function visibleText(episode){
 return [episode.title,episode.headlineText,episode.headlineHighlight,...(episode.facts||[]),...(episode.scenes||[]).flatMap(s=>[
  s.narration,s.line1,s.line2,s.beatTextHi,s.callout,s.pointOut?.label,s.diagram?.heading,
  ...(s.diagram?.nodes||[]).flatMap(n=>[n.label,n.detail]),...(s.diagram?.links||[]).map(l=>l.label)
 ])].filter(Boolean);
}
export function hindiTextIssues(episode){
 const issues=[];
 for(const text of visibleText(episode)){
  if(/[\uFFFD]|Ã|Â/.test(text))issues.push('Broken text encoding');
  if(/(?:^|\s)[\u093A-\u094D\u0962\u0963]/u.test(text))issues.push('Detached Hindi vowel mark');
  if(/(?:^|\s)(?:पथब|बरय|भलटे)(?=$|[\s।!?.,])/u.test(text))issues.push('Known malformed Hindi word');
 }
 return [...new Set(issues)];
}
