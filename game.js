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

// ── Bot difficulty profiles ───────────────────────────────
// speed    : max px/frame the bot paddle moves
// reaction : how far ahead (px) the bot starts tracking the ball
// error    : random offset added to target (bigger = sloppier)
// freq     : how often (frames) the bot recalculates its target
const BOT_PROFILES = {
  easy:   { speed: 2.2, reaction: 150, error: 55, freq: 12 },
  hard: { speed: 3, reaction: 230, error: 35, freq:  6 },
  impossible:   { speed: 5.2, reaction: W,   error:  6, freq:  2 }
};

// ── State ─────────────────────────────────────────────────
const PAD_W = 10, BALL_SIZE = 10, PAD_SPEED = 5;

let leftY, rightY, ballX, ballY, ballDX, ballDY;
let leftScore = 0, rightScore = 0;
let gameState = 'menu'; // 'menu' | 'playing' | 'paused' | 'won'
let trailPoints = [];
const keys = {};

// ── Bot state ─────────────────────────────────────────────
let botActive = false;
let botDifficulty = 'hard';
let botTargetY = H / 2;   // where bot wants the centre of its paddle
let botTickCount = 0;
let lastDifficulty = 'hard'; // remembered for Play Again

// ── DOM refs ─────────────────────────────────────────────
const overlay      = document.getElementById('overlay');
const mainMenu     = document.getElementById('main-menu');
const botMenu      = document.getElementById('bot-menu');
const pauseMenu    = document.getElementById('pause-menu');
const settingsMenu = document.getElementById('settings-menu');
const winnerMenu   = document.getElementById('winner-menu');
const winnerTitle  = document.getElementById('winner-title');
const winnerScore  = document.getElementById('winner-score');

let settingsReturnTo = 'main';

function showMenu(which) {
  [mainMenu, botMenu, pauseMenu, settingsMenu, winnerMenu].forEach(m => m.classList.add('hidden'));
  which.classList.remove('hidden');
  overlay.classList.add('active');
}

function hideOverlay() { overlay.classList.remove('active'); }

function openSettings(from) {
  settingsReturnTo = from;
  showMenu(settingsMenu);
}

// ── Bot AI update ─────────────────────────────────────────
function updateBot() {
  const profile = BOT_PROFILES[botDifficulty];
  const padH    = getPadH();

  botTickCount++;
  // Recalculate target position periodically
  if (botTickCount % profile.freq === 0) {
    if (ballDX > 0 && ballX > W - profile.reaction) {
      // Ball heading toward bot — predict landing Y
      const predicted = predictBallY();
      // Add a deliberate error to make it beatable
      const err = (Math.random() - 0.5) * 2 * profile.error;
      botTargetY = predicted + err - padH / 2;
    } else {
      // Ball moving away — drift back toward centre
      botTargetY = H / 2 - padH / 2;
    }
    botTargetY = Math.max(0, Math.min(H - padH, botTargetY));
  }

  // Move paddle toward target
  const centre = rightY + padH / 2;
  const target = botTargetY + padH / 2;
  const diff   = target - centre;
  const move   = Math.min(Math.abs(diff), profile.speed) * Math.sign(diff);
  rightY = Math.max(0, Math.min(H - padH, rightY + move));
}

// Simulate ball bounces to predict where it'll reach the right wall
function predictBallY() {
  let px = ballX, py = ballY, pdx = ballDX, pdy = ballDY;
  let steps = 0;
  while (px < W - 20 - PAD_W && steps < 300) {
    px += pdx; py += pdy; steps++;
    if (py <= 0)             { py = 0;             pdy *= -1; }
    if (py + BALL_SIZE >= H) { py = H - BALL_SIZE; pdy *= -1; }
  }
  return py;
}

// ── Button handlers ───────────────────────────────────────
document.getElementById('btn-vs-bot').addEventListener('click', () => showMenu(botMenu));

document.getElementById('btn-bot-easy').addEventListener('click', () => {
  botDifficulty = 'easy'; lastDifficulty = 'easy';
  startGame(true);
});
document.getElementById('btn-bot-hard').addEventListener('click', () => {
  botDifficulty = 'hard'; lastDifficulty = 'hard';
  startGame(true);
});
document.getElementById('btn-bot-impossible').addEventListener('click', () => {
  botDifficulty = 'impossible'; lastDifficulty = 'impossible';
  startGame(true);
});

document.getElementById('btn-bot-back').addEventListener('click', () => showMenu(mainMenu));

document.getElementById('btn-start').addEventListener('click', () => startGame(false));

document.getElementById('btn-settings-main').addEventListener('click', () => openSettings('main'));

document.getElementById('btn-resume').addEventListener('click', () => {
  gameState = 'playing';
  hideOverlay();
});

document.getElementById('btn-restart').addEventListener('click', () => startGame(botActive));

document.getElementById('btn-settings-pause').addEventListener('click', () => openSettings('pause'));

document.getElementById('btn-main-menu').addEventListener('click', () => {
  gameState = 'menu';
  showMenu(mainMenu);
});

document.getElementById('btn-settings-back').addEventListener('click', () => {
  showMenu(settingsReturnTo === 'pause' ? pauseMenu : mainMenu);
});

document.getElementById('btn-play-again').addEventListener('click', () => {
  if (botActive) { botDifficulty = lastDifficulty; }
  startGame(botActive);
});

document.getElementById('btn-winner-main').addEventListener('click', () => {
  gameState = 'menu';
  showMenu(mainMenu);
});

document.querySelectorAll('.opt-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const setting = btn.dataset.setting;
    const value   = btn.dataset.value;
    cfg[setting]  = value;
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
function startGame(withBot) {
  botActive = withBot;
  botTickCount = 0;
  const padH = getPadH();
  leftY  = H / 2 - padH / 2;
  rightY = H / 2 - padH / 2;
  botTargetY = rightY;
  leftScore = 0;
  rightScore = 0;
  trailPoints = [];
  resetBall(Math.random() < 0.5 ? 1 : -1);
  gameState = 'playing';
  hideOverlay();
}

function resetBall(dir) {
  ballX = W / 2; ballY = H / 2;
  const spd = SETTINGS.ballSpeed[cfg.ballSpeed];
  ballDX = spd * dir;
  ballDY = (spd * 0.75) * (Math.random() < 0.5 ? 1 : -1);
  trailPoints = [];
}

function getPadH() { return SETTINGS.paddleSize[cfg.paddleSize]; }
function getWin()  { return SETTINGS.winScore[cfg.winScore]; }

function checkWin() {
  const win = getWin();
  if (win === 0) return;
  if (leftScore >= win || rightScore >= win) {
    gameState = 'won';
    if (botActive) {
      winnerTitle.textContent = leftScore >= win ? 'YOU WIN!' : 'BOT WINS!';
    } else {
      winnerTitle.textContent = leftScore >= win ? 'LEFT WINS!' : 'RIGHT WINS!';
    }
    winnerScore.textContent = `${leftScore} — ${rightScore}`;
    showMenu(winnerMenu);
  }
}

// ── Update ────────────────────────────────────────────────
function update() {
  if (gameState !== 'playing') return;

  const padH = getPadH();

  // Player always controls left paddle with W/S
  if (keys['w'] || keys['W']) leftY = Math.max(0, leftY - PAD_SPEED);
  if (keys['s'] || keys['S']) leftY = Math.min(H - padH, leftY + PAD_SPEED);

  if (botActive) {
    updateBot();
  } else {
    // Local 2-player: right paddle uses arrow keys
    if (keys['ArrowUp'])   rightY = Math.max(0, rightY - PAD_SPEED);
    if (keys['ArrowDown']) rightY = Math.min(H - padH, rightY + PAD_SPEED);
  }

  // ── Ball physics ─────────────────────────────────────────
  ballX += ballDX;
  ballY += ballDY;

  if (SETTINGS.trail[cfg.trail]) {
    trailPoints.push({ x: ballX, y: ballY });
    if (trailPoints.length > 12) trailPoints.shift();
  } else {
    trailPoints = [];
  }

  if (ballY <= 0)               { ballY = 0;             ballDY *= -1; }
  if (ballY + BALL_SIZE >= H)   { ballY = H - BALL_SIZE; ballDY *= -1; }

  // Left paddle
  if (ballX <= 20 + PAD_W && ballY + BALL_SIZE >= leftY && ballY <= leftY + padH && ballDX < 0) {
    ballDX *= -1;
    ballX = 20 + PAD_W;
    const rel = (ballY + BALL_SIZE / 2 - leftY) / padH;
    ballDY = (rel - 0.5) * 2 * Math.abs(ballDX) * 1.2;
  }

  // Right paddle
  if (ballX + BALL_SIZE >= W - 20 - PAD_W && ballY + BALL_SIZE >= rightY && ballY <= rightY + padH && ballDX > 0) {
    ballDX *= -1;
    ballX = W - 20 - PAD_W - BALL_SIZE;
    const rel = (ballY + BALL_SIZE / 2 - rightY) / padH;
    ballDY = (rel - 0.5) * 2 * Math.abs(ballDX) * 1.2;
  }

  if (ballX < 0)  { rightScore++; checkWin(); resetBall(1);  }
  if (ballX > W)  { leftScore++;  checkWin(); resetBall(-1); }
}

// ── Draw ──────────────────────────────────────────────────
function draw() {
  const padH = getPadH();

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Centre dashes
  ctx.fillStyle = '#1a1a1a';
  for (let y = 0; y < H; y += 20) ctx.fillRect(W / 2 - 1, y, 2, 10);

  // Trail
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
  ctx.fillRect(20, leftY, PAD_W, padH);
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

  // Bot mode labels
  if (botActive) {
    ctx.font = '11px Share Tech Mono, monospace';
    ctx.fillStyle = '#2a2a2a';
    ctx.textAlign = 'left';
    ctx.fillText('YOU', 28, H - 10);
    ctx.textAlign = 'right';
    const label = botDifficulty.toUpperCase() + ' BOT';
    ctx.fillText(label, W - 28, H - 10);
  }

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

showMenu(mainMenu);
loop();
