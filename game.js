const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

// ── Settings ─────────────────────────────────────────────
const SETTINGS = {
  ballSpeed:  { slow: 3,  normal: 4,  fast: 6  },
  paddleSize: { small: 50, normal: 80, large: 110 },
  winScore:   { '5': 5, '10': 10, '20': 20, '0': 0 },
  trail:      { on: true, off: false }
};

let cfg = {
  ballSpeed:  'normal',
  paddleSize: 'normal',
  winScore:   '10',
  trail:      'on'
};

// ── State ─────────────────────────────────────────────────
const PAD_W = 10, BALL_SIZE = 10, PAD_SPEED = 5;

let leftY, rightY, ballX, ballY, ballDX, ballDY;
let leftScore = 0, rightScore = 0;
let gameState = 'menu'; // 'menu' | 'playing' | 'paused' | 'won'
let trailPoints = [];
const keys = {};

// ── Overlay & Menu Logic ──────────────────────────────────
const overlay    = document.getElementById('overlay');
const mainMenu   = document.getElementById('main-menu');
const pauseMenu  = document.getElementById('pause-menu');
const settingsMenu = document.getElementById('settings-menu');
const winnerMenu = document.getElementById('winner-menu');
const winnerTitle = document.getElementById('winner-title');
const winnerScore = document.getElementById('winner-score');

let settingsReturnTo = 'main'; // 'main' | 'pause'

function showMenu(which) {
  [mainMenu, pauseMenu, settingsMenu, winnerMenu].forEach(m => m.classList.add('hidden'));
  which.classList.remove('hidden');
  overlay.classList.add('active');
}

function hideOverlay() {
  overlay.classList.remove('active');
}

function openSettings(from) {
  settingsReturnTo = from;
  showMenu(settingsMenu);
}

document.getElementById('btn-start').addEventListener('click', () => {
  startGame();
});

document.getElementById('btn-settings-main').addEventListener('click', () => openSettings('main'));

document.getElementById('btn-resume').addEventListener('click', () => {
  gameState = 'playing';
  hideOverlay();
});

document.getElementById('btn-restart').addEventListener('click', () => {
  startGame();
});

document.getElementById('btn-settings-pause').addEventListener('click', () => openSettings('pause'));

document.getElementById('btn-main-menu').addEventListener('click', () => {
  gameState = 'menu';
  showMenu(mainMenu);
});

document.getElementById('btn-settings-back').addEventListener('click', () => {
  if (settingsReturnTo === 'pause') {
    showMenu(pauseMenu);
  } else {
    showMenu(mainMenu);
  }
});

document.getElementById('btn-play-again').addEventListener('click', () => {
  startGame();
});

document.getElementById('btn-winner-main').addEventListener('click', () => {
  gameState = 'menu';
  showMenu(mainMenu);
});

// Settings option buttons
document.querySelectorAll('.opt-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const setting = btn.dataset.setting;
    const value   = btn.dataset.value;
    cfg[setting]  = value;
    // Update active state within the group
    btn.closest('.btn-group').querySelectorAll('.opt-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// ── Keyboard ──────────────────────────────────────────────
document.addEventListener('keydown', e => {
  keys[e.key] = true;

  if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && gameState === 'playing') {
    gameState = 'paused';
    showMenu(pauseMenu);
    return;
  }

  if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && gameState === 'paused') {
    gameState = 'playing';
    hideOverlay();
    return;
  }
});

document.addEventListener('keyup', e => { keys[e.key] = false; });

// ── Game Functions ────────────────────────────────────────
function startGame() {
  const padH = SETTINGS.paddleSize[cfg.paddleSize];
  leftY  = H / 2 - padH / 2;
  rightY = H / 2 - padH / 2;
  leftScore = 0;
  rightScore = 0;
  trailPoints = [];
  resetBall(Math.random() < 0.5 ? 1 : -1);
  gameState = 'playing';
  hideOverlay();
}

function resetBall(dir) {
  ballX = W / 2;
  ballY = H / 2;
  const spd = SETTINGS.ballSpeed[cfg.ballSpeed];
  ballDX = spd * dir;
  ballDY = (spd * 0.75) * (Math.random() < 0.5 ? 1 : -1);
  trailPoints = [];
}

function getPadH() { return SETTINGS.paddleSize[cfg.paddleSize]; }
function getWin()   { return SETTINGS.winScore[cfg.winScore]; }

function update() {
  if (gameState !== 'playing') return;

  const padH = getPadH();

  if (keys['w'] || keys['W']) leftY  = Math.max(0, leftY  - PAD_SPEED);
  if (keys['s'] || keys['S']) leftY  = Math.min(H - padH, leftY  + PAD_SPEED);
  if (keys['ArrowUp'])   rightY = Math.max(0, rightY - PAD_SPEED);
  if (keys['ArrowDown']) rightY = Math.min(H - padH, rightY + PAD_SPEED);

  ballX += ballDX;
  ballY += ballDY;

  // Trail
  if (SETTINGS.trail[cfg.trail]) {
    trailPoints.push({ x: ballX, y: ballY });
    if (trailPoints.length > 12) trailPoints.shift();
  } else {
    trailPoints = [];
  }

  // Wall bounce
  if (ballY <= 0)               { ballY = 0;              ballDY *= -1; }
  if (ballY + BALL_SIZE >= H)   { ballY = H - BALL_SIZE;  ballDY *= -1; }

  // Left paddle hit
  if (ballX <= 20 + PAD_W && ballY + BALL_SIZE >= leftY && ballY <= leftY + padH && ballDX < 0) {
    ballDX *= -1;
    ballX = 20 + PAD_W;
    // Slight angle based on where it hits the paddle
    const rel = (ballY + BALL_SIZE / 2 - leftY) / padH; // 0–1
    ballDY = (rel - 0.5) * 2 * Math.abs(ballDX) * 1.2;
  }

  // Right paddle hit
  if (ballX + BALL_SIZE >= W - 20 - PAD_W && ballY + BALL_SIZE >= rightY && ballY <= rightY + padH && ballDX > 0) {
    ballDX *= -1;
    ballX = W - 20 - PAD_W - BALL_SIZE;
    const rel = (ballY + BALL_SIZE / 2 - rightY) / padH;
    ballDY = (rel - 0.5) * 2 * Math.abs(ballDX) * 1.2;
  }

  // Scoring
  if (ballX < 0)  { rightScore++; checkWin(); resetBall(1);  }
  if (ballX > W)  { leftScore++;  checkWin(); resetBall(-1); }
}

function checkWin() {
  const win = getWin();
  if (win === 0) return; // infinite mode
  if (leftScore >= win || rightScore >= win) {
    gameState = 'won';
    const who = leftScore >= win ? 'LEFT' : 'RIGHT';
    winnerTitle.textContent = `${who} WINS!`;
    winnerScore.textContent = `${leftScore} — ${rightScore}`;
    showMenu(winnerMenu);
  }
}

// ── Drawing ───────────────────────────────────────────────
function draw() {
  const padH = getPadH();

  // Background
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Center dashes
  ctx.fillStyle = '#1a1a1a';
  for (let y = 0; y < H; y += 20) {
    ctx.fillRect(W / 2 - 1, y, 2, 10);
  }

  // Ball trail
  if (SETTINGS.trail[cfg.trail]) {
    trailPoints.forEach((pt, i) => {
      const alpha = (i / trailPoints.length) * 0.35;
      const size  = BALL_SIZE * (i / trailPoints.length);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(pt.x + (BALL_SIZE - size) / 2, pt.y + (BALL_SIZE - size) / 2, size, size);
    });
  }

  // Paddles
  ctx.fillStyle = '#fff';
  ctx.fillRect(20, leftY,  PAD_W, padH);
  ctx.fillRect(W - 20 - PAD_W, rightY, PAD_W, padH);

  // Ball
  ctx.fillStyle = '#fff';
  ctx.fillRect(ballX, ballY, BALL_SIZE, BALL_SIZE);

  // Scores
  ctx.font = '700 40px Orbitron, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText(leftScore,  W / 4,     58);
  ctx.fillText(rightScore, 3 * W / 4, 58);

  // Paused dim effect on canvas
  if (gameState === 'paused') {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, W, H);
  }
}

// ── Loop ─────────────────────────────────────────────────
function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// Start with the main menu shown
showMenu(mainMenu);
loop();