import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// Проверка авторизации при загрузке
const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const username = params.get('username') || 'Игрок';
const mode = params.get('mode'); // 'create' или 'join'
const roomCodeParam = params.get('code');

if (!token) { window.location.href = '/auth.html'; }

let scene, camera, renderer, controls;
let socket;
let roomId = null;
let mySymbol = null;
let players = [];
let board = Array(9).fill(null);
let cells = [];
let isLocked = false;
let playerMeshes = {};
let myPlayerId = null;
let myPlayerGroup = null;
let gameStarted = false;
let initialRotations = {};

const BEAUTIFUL_COLORS = ['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#98D8C8','#F7DC6F','#BB8FCE','#85C1E9','#F8C471','#82E0AA','#F1948A','#AED6F1','#F5CBA7','#D5F5E3','#E8DAEF','#FAD7A0','#A3E4D7','#FADBD8','#D4E6F1','#FF9FF3','#54A0FF','#5F27CD','#01A3A4'];

init();
animate();

function getRandomColor() { return BEAUTIFUL_COLORS[Math.floor(Math.random() * BEAUTIFUL_COLORS.length)]; }

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 3, 5);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  controls = new PointerLockControls(camera, document.body);
  
  document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'q' || key === 'й') { isLocked ? controls.unlock() : controls.lock(); }
  });
  controls.addEventListener('lock', () => { isLocked = true; });
  controls.addEventListener('unlock', () => { isLocked = false; });

  document.addEventListener('wheel', (event) => {
    if (!roomId || !isLocked) return;
    event.preventDefault();
    let fov = camera.fov - event.deltaY * 0.05;
    camera.fov = Math.max(30, Math.min(100, fov));
    camera.updateProjectionMatrix();
  }, { passive: false });

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(5, 10, 5);
  dirLight.castShadow = true;
  scene.add(dirLight);

  createBoard();

  const raycaster = new THREE.Raycaster();
  document.addEventListener('click', (event) => {
    if (!isLocked || !roomId || !gameStarted) return;
    if (players.length < 2) return;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(cells);
    if (intersects.length > 0 && board[intersects[0].object.userData.index] === null) {
      socket.emit('makeMove', { roomId, cellIndex: intersects[0].object.userData.index });
    }
  });

  // ИСПРАВЛЕНИЕ ДЛЯ RENDER.COM: Принудительный polling
  socket = io({
    transports: ['polling'],
    upgrade: false
  });

  socket.on('gameStart', (data) => {
    players = data.players;
    myPlayerId = socket.id;
    document.getElementById('currentPlayer').textContent = mySymbol;
    document.getElementById('currentTurn').textContent = data.currentPlayer;
    document.getElementById('waiting').classList.add('hidden');
    createPlayerMeshes();
    if (players.length === 2) { gameStarted = true; attachCameraToPlayer(); }
  });

  socket.on('moveMade', (data) => {
    board[data.cellIndex] = data.symbol;
    placeSymbol(data.cellIndex, data.symbol);
    document.getElementById('currentTurn').textContent = data.currentPlayer;
    const movePlayer = players.find(p => p.symbol === data.symbol);
    if (movePlayer && movePlayer.id !== myPlayerId) turnOpponentToCell(movePlayer.id, data.cellIndex);
  });

  socket.on('gameOver', (data) => {
    const msg = data.winner === 'draw' ? 'Ничья!' : `Победил ${data.winner}!`;
    setTimeout(() => { alert(msg); window.location.href = '/dashboard.html'; }, 500);
  });

  socket.on('playerLeft', () => { alert('Противник вышел'); window.location.href = '/dashboard.html'; });

  // Автоподключение к комнате
  setTimeout(() => {
    if (mode === 'create') {
      socket.emit('createRoom', { playerName: username, userId: localStorage.getItem('userId') }, (res) => {
        if (res.success) {
          roomId = res.roomId;
          mySymbol = 'X';
          document.getElementById('roomCode').textContent = roomId;
          document.getElementById('waitCode').textContent = roomId;
          players = [{ id: socket.id, name: username, userId: localStorage.getItem('userId'), symbol: 'X' }];
          createPlayerMeshes();
          attachCameraToPlayer();
          setTimeout(() => controls.lock(), 100);
        }
      });
    } else if (mode === 'join' && roomCodeParam) {
      socket.emit('joinRoom', { roomId: roomCodeParam, playerName: username, userId: localStorage.getItem('userId') }, (res) => {
        if (res.success) {
          roomId = roomCodeParam;
          mySymbol = 'O';
          document.getElementById('roomCode').textContent = roomId;
          document.getElementById('waitCode').textContent = roomId;
          document.getElementById('waiting').classList.add('hidden');
          setTimeout(() => controls.lock(), 100);
        } else {
          alert(res.error);
          window.location.href = '/dashboard.html';
        }
      });
    }
  }, 500);
}

function createBoard() {
  const platform = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0x2a2a4a }));
  platform.position.y = -0.1; platform.receiveShadow = true; scene.add(platform);
  const cellSize = 2, offset = -2;
  for (let i = 0; i < 9; i++) {
    const x = offset + (i % 3) * cellSize, z = offset + Math.floor(i / 3) * cellSize;
    const cell = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.1, 1.95), new THREE.MeshStandardMaterial({ color: 0x3a3a5a }));
    cell.position.set(x, 0.05, z); cell.receiveShadow = true; cell.userData = { index: i }; scene.add(cell); cells.push(cell);
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.95, 0.1, 1.95));
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x8a8aaa }));
    line.position.set(x, 0.06, z); scene.add(line);
  }
}

function createTextTexture(text, bgColor) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bgColor; ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 10; ctx.strokeRect(0, 0, 512, 512);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 120px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

function createPlayerMeshes() {
  Object.values(playerMeshes).forEach(g => scene.remove(g));
  playerMeshes = {}; initialRotations = {};
  players.forEach((player, index) => {
    const group = new THREE.Group();
    const geometry = player.shape === 'sphere' ? new THREE.SphereGeometry(0.6, 32, 32) : new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: player.color || getRandomColor(), emissive: player.color || getRandomColor(), emissiveIntensity: 0.2 });
    const nameTex = createTextTexture(player.name.substring(0, 2).toUpperCase(), player.color || '#555');
    const nameMat = new THREE.MeshBasicMaterial({ map: nameTex });
    const materials = player.shape === 'cube' ? [nameMat,nameMat,nameMat,nameMat,nameMat,nameMat] : material;
    const mesh = new THREE.Mesh(geometry, player.shape === 'cube' ? materials : material);
    mesh.castShadow = true; group.add(mesh);

    const nc = document.createElement('canvas'); nc.width = 512; nc.height = 128;
    const ctx = nc.getContext('2d'); ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0,0,512,128);
    ctx.fillStyle = '#0f0'; ctx.font = 'bold 60px Arial'; ctx.textAlign = 'center';
    ctx.fillText(player.name, 256, 64);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(nc) }));
    sprite.position.set(0, 1.5, 0); sprite.scale.set(3, 0.75, 1); group.add(sprite);

    group.position.set(index === 0 ? -4 : 4, 3.5, 0);
    group.lookAt(new THREE.Vector3(0, 0, 0));
    scene.add(group); playerMeshes[player.id] = group;
    initialRotations[player.id] = { y: group.rotation.y, x: group.rotation.x };
    if (player.id === myPlayerId) myPlayerGroup = group;
  });
}

function attachCameraToPlayer() {
  if (myPlayerId && playerMeshes[myPlayerId]) {
    const pos = playerMeshes[myPlayerId].position;
    camera.position.copy(pos); camera.lookAt(0, 0, 0);
  }
}

function turnOpponentToCell(id, cellIdx) {
  const g = playerMeshes[id], c = cells[cellIdx];
  if (!g || !c) return;
  const dir = new THREE.Vector3().subVectors(c.position, g.position);
  const targetY = Math.atan2(dir.x, dir.z);
  const hDist = Math.sqrt(dir.x**2 + dir.z**2);
  const targetX = -Math.atan2(g.position.y - c.position.y, hDist);
  const sY = g.rotation.y, sX = g.rotation.x, start = Date.now();
  function anim() {
    const t = Math.min((Date.now()-start)/300, 1), ease = 1-(1-t)**3;
    g.rotation.y = sY + (targetY-sY)*ease; g.rotation.x = sX + (targetX-sX)*ease;
    if (t<1) requestAnimationFrame(anim); else setTimeout(()=>returnToInitial(id), 1000);
  } anim();
}

function returnToInitial(id) {
  const g = playerMeshes[id]; if (!g || id === myPlayerId) return;
  const ini = initialRotations[id]; if (!ini) return;
  const sY=g.rotation.y, sX=g.rotation.x, start=Date.now();
  function anim() {
    const t=Math.min((Date.now()-start)/500,1), ease=1-(1-t)**3;
    g.rotation.y=sY+(ini.y-sY)*ease; g.rotation.x=sX+(ini.x-sX)*ease;
    if(t<1) requestAnimationFrame(anim);
  } anim();
}

function placeSymbol(index, symbol) {
  const cell = cells[index], pos = cell.position.clone(); pos.y += 0.3;
  const player = players.find(p => p.symbol === symbol);
  const color = player?.color || (symbol==='X'?0xff0000:0x0000ff);
  if (symbol === 'X') {
    const geo = new THREE.BoxGeometry(1.2, 0.15, 0.15);
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 });
    const b1 = new THREE.Mesh(geo, mat); b1.position.copy(pos); b1.rotation.y = Math.PI/4; scene.add(b1);
    const b2 = new THREE.Mesh(geo, mat); b2.position.copy(pos); b2.rotation.y = -Math.PI/4; scene.add(b2);
  } else {
    const geo = new THREE.TorusGeometry(0.5, 0.1, 16, 32);
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 });
    const circle = new THREE.Mesh(geo, mat); circle.position.copy(pos); circle.rotation.x = Math.PI/2; scene.add(circle);
  }
}

function animate() {
  requestAnimationFrame(animate);
  if (myPlayerGroup && controls.isLocked) {
    myPlayerGroup.rotation.y = camera.rotation.y;
    myPlayerGroup.rotation.x = camera.rotation.x * 0.3;
  }
  if (myPlayerId && playerMeshes[myPlayerId] && controls.isLocked) {
    const p = playerMeshes[myPlayerId].position;
    camera.position.set(p.x, p.y, p.z);
  }
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
