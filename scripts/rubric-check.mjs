const B='http://localhost:3000';
const get = async p => (await fetch(B+p)).json();
const post = async (p,b) => (await fetch(B+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)})).json();
const R=[]; const log=(n,pass,detail)=>{R.push({n,pass,detail});console.log(`  ${pass===true?'PASS':pass==='partial'?'PART':'FAIL'}  ${n}\n        ${detail}`);};

let P = await get('/api/profile');
const A = Object.values(P.answers);

// ── 1. SEARCH BEFORE ASKING
const answered = A.filter(a=>['verified','partial','conflict'].includes(a.status));
const withEv = answered.filter(a=>a.evidence.length>0);
log('1. Search before asking',
  withEv.length>0,
  `${answered.length}/${A.length} answered from documents without asking; ${withEv.length} carry citations`);

// ── GOLDEN RULE: no answer without evidence
const naked = A.filter(a=>a.status==='verified' && a.evidence.length===0);
log('GOLDEN RULE: never make up an answer', naked.length===0,
  `${naked.length} 'verified' answers with zero citations (must be 0)`);

// ── 2. ASK WHEN MISSING
const unknowns = A.filter(a=>a.status==='unknown');
const withQ = unknowns.filter(a=>a.followUpQuestion);
log('2. Ask when information is missing', unknowns.length>0 && withQ.length>0,
  `${unknowns.length} unknown; ${withQ.length} carry a question to ask the user`);

// ── 4. DETECT CONFLICTS
const conf = A.filter(a=>a.conflict);
const bothSides = conf.filter(c=>c.conflict.sources?.length>=2);
log('4. Detect conflicts', conf.length>0 && bothSides.length===conf.length,
  `${conf.length} conflicts, ${bothSides.length} showing BOTH sources quoted`);

// ── 3. SMART FOLLOW-UPS  (the backups scenario, multi-turn)
const target = A.find(a=>/backup/i.test(a.questionText)) || A.find(a=>a.status==='unknown');
let hist=[]; let turns=[];
for (const msg of ['Yes','Daily','Yes, fully automated']) {
  const r = await post('/api/chat',{message:msg,profile:P,currentQuestionId:target.questionId,history:hist});
  P = r.profile ?? P; hist=[...hist,{role:'user',text:msg},{role:'assistant',text:r.reply}];
  turns.push({msg,recorded:r.recorded,reply:(r.reply||'').slice(0,95),next:r.nextQuestionId});
  await new Promise(s=>setTimeout(s,1200));
}
const stayed = turns[0].next===target.questionId;
const askedDetail = /how often|frequen|automat|daily|weekly|schedul/i.test(turns[0].reply);
log('3. Smart follow-ups', stayed&&askedDetail ? true : (stayed||askedDetail) ? 'partial':false,
  `after "Yes": stayed on question=${stayed}, asked for detail=${askedDetail}\n        Q1 reply: "${turns[0].reply}"`);

// ── 5a. NEVER ASK TWICE
const asked = P.askedQuestions ?? [];
const nextAfter = await post('/api/chat',{message:'ok','profile':P,currentQuestionId:null,history:[]});
log('5a. Never asks the same question twice', !asked.includes(nextAfter.nextQuestionId) || nextAfter.nextQuestionId!==target.questionId,
  `answered set=[${asked.join(',')}]; next offered=${nextAfter.nextQuestionId}`);

// ── 5b. CORRECTIONS KEEP HISTORY
const t2 = P.answers[target.questionId];
log('5b. Corrections keep history', (t2.history?.length??0)>=2,
  `history entries on ${target.questionId}: ${t2.history?.length??0} (${(t2.history||[]).map(h=>h.by+':'+h.to).join(' -> ')})`);

// ── 5c. GREETING MUST NOT BE RECORDED
const before = JSON.stringify(P.answers);
const g = await post('/api/chat',{message:'hey',profile:P,currentQuestionId:null,history:[]});
log('5c. Greetings are not recorded as answers', g.recorded===false && JSON.stringify(g.profile.answers)===before,
  `recorded=${g.recorded}, profile unchanged=${JSON.stringify(g.profile.answers)===before}`);

// ── 6. QUESTIONNAIRE GENERATION
const doc = await fetch(B+'/api/questionnaire').then(r=>r.text());
const has = s=>doc.includes(s);
log('6. Complete the questionnaire', has('VERIFIED')&&has('NEEDS CONFIRMATION')&&has('CONFLICT')&&doc.length>20000,
  `${doc.length} bytes; VERIFIED=${has('VERIFIED')} NEEDS-CONFIRMATION=${has('NEEDS CONFIRMATION')} CONFLICT=${has('CONFLICT')} (CONFIRMED appears once a user answers)`);

// ── BONUS: confidence exposed to the user?
const conf1 = A.filter(a=>typeof a.confidence==='number'&&a.confidence>0).length;
const uiShowsConf = (await fetch(B).then(r=>r.text())).includes('confidence');
log('BONUS: confidence scores', conf1>0 ? (uiShowsConf?true:'partial') : false,
  `${conf1} answers carry a confidence value; shown in UI=${uiShowsConf}`);

console.log(`\n  ${R.filter(r=>r.pass===true).length} pass, ${R.filter(r=>r.pass==='partial').length} partial, ${R.filter(r=>r.pass===false).length} fail`);
