// TRAIDOR: Último Sobrevivente — arena top-down 3-4 players + 3 NPCs
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const $ = id => document.getElementById(id);
const menuEl = $('menu'), hudEl = $('hud'), overEl = $('gameOver');

let players = [], bullets = [], thrownBalls = [], pickups = [], particles = [];
let npcs = {}, obstacles = [], keys = {}, running = false, startTime = 0;
let killfeedEl = $('killfeed');

const COLORS = ['#00e5ff', '#ff9f1c', '#7CFC00', '#ff4dd2'];
const NAMES_DEFAULT = ['Você', 'Rival', 'Lenda', 'Sombra'];

// sons simples via WebAudio
let AC = null;
function beep(freq=440, dur=0.08, type='square', vol=0.12){
  try{
    AC = AC || new (window.AudioContext||window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol; o.connect(g); g.connect(AC.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dur);
    o.stop(AC.currentTime + dur);
  }catch(e){}
}
const sfx = {
  shoot: ()=>beep(700,0.07,'square',0.08),
  hit: ()=>beep(180,0.12,'sawtooth',0.12),
  pickup: ()=>beep(880,0.12,'sine',0.12),
  meow: ()=>{beep(600,0.15,'sine',0.14); setTimeout(()=>beep(900,0.2,'sine',0.14),140);},
  soup: ()=>beep(300,0.25,'triangle',0.14),
  win: ()=>{[523,659,784,1046].forEach((f,i)=>setTimeout(()=>beep(f,0.2,'square',0.12),i*150));}
};

// ---------- MENU ----------
function buildNameInputs(){
  const t = parseInt($('totalPlayers').value), h = parseInt($('humanPlayers').value);
  const box = $('names'); box.innerHTML = '';
  for(let i=0;i<h && i<t;i++){
    const inp = document.createElement('label');
    inp.innerHTML = `P${i+1} nome: <input id="pname${i}" value="${NAMES_DEFAULT[i]}" maxlength="12"/>`;
    box.appendChild(inp);
  }
}
$('totalPlayers').onchange = ()=>{ if(parseInt($('humanPlayers').value)>parseInt($('totalPlayers').value)) $('humanPlayers').value=$('totalPlayers').value; buildNameInputs(); };
$('humanPlayers').onchange = buildNameInputs;
buildNameInputs();

$('startBtn').onclick = startGame;
$('restartBtn').onclick = ()=>{ overEl.classList.add('hidden'); menuEl.classList.remove('hidden'); };

function startGame(){
  const total = parseInt($('totalPlayers').value);
  let humans = Math.min(parseInt($('humanPlayers').value), total);
  players=[]; bullets=[]; thrownBalls=[]; pickups=[]; particles=[];
  obstacles = [
    {x:180,y:150,w:120,h:20},{x:660,y:150,w:120,h:20},
    {x:180,y:430,w:120,h:20},{x:660,y:430,w:120,h:20},
    {x:440,y:240,w:80,h:120},{x:80,y:270,w:30,h:60},{x:850,y:270,w:30,h:60},
  ];
  // papéis: 1 traidor, 1 xerife, resto sobrevivente
  let roles = ['TRAIDOR','XERIFE'];
  while(roles.length<total) roles.push('SOBREVIVENTE');
  // embaralha
  roles = roles.sort(()=>Math.random()-0.5);

  for(let i=0;i<total;i++){
    const isHuman = i<humans;
    let nm = isHuman ? (document.getElementById('pname'+i)?.value || NAMES_DEFAULT[i]) : 'BOT '+NAMES_DEFAULT[i];
    players.push({
      id:i, name:nm, color:COLORS[i], role:roles[i],
      x: 120 + Math.random()*720, y: 100 + Math.random()*400,
      vx:0, vy:0, r:16, hp: roles[i]==='XERIFE'?120:100, maxHp: roles[i]==='XERIFE'?120:100,
      alive:true, isBot:!isHuman, angle:0,
      shootCd:0, dashCd:0, dash:0, stun:0, soupTime:0, soupInvert:false,
      hasBall:false, shield:false, revealTraitor:0, snitch:0, nearCat:0,
      arrestCd:0, kills:0, lastDir:{x:1,y:0}
    });
  }

  npcs = {
    idosa: {kind:'idosa', name:'Dona Cida 👵', x:480,y:120, t:0, soupCd:8, emoji:'👵'},
    menino:{kind:'menino',name:'Cauã ⚽', x:200,y:300, t:0, ballCd:5, emoji:'🧒'},
    homem: {kind:'homem', name:'Seu Miau 🐱', x:760,y:300, t:0, emoji:'🧔'}
  };

  menuEl.classList.add('hidden');
  overEl.classList.add('hidden');
  canvas.classList.remove('hidden');
  hudEl.classList.remove('hidden');
  running = true; startTime = Date.now();
  killfeedEl.innerHTML = '';
  feed('⚔️ Batalha começou! Seja o ÚNICO sobrevivente!');
  showRolesPopup();
  requestAnimationFrame(loop);
}

function showRolesPopup(){
  const pop = $('rolePopup');
  let html = '<div class="inner"><h2>🎭 SEU PAPEL SECRETO</h2><p>Decore e esconda! Some em 6s.</p>';
  players.filter(p=>!p.isBot).forEach(p=>{
    const desc = p.role==='TRAIDOR'?'🗡️ TRAIDOR — mate por trás (x1.6 dano), seja furtivo!'
      : p.role==='XERIFE'?'⭐ XERIFE — 120HP, tiro forte + Prisão [ESPECIAL] com stun!'
      : '🎯 SOBREVIVENTE — sem poderes, mas sem alvo nas costas. Sobreviva!';
    html += `<div style="border:2px solid ${p.color};border-radius:10px;padding:8px;margin:6px"><b style="color:${p.color}">${p.name} (P${p.id+1})</b><br/>${desc}</div>`;
  });
  html += '<div>👵🥣 sopa cura mas confunde • ⚽ bola atordoa • 🐱 gato protege e dedura</div></div>';
  pop.innerHTML = html; pop.classList.remove('hidden');
  setTimeout(()=>pop.classList.add('hidden'), 6000);
}

function feed(msg){
  const d = document.createElement('div'); d.textContent = msg;
  killfeedEl.prepend(d);
  while(killfeedEl.children.length>7) killfeedEl.lastChild.remove();
}

// ---------- INPUT ----------
window.addEventListener('keydown', e=>{ keys[e.key.toLowerCase()] = true; if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase())) e.preventDefault(); });
window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()] = false; });

function humanControl(p){
  let mx=0,my=0,shoot=false,special=false,dash=false;
  if(p.id===0){ // WASD + E/Q
    if(keys['a'])mx-=1; if(keys['d'])mx+=1; if(keys['w'])my-=1; if(keys['s'])my+=1;
    shoot=!!keys['e']; special=!!keys['q']; dash=!!keys['shift'];
  } else if(p.id===1){ // setas + enter + /
    if(keys['arrowleft'])mx-=1; if(keys['arrowright'])mx+=1; if(keys['arrowup'])my-=1; if(keys['arrowdown'])my+=1;
    shoot=!!keys['enter']; special=!!(keys['/']||keys['?']); dash=!!keys['shift'];
  } else if(p.id===2){ // TFGH + R/Y
    if(keys['f'])mx-=1; if(keys['h'])mx+=1; if(keys['t'])my-=1; if(keys['g'])my+=1;
    shoot=!!keys['r']; special=!!keys['y'];
  } else if(p.id===3){ // IJKL + U/O
    if(keys['j'])mx-=1; if(keys['l'])mx+=1; if(keys['i'])my-=1; if(keys['k'])my+=1;
    shoot=!!keys['u']; special=!!keys['o'];
  }
  if(p.soupInvert){ mx*=-1; my*=-1; }
  return {mx,my,shoot,special,dash};
}

// bot simples mas esperto
function botControl(p, dt){
  let target=null, best=1e9;
  players.forEach(q=>{ if(q!==p&&q.alive){ const d=Math.hypot(q.x-p.x,q.y-p.y); if(d<best){best=d;target=q;} }});
  let mx=0,my=0,shoot=false,special=false;
  if(target){
    const dx=target.x-p.x, dy=target.y-p.y, d=Math.max(1,Math.hypot(dx,dy));
    // mantém distância ideal 220, foge se HP baixo
    let want = 220;
    if(p.hp<35) want = 420;
    if(d>want+40){ mx=dx/d; my=dy/d; } else if(d<want-60){ mx=-dx/d; my=-dy/d; } else { mx=-dy/d*0.7; my=dx/d*0.7; }
    // mira: atira se cooldown e mais ou menos alinhado
    shoot = d<420 && Math.random()<0.06;
    p.angle = Math.atan2(dy,dx);
    p.lastDir = {x:dx/d,y:dy/d};
    // usa bola se tiver
    if(p.hasBall && d<300 && Math.random()<0.03) special=true;
    // xerife bot usa prisão de perto
    if(p.role==='XERIFE' && d<130 && p.arrestCd<=0) special=true;
    // pega pickup próximo
    let pk=null,pd=1e9;
    pickups.forEach(k=>{ const dd=Math.hypot(k.x-p.x,k.y-p.y); if(dd<pd){pd=dd;pk=k;} });
    if(pk && pd<180){ mx=(pk.x-p.x)/pd*1.2; my=(pk.y-p.y)/pd*1.2; }
  }
  return {mx,my,shoot,special,dash:false};
}

function collideObstacles(e){
  obstacles.forEach(o=>{
    const nx=Math.max(o.x,Math.min(e.x,o.x+o.w)), ny=Math.max(o.y,Math.min(e.y,o.y+o.h));
    const dx=e.x-nx, dy=e.y-ny, d=Math.hypot(dx,dy);
    if(d<e.r){ if(d===0){e.x+=e.r;} else {e.x=nx+dx/d*e.r; e.y=ny+dy/d*e.r;} }
  });
  e.x=Math.max(e.r,Math.min(W-e.r,e.x)); e.y=Math.max(e.r+8,Math.min(H-e.r,e.y));
}

// ---------- UPDATE ----------
let lastT = 0;
function loop(t){
  if(!running) return;
  const dt = Math.min(0.033, (t-lastT)/1000 || 0.016); lastT = t;
  update(dt); render();
  const alive = players.filter(p=>p.alive);
  if(alive.length<=1){
    endGame(alive[0]); return;
  }
  requestAnimationFrame(loop);
}

function update(dt){
  // timers NPCs
  for(const k in npcs){
    const n=npcs[k]; n.t+=dt;
    // passeio aleatório
    if(Math.random()<0.02){ n.dx=(Math.random()-0.5)*60; n.dy=(Math.random()-0.5)*60; }
    n.x+=(n.dx||20)*dt; n.y+=(n.dy||10)*dt;
    if(n.x<40||n.x>W-40) n.dx*=-1; if(n.y<60||n.y>H-30) n.dy*=-1;
    n.x=Math.max(30,Math.min(W-30,n.x)); n.y=Math.max(50,Math.min(H-20,n.y));
  }
  // idosa dropa sopa (ajuda que atrapalha)
  npcs.idosa.soupCd-=dt;
  if(npcs.idosa.soupCd<=0){ npcs.idosa.soupCd=14; pickups.push({x:npcs.idosa.x,y:npcs.idosa.y,type:'sopa',t:0}); feed('👵 Dona Cida: “Toma sopinha, meu filho!” 🥣'); sfx.soup(); }
  // menino dá bola ao mais próximo
  npcs.menino.ballCd-=dt;
  if(npcs.menino.ballCd<=0){
    npcs.menino.ballCd=16;
    let best=null,bd=1e9; players.forEach(p=>{ if(p.alive&&!p.hasBall){const d=Math.hypot(p.x-npcs.menino.x,p.y-npcs.menino.y); if(d<bd){bd=d;best=p;}}});
    if(best){ best.hasBall=true; feed(`⚽ Cauã deu a bola para ${best.name}! Aperte ESPECIAL!`); sfx.pickup(); }
    else pickups.push({x:npcs.menino.x,y:npcs.menino.y,type:'bola',t:0});
  }

  // players
  players.forEach(p=>{
    if(!p.alive) return;
    if(p.stun>0){ p.stun-=dt; }
    if(p.soupTime>0){ p.soupTime-=dt; if(p.soupTime<=0) p.soupInvert=false; }
    if(p.revealTraitor>0) p.revealTraitor-=dt;
    if(p.snitch>0) p.snitch-=dt;
    p.shootCd-=dt; p.dashCd-=dt; p.arrestCd-=dt;

    let c = p.isBot ? botControl(p,dt) : humanControl(p);
    const sp = 200 * (p.dash>0?2.2:1);
    if(p.stun<=0){
      p.x += c.mx*sp*dt; p.y += c.my*sp*dt;
      if(c.mx||c.my){ p.lastDir={x:c.mx/(Math.hypot(c.mx,c.my)||1), y:c.my/(Math.hypot(c.mx,c.my)||1)}; if(p.isBot===false||true) p.angle=Math.atan2(c.my,c.mx); }
      if(!p.isBot && (c.mx||c.my)) p.angle=Math.atan2(c.my,c.mx);
    }
    if(c.dash && p.dashCd<=0 && p.stun<=0){ p.dash=0.15; p.dashCd=2; beep(500,0.08,'sine',0.08); }
    if(p.dash>0) p.dash-=dt;
    collideObstacles(p);

    // tiro
    if(c.shoot && p.shootCd<=0 && p.stun<=0){
      p.shootCd = p.role==='XERIFE'?0.45:0.6;
      const dmg = p.role==='XERIFE'?16:11;
      const a = p.angle;
      bullets.push({x:p.x+Math.cos(a)*22,y:p.y+Math.sin(a)*22,vx:Math.cos(a)*420,vy:Math.sin(a)*420,owner:p.id,dmg,life:1.2});
      sfx.shoot();
    }
    // especial: bola ou prisão do xerife
    if(c.special && p.stun<=0){
      if(p.hasBall){
        p.hasBall=false;
        thrownBalls.push({x:p.x,y:p.y,vx:p.lastDir.x*380,vy:p.lastDir.y*380,owner:p.id,life:4,bounces:0});
        feed(`⚽ ${p.name} arremessou a SUPER BOLA!`);
        if(p._specLock) {} p._specLock=true; setTimeout(()=>p._specLock=false,400);
        beep(300,0.15,'square',0.12);
      } else if(p.role==='XERIFE' && p.arrestCd<=0){
        p.arrestCd=6;
        // prende quem estiver perto na frente
        players.forEach(q=>{ if(q!==p&&q.alive&&Math.hypot(q.x-p.x,q.y-p.y)<140){ q.stun=2; feed(`⭐ ${p.name} PRENDEU ${q.name}! (stun 2s)`);} });
        beep(200,0.3,'sawtooth',0.14);
      }
    }

    // interação homem do gatinho: ficar perto ganha escudo
    const dCat = Math.hypot(p.x-npcs.homem.x, p.y-npcs.homem.y);
    if(dCat<90){ p.nearCat+=dt; if(p.nearCat>3 && !p.shield){ p.shield=true; p.revealTraitor=8; feed(`🐱 ${p.name} ganhou ESCUDO MIAU + vê o traidor 8s!`); sfx.meow(); p.nearCat=0; } }
    else p.nearCat=Math.max(0,p.nearCat-dt);

    // pegar pickups
    pickups.forEach((k,idx)=>{
      if(Math.hypot(k.x-p.x,k.y-p.y)<30){
        if(k.type==='sopa'){ p.hp=Math.min(p.maxHp,p.hp+35); p.soupTime=6; p.soupInvert=true; feed(`🥣 ${p.name} tomou a sopa da Dona Cida (+35HP, mas controles invertidos!)`); sfx.soup(); }
        if(k.type==='bola'){ p.hasBall=true; feed(`⚽ ${p.name} pegou a bola do Cauã!`); sfx.pickup(); }
        pickups.splice(idx,1);
      }
    });
  });

  // balas
  bullets.forEach((b,idx)=>{
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
    let dead=false;
    if(b.x<0||b.x>W||b.y<0||b.y>H||b.life<=0) dead=true;
    obstacles.forEach(o=>{ if(b.x>o.x&&b.x<o.x+o.w&&b.y>o.y&&b.y<o.y+o.h) dead=true; });
    // acerta NPC homem? gato dedura!
    if(!dead && Math.hypot(b.x-npcs.homem.x,b.y-npcs.homem.y)<22){
      const owner=players[b.owner]; if(owner){ owner.snitch=5; feed(`🐱 MIAU! ${owner.name} atingiu o Seu Miau e foi DEDURADO pelo gato!`); sfx.meow(); } dead=true;
    }
    if(!dead && Math.hypot(b.x-npcs.idosa.x,b.y-npcs.idosa.y)<20){ feed('👵 “Ai! Minha coluna!” — Dona Cida escapou por pouco!'); dead=true; }
    if(!dead && Math.hypot(b.x-npcs.menino.x,b.y-npcs.menino.y)<18){ dead=true; }
    // acerta player
    if(!dead){
      players.forEach(p=>{
        if(!p.alive||p.id===b.owner) return;
        if(Math.hypot(b.x-p.x,b.y-p.y)<p.r+4){
          let dmg=b.dmg;
          // traidor furtivo: dano por trás
          const owner=players[b.owner];
          if(owner&&owner.role==='TRAIDOR'){
            const angToVictim=Math.atan2(p.y-owner.y,p.x-owner.x);
            let diff=Math.abs(((angToVictim-p.angle+Math.PI*3)%(Math.PI*2))-Math.PI);
            if(diff>Math.PI/2){ dmg=Math.round(dmg*1.6); }
          }
          if(p.shield){ p.shield=false; feed(`🛡️ Escudo Miau de ${p.name} bloqueou o tiro!`); }
          else { p.hp-=dmg; sfx.hit(); burst(p.x,p.y,'#ff0'); }
          dead=true;
          if(p.hp<=0 && p.alive){ kill(p, owner); }
        }
      });
    }
    if(dead) bullets.splice(idx,1);
  });

  // bolas arremessadas (quicam, stunam)
  thrownBalls.forEach((b,idx)=>{
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
    if(b.x<10||b.x>W-10){b.vx*=-1;b.bounces++;} if(b.y<40||b.y>H-10){b.vy*=-1;b.bounces++;}
    let dead=b.life<=0;
    players.forEach(p=>{
      if(!p.alive||p.id===b.owner) return;
      if(Math.hypot(b.x-p.x,b.y-p.y)<p.r+8){
        p.hp-=15; p.stun=2; feed(`⚽ BOLAÇA! ${players[b.owner].name} atordoou ${p.name}!`); sfx.hit(); burst(p.x,p.y,'#0ff');
        if(p.hp<=0&&p.alive) kill(p, players[b.owner]);
        dead=true;
      }
    });
    if(dead) thrownBalls.splice(idx,1);
  });

  pickups.forEach(k=>k.t+=dt);
  particles.forEach((pt,i)=>{ pt.x+=pt.vx*dt; pt.y+=pt.vy*dt; pt.life-=dt; if(pt.life<=0) particles.splice(i,1); });

  updateHud();
}

function burst(x,y,c){ for(let i=0;i<10;i++) particles.push({x,y,vx:(Math.random()-0.5)*200,vy:(Math.random()-0.5)*200,life:0.4,c}); }

function kill(victim, killer){
  victim.alive=false; victim.hp=0;
  if(killer&&killer!==victim){ killer.kills++; feed(`💀 ${killer.name} (${killer.role}) eliminou ${victim.name} (${victim.role})!`); }
  else feed(`💀 ${victim.name} caiu!`);
  burst(victim.x,victim.y,victim.color);
  sfx.hit();
}

// ---------- RENDER ----------
function render(){
  ctx.clearRect(0,0,W,H);
  // chão neon
  ctx.fillStyle='#0a0f22'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='#1c2450';
  for(let x=0;x<W;x+=40){ ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke(); }
  for(let y=0;y<H;y+=40){ ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke(); }
  // obstáculos
  ctx.fillStyle='#232c5e';
  obstacles.forEach(o=>{ ctx.fillRect(o.x,o.y,o.w,o.h); ctx.strokeStyle='#08d9d6'; ctx.strokeRect(o.x,o.y,o.w,o.h); });

  // pickups
  pickups.forEach(k=>{
    ctx.font='26px serif'; ctx.textAlign='center';
    ctx.fillText(k.type==='sopa'?'🥣':'⚽', k.x, k.y+8+Math.sin(k.t*4)*3);
  });

  // NPCs
  drawNpc(npcs.idosa,'👵','#ffd6a5');
  drawNpc(npcs.menino,'⚽','#a0e7e5');
  drawNpc(npcs.homem,'🐱','#fbc4ff');
  ctx.fillStyle='#fff'; ctx.font='11px sans-serif'; ctx.textAlign='center';
  ctx.fillText('Dona Cida',npcs.idosa.x,npcs.idosa.y-22);
  ctx.fillText('Cauã',npcs.menino.x,npcs.menino.y-22);
  ctx.fillText('Seu Miau + 🐱',npcs.homem.x,npcs.homem.y-22);

  // seta do gato que revela traidor
  players.forEach(p=>{
    if(p.alive&&p.revealTraitor>0){
      const t=players.find(q=>q.role==='TRAIDOR'&&q.alive);
      if(t){ ctx.strokeStyle='#ff0'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(p.x,p.y-24); ctx.lineTo(t.x,t.y); ctx.stroke();
        ctx.fillStyle='#ff0'; ctx.fillText('TRAIDOR?',(p.x+t.x)/2,(p.y+t.y)/2); }
    }
  });

  // balas e bolas
  ctx.fillStyle='#ffe66d';
  bullets.forEach(b=>{ ctx.beginPath();ctx.arc(b.x,b.y,4,0,7);ctx.fill(); });
  thrownBalls.forEach(b=>{ ctx.font='22px serif';ctx.fillText('⚽',b.x,b.y+7); });

  // players
  players.forEach(p=>{
    if(!p.alive){
      ctx.fillStyle='#555'; ctx.font='22px serif'; ctx.textAlign='center'; ctx.fillText('💀',p.x,p.y);
      return;
    }
    // snitch: dedurado
    if(p.snitch>0){ ctx.strokeStyle='#f00'; ctx.lineWidth=3; ctx.beginPath();ctx.arc(p.x,p.y,p.r+8,0,7);ctx.stroke(); }
    // corpo
    ctx.fillStyle=p.color; ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,7);ctx.fill();
    ctx.strokeStyle=p.shield?'#0f0':'#fff'; ctx.lineWidth=p.shield?4:2; ctx.stroke();
    // arma
    ctx.strokeStyle='#fff'; ctx.lineWidth=4; ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+Math.cos(p.angle)*26,p.y+Math.sin(p.angle)*26);ctx.stroke();
    // chapéu do xerife / máscara do traidor (só visível p/ si? mostramos ícone genérico p/ não entregar — mostramos só se morto ou se você tem reveal)
    ctx.font='16px serif'; ctx.textAlign='center';
    let icon = p.role==='XERIFE'?'⭐':'';
    // esconde máscara do traidor a não ser que dead/reveal — clima de dedução
    const anyReveal = players.some(q=>q.alive&&q.revealTraitor>0);
    if(p.role==='TRAIDOR' && anyReveal) icon='🗡️?';
    ctx.fillText(icon,p.x,p.y-20);
    if(p.hasBall){ ctx.font='14px serif'; ctx.fillText('⚽',p.x+18,p.y-14); }
    if(p.soupInvert){ ctx.font='14px serif'; ctx.fillText('🥴',p.x-18,p.y-14); }
    // nome + hp
    ctx.fillStyle='#fff'; ctx.font='12px sans-serif';
    ctx.fillText(`${p.name}${p.isBot?' [BOT]':''}`,p.x,p.y+p.r+14);
    ctx.fillStyle='#300'; ctx.fillRect(p.x-20,p.y+p.r+18,40,6);
    ctx.fillStyle=p.hp>50?'#0f0':p.hp>25?'#ff0':'#f00';
    ctx.fillRect(p.x-20,p.y+p.r+18,40*Math.max(0,p.hp/p.maxHp),6);
  });

  // partículas
  particles.forEach(pt=>{ ctx.fillStyle=pt.c; ctx.fillRect(pt.x,pt.y,4,4); });
}

function drawNpc(n, emoji, ring){
  ctx.strokeStyle=ring; ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(n.x,n.y,16,0,7);ctx.stroke();
  ctx.font='22px serif'; ctx.textAlign='center'; ctx.fillText(emoji,n.x,n.y+7);
}

function updateHud(){
  const box=$('playersHud'); box.innerHTML='';
  players.forEach(p=>{
    const d=document.createElement('div'); d.className='pcard'+(p.alive?'':' dead');
    d.style.borderLeftColor=p.color;
    const roleShow = p.alive ? '❓' : p.role; // esconde papel até morrer — dedução!
    d.innerHTML=`<b style="color:${p.color}">${p.name}</b> ${p.isBot?'[BOT]':''}<br/>HP:${Math.max(0,Math.round(p.hp))} • Kills:${p.kills} • ${roleShow} ${p.hasBall?'⚽':''} ${p.shield?'🛡️🐱':''} ${p.soupInvert?'🥴':''}`;
    box.appendChild(d);
  });
}

function endGame(winner){
  running=false; sfx.win();
  overEl.classList.remove('hidden');
  $('winnerText').textContent = winner? `🏆 ${winner.name} VENCEU! (${winner.role})` : 'Empate — todos caíram!';
  $('revealRoles').innerHTML = players.map(p=>`<div style="border-left:6px solid ${p.color};padding:6px;margin:4px;background:#0f1430"> <b>${p.name}</b> era <b>${p.role==='TRAIDOR'?'🗡️ TRAIDOR':p.role==='XERIFE'?'⭐ XERIFE':'🎯 SOBREVIVENTE'}</b> • ${p.kills} kills ${p.alive?'• SOBREVIVEU':''}</div>`).join('')
    + '<p>👵 Dona Cida: “Ai, meus filhos, parem de brigar!”<br/>🧒 Cauã: “Minha bola!!”<br/>🧔 Seu Miau: “Miau. (o gato sempre soube quem era o traidor)”</p>';
}
