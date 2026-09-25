// TRAIDOR: Último Sobrevivente 3D — mesma regra 2D, render Three.js
import * as THREE from 'three';

const W = 960, H = 600;
const $ = id => document.getElementById(id);
const menuEl = $('menu'), hudEl = $('hud'), overEl = $('gameOver');
const container3d = $('game3d');

let players = [], bullets = [], thrownBalls = [], pickups = [], particles = [];
let npcs = {}, obstacles = [], keys = {}, running = false;
let killfeedEl = $('killfeed');

const COLORS = ['#00e5ff', '#ff9f1c', '#7CFC00', '#ff4dd2'];
const NAMES_DEFAULT = ['Você', 'Rival', 'Lenda', 'Sombra'];
const toWX = x => (x - W/2) / 20;
const toWZ = y => (y - H/2) / 20;

// ---------- AUDIO ----------
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

// ---------- THREE SETUP - CENÁRIOS 🌲👵🐱 ----------
let currentScenario = 'floresta';
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1f14);
scene.fog = new THREE.Fog(0x0a1f14, 55, 115);
const camera = new THREE.PerspectiveCamera(50, 960/600, 0.1, 300);
camera.position.set(0, 38, 27);
camera.lookAt(0, 0, -2);
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setSize(960, 600);
renderer.shadowMap.enabled = true;
container3d.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xcfffd0, 0x1a2f1a, 0.85));
const dirLight = new THREE.DirectionalLight(0xfff2cc, 1.0);
dirLight.position.set(12, 30, 10);
dirLight.castShadow = true;
scene.add(dirLight);
// luz do sol coando nas árvores + brilho verde da mata (mantém nomes p/ animação)
const neonPink = new THREE.PointLight(0xffd166, 50, 80); neonPink.position.set(-20, 8, -10); scene.add(neonPink);
const neonCyan = new THREE.PointLight(0x52ff8a, 50, 80); neonCyan.position.set(20, 8, 10); scene.add(neonCyan);

// chão base + grade (cores trocadas por cenário)
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(52, 34),
  new THREE.MeshStandardMaterial({ color: 0x1e4d2b, roughness: 1 })
);
ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(52, 26, 0x2d6a4f, 0x1b4332);
grid.position.y = 0.02; grid.material.transparent = true; grid.material.opacity = 0.35; scene.add(grid);
// paredes da arena (cores trocadas por cenário)
const wallMat = new THREE.MeshStandardMaterial({ color: 0x5a3b1e, emissive: 0x2d6a4f, emissiveIntensity: 0.15, roughness: 1 });
const wallMeshes = [];
[[0,-17,52,1],[0,17,52,1],[-26,0,1,34],[26,0,1,34]].forEach(([x,z,w,d])=>{
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, d), wallMat);
  m.position.set(x, 0.7, z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  wallMeshes.push(m);
});

// grupo do cenário (limpa e reconstrói a cada partida)
const scenarioGroup = new THREE.Group();
scene.add(scenarioGroup);
let fireflies = null;
function clearScenario(){
  while(scenarioGroup.children.length){
    const c = scenarioGroup.children.pop();
    scenarioGroup.remove(c);
  }
  fireflies = null;
}
function mat(color, opts={}){ return new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...opts }); }
function box(w,h,d,color,x,y,z,emissive=0x000000){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat(color, { emissive, emissiveIntensity: emissive?0.2:0 }));
  m.position.set(x,y,z); m.castShadow = true; m.receiveShadow = true; scenarioGroup.add(m); return m;
}
function makeTree(x, z, s=1){
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35*s, 0.5*s, 2.2*s, 8), mat(0x6b4a2b, { roughness: 1 }));
  trunk.position.y = 1.1*s; trunk.castShadow = true; g.add(trunk);
  const greens = [0x1b7837, 0x239b47, 0x14532d];
  for(let i=0;i<3;i++){
    const cone = new THREE.Mesh(new THREE.ConeGeometry((2.0-i*0.45)*s, 1.8*s, 9), mat(greens[i%3]));
    cone.position.y = (2.4+i*1.1)*s; cone.castShadow = true; g.add(cone);
  }
  g.position.set(x, 0, z); g.rotation.y = Math.random()*Math.PI*2;
  scenarioGroup.add(g); return g;
}
function makeBush(x, z, s=1, color=0x2d6a4f){
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.7*s, 10, 10), mat(color, { roughness: 1 }));
  m.position.set(x, 0.5*s, z); m.castShadow = true; scenarioGroup.add(m);
}
function makeRock(x, z, s=1){
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6*s), mat(0x6c757d, { roughness: 1 }));
  m.position.set(x, 0.4*s, z); m.castShadow = true; scenarioGroup.add(m);
}
function makeFireflies(){
  const geo = new THREE.BufferGeometry();
  const N = 60, pos = new Float32Array(N*3);
  for(let i=0;i<N;i++){ pos[i*3]=-25+Math.random()*50; pos[i*3+1]=1+Math.random()*5; pos[i*3+2]=-16+Math.random()*32; }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  fireflies = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xfff9a3, size: 0.25, transparent: true, opacity: 0.9 }));
  scenarioGroup.add(fireflies);
}

function buildScenario(type){
  clearScenario();
  currentScenario = type;
  if(type === 'casa_cida'){
    // 👵 Casa da Dona Cida — sala/cozinha aconchegante
    scene.background.set(0x1a1210); scene.fog.color.set(0x1a1210);
    ground.material.color.set(0x8b5a2b);
    wallMat.color.set(0xd9a066); wallMat.emissive.set(0xff9f1c);
    grid.material.color.set(0x5a3b1e);
    // tapete central
    box(14, 0.1, 9, 0xa4133c, 0, 0.05, 0);
    box(10, 0.12, 6, 0xffca3a, 0, 0.06, 0);
    // fogão + panela de sopa 🥣
    box(3, 2, 2, 0x3a3a3a, -20, 1, -10);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.7, 0.8, 14), mat(0x222222));
    pot.position.set(-20, 2.4, -10); pot.castShadow = true; scenarioGroup.add(pot);
    const soup = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.2, 14), mat(0xff9f1c, { emissive: 0xff6b00, emissiveIntensity: 0.5 }));
    soup.position.set(-20, 2.8, -10); scenarioGroup.add(soup);
    // mesa + cadeiras
    box(6, 0.3, 3.5, 0x6b4a2b, 5, 1.2, -8);
    [[3,-8],[7,-8]].forEach(([lx,lz])=>{ box(0.3,1.2,0.3,0x4a3520,lx-1,0.6,lz); box(0.3,1.2,0.3,0x4a3520,lx+1,0.6,lz); });
    box(1.2, 1.8, 1.2, 0x7f4f24, 2, 0.9, -5); box(1.2, 1.8, 1.2, 0x7f4f24, 8, 0.9, -5);
    // sofá + estante + quadro
    box(6, 1.2, 2, 0xb388ff, -8, 0.6, 12);
    box(6, 1.5, 0.6, 0x8e6cc9, -8, 1.5, 13);
    box(4, 3, 0.8, 0x4a3520, 18, 1.5, 13);
    box(2, 0.25, 0.7, 0xffd166, 18, 1.2, 13); box(2, 0.25, 0.7, 0x06d6a0, 18, 2.0, 13);
    const label = makeLabel('Casa da Dona Cida 👵🏠'); label.position.set(0, 7, -14); scenarioGroup.add(label);
    feed('👵 Dona Cida: “Entrem, meus filhos! Não reparem a bagunça... e cuidado com a sopa quente!”');
  } else if(type === 'barraco_jorge'){
    // 🐱 Barraquinho do Jorge — madeira + zinco, cantinho do Mandu
    scene.background.set(0x0d1420); scene.fog.color.set(0x0d1420);
    ground.material.color.set(0x4a4a4a);
    wallMat.color.set(0x6b4f2a); wallMat.emissive.set(0x8b5a2b);
    grid.material.color.set(0x333333);
    // barraco central: 4 paredes de tábua + telha zinco
    const wx = 8, wz = 5;
    box(10, 3, 0.4, 0x8b5a2b, wx, 1.5, wz-4);
    box(10, 3, 0.4, 0x7a4e25, wx, 1.5, wz+4);
    box(0.4, 3, 8, 0x8b5a2b, wx-5, 1.5, wz);
    box(0.4, 3, 8, 0x7a4e25, wx+5, 1.5, wz);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.25, 9.5), mat(0x9aa0a6, { roughness: 0.4, metalness: 0.5 }));
    roof.position.set(wx, 3.4, wz); roof.rotation.z = 0.08; roof.castShadow = true; scenarioGroup.add(roof);
    // varal + caixas + pneu
    box(0.2, 3, 0.2, 0x4a3520, -12, 1.5, 8); box(0.2, 3, 0.2, 0x4a3520, -6, 1.5, 8);
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 6, 6), mat(0xdddddd));
    line.rotation.z = Math.PI/2; line.position.set(-9, 2.8, 8); scenarioGroup.add(line);
    box(1.2, 1.2, 1.2, 0xfff3b0, -9.5, 2.1, 8); box(1.0, 1.0, 1.0, 0x06d6a0, -8, 2.1, 8);
    box(2, 1, 1.4, 0x5a3b1e, -16, 0.5, -6); box(1.6, 0.9, 1.2, 0x6b4f2a, -14, 0.45, -5);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.35, 10, 20), mat(0x222222));
    tire.position.set(16, 0.5, 9); tire.rotation.x = Math.PI/2; tire.castShadow = true; scenarioGroup.add(tire);
    // cantinho do Mandu 🐱: caminha + potes
    const bed = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.35, 16), mat(0xfbc4ff));
    bed.position.set(wx-2.5, 0.18, wz+1.5); bed.receiveShadow = true; scenarioGroup.add(bed);
    const bowlM = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.3, 12), mat(0xff595e));
    bowlM.position.set(wx+2, 0.15, wz+2); scenarioGroup.add(bowlM);
    const bowlW = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.3, 12), mat(0x06d6a0));
    bowlW.position.set(wx+3, 0.15, wz+2); scenarioGroup.add(bowlW);
    // bolsa surrada reserva do Jorge
    box(1.4, 1, 0.8, 0x4a3520, wx, 0.5, wz-2);
    const label = makeLabel('Barraco do Jorge + Mandu 🐱'); label.position.set(wx, 6, wz); scenarioGroup.add(label);
    feed('🧔 Jorge: “Bem-vindo ao meu barraco! Não assusta o Mandu, hein!” 🐱');
  } else {
    // 🌲 Floresta (padrão)
    scene.background.set(0x0a1f14); scene.fog.color.set(0x0a1f14);
    ground.material.color.set(0x1e4d2b);
    wallMat.color.set(0x5a3b1e); wallMat.emissive.set(0x2d6a4f);
    grid.material.color.set(0x2d6a4f);
    for(let i=0;i<26;i++){
      const a = (i/26)*Math.PI*2;
      makeTree(Math.cos(a)*(30+Math.random()*8), Math.sin(a)*(21+Math.random()*6), 0.9+Math.random()*0.9);
    }
    for(let i=0;i<12;i++) makeBush(-24+Math.random()*48, (Math.random()<0.5?-1:1)*(14+Math.random()*2.5), 0.7+Math.random()*0.8);
    for(let i=0;i<6;i++) makeRock(-22+Math.random()*44, (Math.random()<0.5?-1:1)*(12+Math.random()*3), 0.6+Math.random()*0.7);
    makeFireflies();
  }
}

let obstacleMeshes = [], playerMeshes = {}, npcMeshes = {}, bulletMeshes = [], ballMeshes = [], pickupMeshes = [], particleMeshes = [], revealLine = null;

function makeLabel(text, color='#fff'){
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0,8,256,48);
  g.fillStyle = color; g.font = 'bold 26px Arial'; g.textAlign = 'center';
  g.fillText(text.slice(0,14), 128, 42);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest:false }));
  sp.scale.set(6, 1.5, 1);
  return sp;
}

function buildPlayerMesh(p){
  const grp = new THREE.Group();
  const col = new THREE.Color(p.color);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 0.9, 4, 12),
    new THREE.MeshStandardMaterial({ color: col, roughness: 0.4 }));
  body.position.y = 1.1; body.castShadow = true; grp.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xffe0bd }));
  head.position.y = 2.3; head.castShadow = true; grp.add(head);
  // chapéu xerife
  if(p.role === 'XERIFE'){
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.25, 12),
      new THREE.MeshStandardMaterial({ color: 0x5a3b00 }));
    hat.position.y = 2.75; grp.add(hat);
  }
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x111111 }));
  gun.position.set(0.5, 1.4, 0.8); grp.add(gun);
  grp.userData.gun = gun; grp.userData.body = body;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.08, 8, 32),
    new THREE.MeshBasicMaterial({ color: col }));
  ring.rotation.x = Math.PI/2; ring.position.y = 0.1; grp.add(ring);
  grp.userData.ring = ring;
  const label = makeLabel(p.name + (p.isBot ? ' [BOT]' : ''), p.color);
  label.position.y = 3.5; grp.add(label);
  // bola na mão + escudo
  const ballIcon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x00e5ff, emissiveIntensity: 0.8 }));
  ballIcon.position.set(-0.9, 1.6, 0); ballIcon.visible = false; grp.add(ballIcon);
  grp.userData.ballIcon = ballIcon;
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.25 }));
  shield.position.y = 1.4; shield.visible = false; grp.add(shield);
  grp.userData.shield = shield;
  scene.add(grp);
  return grp;
}

function buildNpcMeshes(){
  // limpa antigos
  for(const k in npcMeshes){ scene.remove(npcMeshes[k].grp); }
  npcMeshes = {};
  // Dona Cida 👵 — roxo, bengala
  {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 0.8, 4, 10),
      new THREE.MeshStandardMaterial({ color: 0xb388ff }));
    body.position.y = 1; body.castShadow = true; grp.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xffe0bd }));
    head.position.y = 2.1; grp.add(head);
    const cane = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
    cane.position.set(0.7, 0.9, 0.2); grp.add(cane);
    const label = makeLabel('Dona Cida 👵'); label.position.y = 3; grp.add(label);
    scene.add(grp); npcMeshes.idosa = { grp };
  }
  // Cauã 🧒 — pequeno laranja + bola
  {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.6, 4, 10),
      new THREE.MeshStandardMaterial({ color: 0xff9f1c }));
    body.position.y = 0.75; body.castShadow = true; grp.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xffe0bd }));
    head.position.y = 1.6; grp.add(head);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 14),
      new THREE.MeshStandardMaterial({ color: 0xffffff }));
    ball.position.set(0.7, 0.4, 0); ball.castShadow = true; grp.add(ball);
    grp.userData.ball = ball;
    const label = makeLabel('Cauã ⚽'); label.position.y = 2.5; grp.add(label);
    scene.add(grp); npcMeshes.menino = { grp };
  }
  // Jorge 🧔 + Mandu 🐱 na bolsa surrada
  {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.65, 1, 4, 10),
      new THREE.MeshStandardMaterial({ color: 0x6b4f2a }));
    body.position.y = 1.2; body.castShadow = true; grp.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xe8b98a }));
    head.position.y = 2.4; grp.add(head);
    // bolsa surrada
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 1 }));
    bag.position.set(0.75, 1.1, 0.2); grp.add(bag);
    // Mandu o gatinho — branquinho com orelhas
    const mandu = new THREE.Group();
    const catBody = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xf5f5f5 }));
    mandu.add(catBody);
    const earG = new THREE.ConeGeometry(0.08, 0.15, 4);
    const earM = new THREE.MeshStandardMaterial({ color: 0xf5f5f5 });
    const e1 = new THREE.Mesh(earG, earM); e1.position.set(-0.1, 0.2, 0); mandu.add(e1);
    const e2 = new THREE.Mesh(earG, earM); e2.position.set(0.1, 0.2, 0); mandu.add(e2);
    mandu.position.set(0.75, 1.5, 0.2);
    grp.add(mandu);
    grp.userData.mandu = mandu;
    const label = makeLabel('Jorge + Mandu 🐱', '#fbc4ff'); label.position.y = 3.2; grp.add(label);
    scene.add(grp); npcMeshes.homem = { grp };
  }
}

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

function clearDynamic(){
  for(const id in playerMeshes) scene.remove(playerMeshes[id]);
  playerMeshes = {};
  obstacleMeshes.forEach(m=>scene.remove(m)); obstacleMeshes = [];
  bulletMeshes.forEach(m=>scene.remove(m)); bulletMeshes = [];
  ballMeshes.forEach(m=>scene.remove(m)); ballMeshes = [];
  pickupMeshes.forEach(m=>scene.remove(m)); pickupMeshes = [];
  particleMeshes.forEach(m=>scene.remove(m)); particleMeshes = [];
  if(revealLine){ scene.remove(revealLine); revealLine = null; }
}

function startGame(){
  const total = parseInt($('totalPlayers').value);
  let humans = Math.min(parseInt($('humanPlayers').value), total);
  clearDynamic();
  players=[]; bullets=[]; thrownBalls=[]; pickups=[]; particles=[];
  const scenario = document.getElementById('scenario')?.value || 'floresta';
  killfeedEl.innerHTML = '';
  buildScenario(scenario);
  obstacles = [
    {x:180,y:150,w:120,h:20},{x:660,y:150,w:120,h:20},
    {x:180,y:430,w:120,h:20},{x:660,y:430,w:120,h:20},
    {x:440,y:240,w:80,h:120},{x:80,y:270,w:30,h:60},{x:850,y:270,w:30,h:60},
  ];
  // obstáculos 3D — visual muda por cenário
  const obsStyle = scenario === 'casa_cida'
    ? { a: 0x7f4f24, b: 0xb388ff, e: 0x5a3b1e }
    : scenario === 'barraco_jorge'
    ? { a: 0x8b5a2b, b: 0x6c757d, e: 0x333333 }
    : { a: 0x6b4a2b, b: 0x3a5a3a, e: 0x1b4332 };
  obstacles.forEach((o, idx)=>{
    const w = o.w/20, d = o.h/20;
    const isLog = idx % 2 === 0;
    const m = new THREE.Mesh(
      isLog ? new THREE.CylinderGeometry(d/2, d/2, w, 10) : new THREE.BoxGeometry(w, 2.2, d),
      new THREE.MeshStandardMaterial({ color: isLog ? obsStyle.a : obsStyle.b, emissive: obsStyle.e, emissiveIntensity: 0.25, roughness: 1 })
    );
    if(isLog){ m.rotation.z = Math.PI/2; m.position.set(toWX(o.x+o.w/2), d/2, toWZ(o.y+o.h/2)); }
    else m.position.set(toWX(o.x+o.w/2), 1.1, toWZ(o.y+o.h/2));
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m); obstacleMeshes.push(m);
  });

  let roles = ['TRAIDOR','XERIFE'];
  while(roles.length<total) roles.push('SOBREVIVENTE');
  roles = roles.sort(()=>Math.random()-0.5);

  for(let i=0;i<total;i++){
    const isHuman = i<humans;
    let nm = isHuman ? (document.getElementById('pname'+i)?.value || NAMES_DEFAULT[i]) : 'BOT '+NAMES_DEFAULT[i];
    const p = {
      id:i, name:nm, color:COLORS[i], role:roles[i],
      x: 120 + Math.random()*720, y: 100 + Math.random()*400,
      r:16, hp: roles[i]==='XERIFE'?120:100, maxHp: roles[i]==='XERIFE'?120:100,
      alive:true, isBot:!isHuman, angle:0,
      shootCd:0, dashCd:0, dash:0, stun:0, soupTime:0, soupInvert:false,
      hasBall:false, shield:false, revealTraitor:0, snitch:0, nearCat:0,
      arrestCd:0, kills:0, lastDir:{x:1,y:0}
    };
    players.push(p);
    playerMeshes[i] = buildPlayerMesh(p);
  }

  npcs = {
    idosa: {kind:'idosa', name:'Dona Cida 👵', x:480,y:120, t:0, soupCd:8},
    menino:{kind:'menino',name:'Cauã ⚽', x:200,y:300, t:0, ballCd:5},
    homem: {kind:'homem', name:'Jorge + Mandu 🐱', x:760,y:300, t:0}
  };
  buildNpcMeshes();

  menuEl.classList.add('hidden');
  overEl.classList.add('hidden');
  container3d.classList.remove('hidden');
  $('game').classList.add('hidden');
  hudEl.classList.remove('hidden');
  running = true;
  if(scenario === 'casa_cida') feed('🏠 Batalha na CASA DA DONA CIDA começou! Seja o ÚNICO sobrevivente da sala!');
  else if(scenario === 'barraco_jorge') feed('🏚️ Batalha no BARRACO DO JORGE começou! Seja o ÚNICO sobrevivente do quintal!');
  else feed('🌲 Batalha na FLORESTA começou! Seja o ÚNICO sobrevivente da clareira!');
  feed('🐱 Jorge carrega o Mandu na bolsa surrada. Proteja-os!');
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
  html += '<div>👵🥣 sopa cura mas confunde • ⚽ bola atordoa • 🐱 Mandu protege e dedura</div></div>';
  pop.innerHTML = html; pop.classList.remove('hidden');
  setTimeout(()=>pop.classList.add('hidden'), 6000);
}

function feed(msg){
  const d = document.createElement('div'); d.textContent = msg;
  killfeedEl.prepend(d);
  while(killfeedEl.children.length>7) killfeedEl.lastChild.remove();
}

// ---------- INPUT (igual ao 2D) ----------
window.addEventListener('keydown', e=>{ keys[e.key.toLowerCase()] = true; if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase())) e.preventDefault(); });
window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()] = false; });

function humanControl(p){
  let mx=0,my=0,shoot=false,special=false,dash=false;
  if(p.id===0){
    if(keys['a'])mx-=1; if(keys['d'])mx+=1; if(keys['w'])my-=1; if(keys['s'])my+=1;
    shoot=!!keys['e']; special=!!keys['q']; dash=!!keys['shift'];
  } else if(p.id===1){
    if(keys['arrowleft'])mx-=1; if(keys['arrowright'])mx+=1; if(keys['arrowup'])my-=1; if(keys['arrowdown'])my+=1;
    shoot=!!keys['enter']; special=!!(keys['/']||keys['?']); dash=!!keys['shift'];
  } else if(p.id===2){
    if(keys['f'])mx-=1; if(keys['h'])mx+=1; if(keys['t'])my-=1; if(keys['g'])my+=1;
    shoot=!!keys['r']; special=!!keys['y'];
  } else if(p.id===3){
    if(keys['j'])mx-=1; if(keys['l'])mx+=1; if(keys['i'])my-=1; if(keys['k'])my+=1;
    shoot=!!keys['u']; special=!!keys['o'];
  }
  if(p.soupInvert){ mx*=-1; my*=-1; }
  return {mx,my,shoot,special,dash};
}

function botControl(p){
  let target=null, best=1e9;
  players.forEach(q=>{ if(q!==p&&q.alive){ const d=Math.hypot(q.x-p.x,q.y-p.y); if(d<best){best=d;target=q;} }});
  let mx=0,my=0,shoot=false,special=false;
  if(target){
    const dx=target.x-p.x, dy=target.y-p.y, d=Math.max(1,Math.hypot(dx,dy));
    let want = 220;
    if(p.hp<35) want = 420;
    if(d>want+40){ mx=dx/d; my=dy/d; } else if(d<want-60){ mx=-dx/d; my=-dy/d; } else { mx=-dy/d*0.7; my=dx/d*0.7; }
    shoot = d<420 && Math.random()<0.06;
    p.angle = Math.atan2(dy,dx);
    p.lastDir = {x:dx/d,y:dy/d};
    if(p.hasBall && d<300 && Math.random()<0.03) special=true;
    if(p.role==='XERIFE' && d<130 && p.arrestCd<=0) special=true;
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

// ---------- UPDATE (regras idênticas, só nomes Jorge/Mandu) ----------
let lastT = 0;
function loop(t){
  if(!running) return;
  const dt = Math.min(0.033, (t-lastT)/1000 || 0.016); lastT = t;
  update(dt); render3d(dt);
  const alive = players.filter(p=>p.alive);
  if(alive.length<=1){ endGame(alive[0]); return; }
  requestAnimationFrame(loop);
}

function update(dt){
  for(const k in npcs){
    const n=npcs[k]; n.t+=dt;
    if(Math.random()<0.02){ n.dx=(Math.random()-0.5)*60; n.dy=(Math.random()-0.5)*60; }
    n.x+=(n.dx||20)*dt; n.y+=(n.dy||10)*dt;
    if(n.x<40||n.x>W-40) n.dx*=-1; if(n.y<60||n.y>H-30) n.dy*=-1;
    n.x=Math.max(30,Math.min(W-30,n.x)); n.y=Math.max(50,Math.min(H-20,n.y));
  }
  npcs.idosa.soupCd-=dt;
  if(npcs.idosa.soupCd<=0){ npcs.idosa.soupCd=14; pickups.push({x:npcs.idosa.x,y:npcs.idosa.y,type:'sopa',t:0}); feed('👵 Dona Cida: “Toma sopinha, meu filho!” 🥣'); sfx.soup(); }
  npcs.menino.ballCd-=dt;
  if(npcs.menino.ballCd<=0){
    npcs.menino.ballCd=16;
    let best=null,bd=1e9; players.forEach(p=>{ if(p.alive&&!p.hasBall){const d=Math.hypot(p.x-npcs.menino.x,p.y-npcs.menino.y); if(d<bd){bd=d;best=p;}}});
    if(best){ best.hasBall=true; feed(`⚽ Cauã deu a bola para ${best.name}! Aperte ESPECIAL!`); sfx.pickup(); }
    else pickups.push({x:npcs.menino.x,y:npcs.menino.y,type:'bola',t:0});
  }

  players.forEach(p=>{
    if(!p.alive) return;
    if(p.stun>0) p.stun-=dt;
    if(p.soupTime>0){ p.soupTime-=dt; if(p.soupTime<=0) p.soupInvert=false; }
    if(p.revealTraitor>0) p.revealTraitor-=dt;
    if(p.snitch>0) p.snitch-=dt;
    p.shootCd-=dt; p.dashCd-=dt; p.arrestCd-=dt;

    let c = p.isBot ? botControl(p) : humanControl(p);
    const sp = 200 * (p.dash>0?2.2:1);
    if(p.stun<=0){
      p.x += c.mx*sp*dt; p.y += c.my*sp*dt;
      if(c.mx||c.my){ p.lastDir={x:c.mx/(Math.hypot(c.mx,c.my)||1), y:c.my/(Math.hypot(c.mx,c.my)||1)}; p.angle=Math.atan2(c.my,c.mx); }
    }
    if(c.dash && p.dashCd<=0 && p.stun<=0){ p.dash=0.15; p.dashCd=2; beep(500,0.08,'sine',0.08); }
    if(p.dash>0) p.dash-=dt;
    collideObstacles(p);

    if(c.shoot && p.shootCd<=0 && p.stun<=0){
      p.shootCd = p.role==='XERIFE'?0.45:0.6;
      const dmg = p.role==='XERIFE'?16:11;
      const a = p.angle;
      bullets.push({x:p.x+Math.cos(a)*22,y:p.y+Math.sin(a)*22,vx:Math.cos(a)*420,vy:Math.sin(a)*420,owner:p.id,dmg,life:1.2});
      sfx.shoot();
    }
    if(c.special && p.stun<=0){
      if(p.hasBall){
        p.hasBall=false;
        thrownBalls.push({x:p.x,y:p.y,vx:p.lastDir.x*380,vy:p.lastDir.y*380,owner:p.id,life:4,bounces:0});
        feed(`⚽ ${p.name} arremessou a SUPER BOLA!`);
        beep(300,0.15,'square',0.12);
      } else if(p.role==='XERIFE' && p.arrestCd<=0){
        p.arrestCd=6;
        players.forEach(q=>{ if(q!==p&&q.alive&&Math.hypot(q.x-p.x,q.y-p.y)<140){ q.stun=2; feed(`⭐ ${p.name} PRENDEU ${q.name}! (stun 2s)`);} });
        beep(200,0.3,'sawtooth',0.14);
      }
    }

    // Jorge + Mandu: ficar perto ganha Escudo Mandu
    const dCat = Math.hypot(p.x-npcs.homem.x, p.y-npcs.homem.y);
    if(dCat<90){ p.nearCat+=dt; if(p.nearCat>3 && !p.shield){ p.shield=true; p.revealTraitor=8; feed(`🐱 ${p.name} ganhou ESCUDO MANDU + vê o traidor 8s! (Mandu miou!)`); sfx.meow(); p.nearCat=0; } }
    else p.nearCat=Math.max(0,p.nearCat-dt);

    pickups.forEach((k,idx)=>{
      if(Math.hypot(k.x-p.x,k.y-p.y)<30){
        if(k.type==='sopa'){ p.hp=Math.min(p.maxHp,p.hp+35); p.soupTime=6; p.soupInvert=true; feed(`🥣 ${p.name} tomou a sopa da Dona Cida (+35HP, mas controles invertidos!)`); sfx.soup(); }
        if(k.type==='bola'){ p.hasBall=true; feed(`⚽ ${p.name} pegou a bola do Cauã!`); sfx.pickup(); }
        pickups.splice(idx,1);
      }
    });
  });

  bullets.forEach((b,idx)=>{
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
    let dead=false;
    if(b.x<0||b.x>W||b.y<0||b.y>H||b.life<=0) dead=true;
    obstacles.forEach(o=>{ if(b.x>o.x&&b.x<o.x+o.w&&b.y>o.y&&b.y<o.y+o.h) dead=true; });
    if(!dead && Math.hypot(b.x-npcs.homem.x,b.y-npcs.homem.y)<22){
      const owner=players[b.owner]; if(owner){ owner.snitch=5; feed(`🐱 MIAU do Mandu! ${owner.name} atingiu o Jorge e foi DEDURADO!`); sfx.meow(); } dead=true;
    }
    if(!dead && Math.hypot(b.x-npcs.idosa.x,b.y-npcs.idosa.y)<20){ feed('👵 “Ai! Minha coluna!” — Dona Cida escapou por pouco!'); dead=true; }
    if(!dead && Math.hypot(b.x-npcs.menino.x,b.y-npcs.menino.y)<18){ dead=true; }
    if(!dead){
      players.forEach(p=>{
        if(!p.alive||p.id===b.owner) return;
        if(Math.hypot(b.x-p.x,b.y-p.y)<p.r+4){
          let dmg=b.dmg;
          const owner=players[b.owner];
          if(owner&&owner.role==='TRAIDOR'){
            const angToVictim=Math.atan2(p.y-owner.y,p.x-owner.x);
            let diff=Math.abs(((angToVictim-p.angle+Math.PI*3)%(Math.PI*2))-Math.PI);
            if(diff>Math.PI/2){ dmg=Math.round(dmg*1.6); }
          }
          if(p.shield){ p.shield=false; feed(`🛡️ Escudo Mandu de ${p.name} bloqueou o tiro!`); }
          else { p.hp-=dmg; sfx.hit(); burst(p.x,p.y,'#ff0'); }
          dead=true;
          if(p.hp<=0 && p.alive){ kill(p, owner); }
        }
      });
    }
    if(dead) bullets.splice(idx,1);
  });

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

function burst(x,y){ for(let i=0;i<10;i++) particles.push({x,y,vx:(Math.random()-0.5)*200,vy:(Math.random()-0.5)*200,life:0.4}); }

function kill(victim, killer){
  victim.alive=false; victim.hp=0;
  if(killer&&killer!==victim){ killer.kills++; feed(`💀 ${killer.name} (${killer.role}) eliminou ${victim.name} (${victim.role})!`); }
  else feed(`💀 ${victim.name} caiu!`);
  burst(victim.x,victim.y);
  sfx.hit();
}

// ---------- RENDER 3D ----------
function syncMesh(pool, arr, make){
  while(pool.length < arr.length){ const m = make(); scene.add(m); pool.push(m); }
  while(pool.length > arr.length){ const m = pool.pop(); scene.remove(m); }
}

function render3d(){
  const t = performance.now()/1000;
  // players
  players.forEach(p=>{
    const g = playerMeshes[p.id]; if(!g) return;
    g.position.set(toWX(p.x), 0, toWZ(p.y));
    g.rotation.y = -p.angle + Math.PI/2;
    g.visible = p.alive || true;
    if(!p.alive){ g.rotation.x = Math.PI/2; g.position.y = 0.4; }
    else g.rotation.x = 0;
    g.userData.ballIcon.visible = p.hasBall && p.alive;
    g.userData.shield.visible = p.shield && p.alive;
    g.userData.ring.material.color.set(p.snitch>0 ? 0xff0000 : p.color);
    const s = p.dash>0 ? 1.25 : 1 + Math.sin(t*8+p.id)*0.03;
    g.scale.set(s,1,s);
    if(p.stun>0) g.position.y = Math.sin(t*20)*0.1;
  });
  // npcs
  if(npcMeshes.idosa){ npcMeshes.idosa.grp.position.set(toWX(npcs.idosa.x), 0, toWZ(npcs.idosa.y)); npcMeshes.idosa.grp.position.y = Math.sin(t*2)*0.08; }
  if(npcMeshes.menino){
    npcMeshes.menino.grp.position.set(toWX(npcs.menino.x), 0, toWZ(npcs.menino.y));
    const b = npcMeshes.menino.grp.userData.ball; if(b) b.position.y = 0.4 + Math.abs(Math.sin(t*4))*0.4;
  }
  if(npcMeshes.homem){
    npcMeshes.homem.grp.position.set(toWX(npcs.homem.x), 0, toWZ(npcs.homem.y));
    const mandu = npcMeshes.homem.grp.userData.mandu;
    if(mandu){ mandu.position.y = 1.5 + Math.sin(t*3)*0.08; mandu.rotation.y = Math.sin(t*2)*0.5; }
  }
  // balas
  syncMesh(bulletMeshes, bullets, ()=>{
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffe66d }));
    m.position.y = 1.4; return m;
  });
  bullets.forEach((b,i)=>{ bulletMeshes[i].position.set(toWX(b.x), 1.4, toWZ(b.y)); });
  // bolas
  syncMesh(ballMeshes, thrownBalls, ()=>{
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 14),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x00aaff, emissiveIntensity: 0.4 }));
    m.castShadow = true; return m;
  });
  thrownBalls.forEach((b,i)=>{ ballMeshes[i].position.set(toWX(b.x), 0.6+Math.abs(Math.sin(t*6+i))*0.3, toWZ(b.y)); ballMeshes[i].rotation.x += 0.1; });
  // pickups
  syncMesh(pickupMeshes, pickups, ()=> new THREE.Group());
  pickups.forEach((k,i)=>{
    let g = pickupMeshes[i];
    g.clear();
    let m;
    if(k.type==='sopa'){
      m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.35, 0.4, 12),
        new THREE.MeshStandardMaterial({ color: 0xff5533, emissive: 0xff3300, emissiveIntensity: 0.3 }));
      m.position.y = 0.5;
    } else {
      m = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 14),
        new THREE.MeshStandardMaterial({ color: 0xffffff }));
      m.position.y = 0.6;
    }
    g.add(m);
    g.position.set(toWX(k.x), Math.sin(t*3+i)*0.15, toWZ(k.y));
  });
  // partículas
  syncMesh(particleMeshes, particles, ()=>{
    return new THREE.Mesh(new THREE.BoxGeometry(0.25,0.25,0.25),
      new THREE.MeshBasicMaterial({ color: 0xffcc00 }));
  });
  particles.forEach((pt,i)=>{ particleMeshes[i].position.set(toWX(pt.x), 1.2, toWZ(pt.y)); });

  // linha revela traidor (Mandu)
  if(revealLine){ scene.remove(revealLine); revealLine.geometry.dispose(); revealLine = null; }
  const revealer = players.find(p=>p.alive&&p.revealTraitor>0);
  const traitor = players.find(q=>q.role==='TRAIDOR'&&q.alive);
  if(revealer && traitor){
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(toWX(revealer.x), 3, toWZ(revealer.y)),
      new THREE.Vector3(toWX(traitor.x), 3, toWZ(traitor.y))
    ]);
    revealLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffff00 }));
    scene.add(revealLine);
  }
  neonPink.intensity = 42 + Math.sin(t*2)*10;
  neonCyan.intensity = 42 + Math.cos(t*1.7)*10;
  if(typeof fireflies !== 'undefined' && fireflies){
    fireflies.position.y = Math.sin(t*0.8)*0.4;
    fireflies.rotation.y = t*0.02;
  }
  renderer.render(scene, camera);
}

function updateHud(){
  const box=$('playersHud'); box.innerHTML='';
  players.forEach(p=>{
    const d=document.createElement('div'); d.className='pcard'+(p.alive?'':' dead');
    d.style.borderLeftColor=p.color;
    const roleShow = p.alive ? '❓' : p.role;
    d.innerHTML=`<b style="color:${p.color}">${p.name}</b> ${p.isBot?'[BOT]':''}<br/>HP:${Math.max(0,Math.round(p.hp))} • Kills:${p.kills} • ${roleShow} ${p.hasBall?'⚽':''} ${p.shield?'🛡️🐱':''} ${p.soupInvert?'🥴':''}`;
    box.appendChild(d);
  });
}

function endGame(winner){
  running=false; sfx.win();
  overEl.classList.remove('hidden');
  $('winnerText').textContent = winner? `🏆 ${winner.name} VENCEU! (${winner.role})` : 'Empate — todos caíram!';
  $('revealRoles').innerHTML = players.map(p=>`<div style="border-left:6px solid ${p.color};padding:6px;margin:4px;background:#0f1430"> <b>${p.name}</b> era <b>${p.role==='TRAIDOR'?'🗡️ TRAIDOR':p.role==='XERIFE'?'⭐ XERIFE':'🎯 SOBREVIVENTE'}</b> • ${p.kills} kills ${p.alive?'• SOBREVIVEU':''}</div>`).join('')
    + '<p>👵 Dona Cida: “Ai, meus filhos, parem de brigar!”<br/>🧒 Cauã: “Minha bola!!”<br/>🧔 Jorge: “Mandu sempre soube quem era o traidor. Miau!” 🐱</p>';
}

// resize
window.addEventListener('resize', ()=>{
  const w = Math.min(960, container3d.clientWidth || 960);
  renderer.setSize(w, w*600/960);
});
