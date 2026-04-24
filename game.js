const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

// ── Settings ─────────────────────────────────────────────
const SETTINGS = {
  ballSpeed:  { slow: 3,  normal: 4,  fast: 6  },
  paddleSize: { small: 50, normal: 80, large: 110 },
  winScore:   { '5': 5, '10': 10, '20': 20, '0': 0 },
  trail:      { on: true, off: false },
  frameRate:  { '30': 30, '60': 60, '120': 120, unlimited: 0 }
};

let cfg = {
  ballSpeed:  'normal',
  paddleSize: 'normal',
  winScore:   '10',
  trail:      'on',
  frameRate:  '60'
};

// ── Keybinds ──────────────────────────────────────────────
const keybinds = {
  p1Up:      'w',
  p1Down:    's',
  p2Up:      'ArrowUp',
  p2Down:    'ArrowDown',
  p1Shop:    'e',
  p1Powerup: 'q',
  p2Shop:    '/',
  p2Powerup: '.'
};

// Sync keybind inputs → keybinds object (called once DOM is ready)
function initKeybindInputs() {
  document.querySelectorAll('.keybind-input').forEach(input => {
    const binding = input.dataset.binding;
    input.value = keybinds[binding];
    input.addEventListener('keydown', e => {
      e.preventDefault();
      const key = e.key === ' ' ? 'Space' : e.key;
      keybinds[binding] = key;
      input.value = key;
    });
  });
}
initKeybindInputs();

// ── Bot difficulty profiles ───────────────────────────────
const BOT_PROFILES = {
  easy:       { speed: 2.2, reaction: 150, error: 55, freq: 12 },
  hard:       { speed: 3,   reaction: 230, error: 35, freq:  6 },
  impossible: { speed: 5.2, reaction: 230,   error:  6, freq:  2 }
};

const SHOWER_REMINDER_THRESHOLD = 15 * 60 * 60; // 15 minutes at 60 FPS
const SHOWER_REMINDER_DURATION   = 8 * 60;      // show for 8 seconds

function getTargetFPS() {
  return SETTINGS.frameRate[cfg.frameRate] ?? 60;
}

// ── State ─────────────────────────────────────────────────
const PAD_W = 10, BALL_SIZE = 10, PAD_SPEED = 5;

let leftY, rightY, ballX, ballY, ballDX, ballDY;
let leftScore = 0, rightScore = 0;
let gameState = 'menu'; // 'menu' | 'playing' | 'paused' | 'won'
let trailPoints = [];
const keys = {};

let playTimeFrames = 0;
let showerReminderActive = false;
let showerReminderFramesLeft = 0;
let showerReminderTriggered = false;
let frameAccumulatorMs = 0;
let lastLoopTime = null;

// ── Bot state ─────────────────────────────────────────────
let botActive = false;
let botDifficulty = 'hard';
let botTargetY = H / 2;
let botTickCount = 0;
let lastDifficulty = 'hard';

// ── Shop / Economy state ──────────────────────────────────
let leftCoins  = 0;
let rightCoins = 0;
let shopOpen   = null; // null | 'left' | 'right'

// Active effects: each entry is { type, framesLeft }
let activeEffects = [];

// Inventory: one slot per player, holds a powerup key or null
let leftItem  = null;
let rightItem = null;

// Ghost-ball: ball passes through opponent's paddle once
let ghostBall = false;

// Curve-shot charges (each is { side: 'left'|'right' })
let curvePending = { left: false, right: false };

// ── Powerup definitions ───────────────────────────────────
const POWERUPS = [
  {
    key:   'slowball',
    label: 'Slow Ball',
    cost:  5,
    desc:  'Ball slows for 5 sec',
    color: '#4af',
    icon:  '❄'
  },
  {
    key:   'bigpaddle',
    label: 'Big Paddle',
    cost:  7,
    desc:  'Your paddle grows (8s)',
    color: '#4f4',
    icon:  '⬆'
  },
  {
    key:   'shrink',
    label: 'Shrink Foe',
    cost:  10,
    desc:  "Shrinks opponent (6s)",
    color: '#f84',
    icon:  '⬇'
  },
  {
    key:   'ghost',
    label: 'Ghost Ball',
    cost:  12,
    desc:  'Ball ignores foe paddle once',
    color: '#c8f',
    icon:  '◎'
  },
  {
    key:   'curve',
    label: 'Curve Shot',
    cost:  8,
    desc:  'Next hit curves wildly',
    color: '#fa4',
    icon:  '↻'
  }
];

// ── Effect helpers ────────────────────────────────────────
const FPS = 60;
function hasEffect(type) { return activeEffects.some(e => e.type === type); }

function applyEffect(type) {
  const durations = {
    slowball_left:  5 * FPS,
    slowball_right: 5 * FPS,
    bigpaddle_left: 8 * FPS,
    bigpaddle_right:8 * FPS,
    shrink_left:    6 * FPS,
    shrink_right:   6 * FPS
  };
  // Remove existing same effect first
  activeEffects = activeEffects.filter(e => e.type !== type);
  if (durations[type] !== undefined) {
    activeEffects.push({ type, framesLeft: durations[type] });
  }
}

function tickEffects(frameScale) {
  activeEffects = activeEffects.filter(e => {
    e.framesLeft -= frameScale;
    return e.framesLeft > 0;
  });
}

// Effective paddle height considering effects
function getLeftPadH() {
  const base = SETTINGS.paddleSize[cfg.paddleSize];
  if (hasEffect('bigpaddle_left'))  return Math.min(base * 1.8, H * 0.6);
  if (hasEffect('shrink_left'))     return Math.max(base * 0.45, 20);
  return base;
}
function getRightPadH() {
  const base = SETTINGS.paddleSize[cfg.paddleSize];
  if (hasEffect('bigpaddle_right')) return Math.min(base * 1.8, H * 0.6);
  if (hasEffect('shrink_right'))    return Math.max(base * 0.45, 20);
  return base;
}
function getPadH() { return SETTINGS.paddleSize[cfg.paddleSize]; } // base only

// ── Activate item ─────────────────────────────────────────
function activateItem(side) {
  const item = side === 'left' ? leftItem : rightItem;
  if (!item) return;

  const opponent = side === 'left' ? 'right' : 'left';

  switch (item) {
    case 'slowball':
      // Halve ball speed
      applyEffect('slowball_' + side);
      ballDX *= 0.5;
      ballDY *= 0.5;
      break;
    case 'bigpaddle':
      applyEffect('bigpaddle_' + side);
      break;
    case 'shrink':
      applyEffect('shrink_' + opponent);
      break;
    case 'ghost':
      ghostBall = true;
      break;
    case 'curve':
      curvePending[side] = true;
      break;
  }

  if (side === 'left') leftItem  = null;
  else                 rightItem = null;
}

// ── Shop logic ────────────────────────────────────────────
function openShop(side) {
  if (gameState !== 'playing') return;
  gameState = 'shop';
  shopOpen = side;
}

function closeShop() {
  gameState = 'playing';
  shopOpen = null;
}

function buyPowerup(side, powerupKey) {
  const pu = POWERUPS.find(p => p.key === powerupKey);
  if (!pu) return;

  const coins     = side === 'left' ? leftCoins  : rightCoins;
  const hasItem   = side === 'left' ? leftItem   : rightItem;

  if (coins < pu.cost) return;   // can't afford
  if (hasItem) return;           // already holding one

  if (side === 'left') {
    leftCoins -= pu.cost;
    leftItem   = powerupKey;
  } else {
    rightCoins -= pu.cost;
    rightItem   = powerupKey;
  }
  closeShop();
}

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
function updateBot(frameScale) {
  const profile = BOT_PROFILES[botDifficulty];
  const padH    = getRightPadH();

  botTickCount += frameScale;
  while (botTickCount >= profile.freq) {
    botTickCount -= profile.freq;
    if (ballDX > 0 && ballX > W - profile.reaction) {
      const predicted = predictBallY();
      const err = (Math.random() - 0.5) * 2 * profile.error;
      botTargetY = predicted + err - padH / 2;
    } else {
      botTargetY = H / 2 - padH / 2;
    }
    botTargetY = Math.max(0, Math.min(H - padH, botTargetY));
  }

  const centre = rightY + padH / 2;
  const target = botTargetY + padH / 2;
  const diff   = target - centre;
  const move   = Math.min(Math.abs(diff), profile.speed) * Math.sign(diff);
  rightY = Math.max(0, Math.min(H - padH, rightY + move));
}

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

// Case-insensitive key match
function matchKey(pressed, bound) {
  return pressed === bound || pressed.toLowerCase() === bound.toLowerCase();
}

// ── Keyboard ──────────────────────────────────────────────
document.addEventListener('keydown', e => {
  let key = e.key.toLowerCase();
  keys[key] = true;

  // Pause / unpause
  if ((key === 'p' || key === 'escape') && gameState === 'playing') {
    gameState = 'paused';
    showMenu(pauseMenu);
    return;
  }
  if ((key === 'p' || key === 'escape') && gameState === 'paused') {
    gameState = 'playing';
    hideOverlay();
    return;
  }

  // Close shop with Escape
  if (key === 'escape' && gameState === 'shop') {
    closeShop();
    return;
  }

  // Open shops
  if (matchKey(e.key, keybinds.p1Shop) && gameState === 'playing') {
    openShop('left');
    return;
  }
  if (matchKey(e.key, keybinds.p2Shop) && gameState === 'playing') {
    openShop('right');
    return;
  }

  // Activate items
  if (matchKey(e.key, keybinds.p1Powerup) && gameState === 'playing') {
    activateItem('left');
    return;
  }
  if (matchKey(e.key, keybinds.p2Powerup) && gameState === 'playing') {
    activateItem('right');
    return;
  }

  // Shop navigation: number keys 1–5 to buy
  if (gameState === 'shop' && shopOpen) {
    const idx = parseInt(e.key) - 1;
    if (idx >= 0 && idx < POWERUPS.length) {
      buyPowerup(shopOpen, POWERUPS[idx].key);
    }
    return;
  }
});
document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// ── Game Functions ────────────────────────────────────────
function startGame(withBot) {
  botActive  = withBot;
  botTickCount = 0;
  frameAccumulatorMs = 0;
  lastLoopTime = null;
  const padH = getPadH();
  leftY  = H / 2 - padH / 2;
  rightY = H / 2 - padH / 2;
  botTargetY = rightY;
  leftScore  = 0; rightScore = 0;
  leftCoins  = 0; rightCoins = 0;
  leftItem   = null; rightItem = null;
  activeEffects = [];
  ghostBall  = false;
  curvePending = { left: false, right: false };
  trailPoints = [];
  resetBall(Math.random() < 0.5 ? 1 : -1);
  gameState = 'playing';
  playTimeFrames = 0;
  showerReminderActive = false;
  showerReminderFramesLeft = 0;
  showerReminderTriggered = false;
  hideOverlay();
}

function resetBall(dir) {
  ballX = W / 2; ballY = H / 2;
  const spd = SETTINGS.ballSpeed[cfg.ballSpeed];
  ballDX = spd * dir;
  ballDY = (spd * 0.75) * (Math.random() < 0.5 ? 1 : -1);
  trailPoints = [];
  ghostBall = false;
}

function getWin() { return SETTINGS.winScore[cfg.winScore]; }

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
function update(frameScale) {
  if (gameState !== 'playing') return;

  playTimeFrames += frameScale;
  if (!showerReminderTriggered && playTimeFrames >= SHOWER_REMINDER_THRESHOLD) {
    showerReminderTriggered = true;
    showerReminderActive = true;
    showerReminderFramesLeft = SHOWER_REMINDER_DURATION;
  }
  if (showerReminderActive) {
    showerReminderFramesLeft -= frameScale;
    if (showerReminderFramesLeft <= 0) {
      showerReminderActive = false;
    }
  }

  tickEffects(frameScale);

  const leftPadH  = getLeftPadH();
  const rightPadH = getRightPadH();

  // Left player
  if (keys[keybinds.p1Up]   || keys[keybinds.p1Up.toLowerCase()]   || keys[keybinds.p1Up.toUpperCase()])   leftY = Math.max(0, leftY - PAD_SPEED);
  if (keys[keybinds.p1Down] || keys[keybinds.p1Down.toLowerCase()] || keys[keybinds.p1Down.toUpperCase()]) leftY = Math.min(H - leftPadH, leftY + PAD_SPEED);

  if (botActive) {
    updateBot(frameScale);
  } else {
    if (keys[keybinds.p2Up]   || keys[keybinds.p2Up.toLowerCase()]   || keys[keybinds.p2Up.toUpperCase()])   rightY = Math.max(0, rightY - PAD_SPEED);
    if (keys[keybinds.p2Down] || keys[keybinds.p2Down.toLowerCase()] || keys[keybinds.p2Down.toUpperCase()]) rightY = Math.min(H - rightPadH, rightY + PAD_SPEED);
  }

  // ── Ball physics ─────────────────────────────────────────
  ballX += ballDX * frameScale;
  ballY += ballDY * frameScale;

  if (SETTINGS.trail[cfg.trail]) {
    trailPoints.push({ x: ballX, y: ballY });
    if (trailPoints.length > 12) trailPoints.shift();
  } else {
    trailPoints = [];
  }

  if (ballY <= 0)               { ballY = 0;             ballDY *= -1; }
  if (ballY + BALL_SIZE >= H)   { ballY = H - BALL_SIZE; ballDY *= -1; }

  // Left paddle collision
  if (ballX <= 20 + PAD_W && ballY + BALL_SIZE >= leftY && ballY <= leftY + leftPadH && ballDX < 0) {
    if (ghostBall) {
      // ghost: let it pass — don't bounce
    } else {
      ballDX *= -1;
      ballX = 20 + PAD_W;
      const rel = (ballY + BALL_SIZE / 2 - leftY) / leftPadH;
      ballDY = (rel - 0.5) * 2 * Math.abs(ballDX) * 1.2;
      if (curvePending.left) {
        ballDY += (Math.random() < 0.5 ? 1 : -1) * Math.abs(ballDX) * 1.5;
        curvePending.left = false;
      }
      ghostBall = false;
      // restore speed if slowball just wore off inline — handled by tickEffects
    }
  }

  // Right paddle collision
  if (ballX + BALL_SIZE >= W - 20 - PAD_W && ballY + BALL_SIZE >= rightY && ballY <= rightY + rightPadH && ballDX > 0) {
    if (ghostBall) {
      // ghost: pass through
    } else {
      ballDX *= -1;
      ballX = W - 20 - PAD_W - BALL_SIZE;
      const rel = (ballY + BALL_SIZE / 2 - rightY) / rightPadH;
      ballDY = (rel - 0.5) * 2 * Math.abs(ballDX) * 1.2;
      if (curvePending.right) {
        ballDY += (Math.random() < 0.5 ? 1 : -1) * Math.abs(ballDX) * 1.5;
        curvePending.right = false;
      }
      ghostBall = false;
    }
  }

  // Scoring
  if (ballX < 0) {
    rightScore++;
    rightCoins += 3;
    checkWin();
    if (gameState === 'playing') resetBall(1);
  }
  if (ballX > W) {
    leftScore++;
    leftCoins += 3;
    checkWin();
    if (gameState === 'playing') resetBall(-1);
  }
}

// ── Draw ──────────────────────────────────────────────────
function draw() {
  const leftPadH  = getLeftPadH();
  const rightPadH = getRightPadH();

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Centre dashes
  ctx.fillStyle = '#1a1a1a';
  for (let y = 0; y < H; y += 20) ctx.fillRect(W / 2 - 1, y, 2, 10);

  // Trail
  if (SETTINGS.trail[cfg.trail]) {
    const trailColor = ghostBall ? '180,100,255' : '255,255,255';
    trailPoints.forEach((pt, i) => {
      const alpha = (i / trailPoints.length) * 0.35;
      const size  = BALL_SIZE * (i / trailPoints.length);
      ctx.fillStyle = `rgba(${trailColor},${alpha})`;
      ctx.fillRect(pt.x + (BALL_SIZE - size) / 2, pt.y + (BALL_SIZE - size) / 2, size, size);
    });
  }

  // Paddles
  // Left paddle glow effects
  const leftGlow  = hasEffect('bigpaddle_left')  ? '#4f4' : hasEffect('shrink_left')  ? '#f84' : null;
  const rightGlow = hasEffect('bigpaddle_right') ? '#4f4' : hasEffect('shrink_right') ? '#f84' : null;

  ctx.fillStyle = leftGlow || '#fff';
  ctx.fillRect(20, leftY, PAD_W, leftPadH);

  ctx.fillStyle = rightGlow || '#fff';
  ctx.fillRect(W - 20 - PAD_W, rightY, PAD_W, rightPadH);

  // Ball (purple tint when ghost is active)
  ctx.fillStyle = ghostBall ? '#c8f' : '#fff';
  ctx.fillRect(ballX, ballY, BALL_SIZE, BALL_SIZE);

  // Scores
  ctx.font = '700 40px Orbitron, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText(leftScore,  W / 4,     58);
  ctx.fillText(rightScore, 3 * W / 4, 58);

  // ── HUD: coins + held item ────────────────────────────────
  drawHUD();

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

  // Active effect timers
  drawEffectBars();

  if (gameState === 'paused') {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, W, H);
  }

  // Shop overlay (drawn on top)
  if (gameState === 'shop') {
    drawShop();
  }

  if (showerReminderActive) {
    drawShowerReminder();
  }
}

function drawHUD() {
  ctx.font = '11px Share Tech Mono, monospace';

  // Left player HUD
  ctx.textAlign = 'left';
  ctx.fillStyle = '#555';
  ctx.fillText(`¢ ${leftCoins}`, 22, 78);

  if (leftItem) {
    const pu = POWERUPS.find(p => p.key === leftItem);
    ctx.fillStyle = pu.color;
    ctx.fillText(`[${keybinds.p1Powerup.toUpperCase()}] ${pu.label}`, 22, 93);
  } else {
    ctx.fillStyle = '#2a2a2a';
    ctx.fillText(`[${keybinds.p1Shop.toUpperCase()}] Shop`, 22, 93);
  }

  // Right player HUD (skip shop hint for bot)
  ctx.textAlign = 'right';
  ctx.fillStyle = '#555';
  ctx.fillText(`¢ ${rightCoins}`, W - 22, 78);

  if (rightItem) {
    const pu = POWERUPS.find(p => p.key === rightItem);
    ctx.fillStyle = pu.color;
    ctx.fillText(`[${keybinds.p2Powerup}] ${pu.label}`, W - 22, 93);
  } else if (!botActive) {
    ctx.fillStyle = '#2a2a2a';
    ctx.fillText(`[${keybinds.p2Shop}] Shop`, W - 22, 93);
  }
}

function drawEffectBars() {
  const barW = 60, barH = 3;
  const padding = 6;
  let leftRow = 0, rightRow = 0;

  activeEffects.forEach(e => {
    const maxFrames = e.type.includes('slowball') ? 5 * FPS
                    : e.type.includes('bigpaddle') ? 8 * FPS
                    : 6 * FPS;
    const ratio = e.framesLeft / maxFrames;
    const isLeft = e.type.endsWith('_left');
    const row = isLeft ? leftRow++ : rightRow++;

    const x = isLeft ? 22 : W - 22 - barW;
    const y = H - 28 - row * (barH + padding);

    const color = e.type.includes('bigpaddle') ? '#4f4'
                : e.type.includes('shrink')    ? '#f84'
                : '#4af';

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, barW * ratio, barH);

    const label = e.type.includes('bigpaddle') ? 'BIG'
                : e.type.includes('shrink')    ? 'SHRINK'
                : 'SLOW';
    ctx.font = '9px Share Tech Mono, monospace';
    ctx.fillStyle = color;
    if (isLeft) {
      ctx.textAlign = 'left';
      ctx.fillText(label, x, y - 2);
    } else {
      ctx.textAlign = 'right';
      ctx.fillText(label, x + barW, y - 2);
    }
  });
}

function drawShop() {
  const side = shopOpen;
  const coins = side === 'left' ? leftCoins : rightCoins;
  const held  = side === 'left' ? leftItem  : rightItem;
  const activateKey = side === 'left' ? keybinds.p1Powerup.toUpperCase() : keybinds.p2Powerup;
  const label = side === 'left' ? 'YOUR SHOP' : (botActive ? '' : 'P2 SHOP');

  const boxW = 290, boxH = 310;
  const boxX = side === 'left' ? 24 : W - 24 - boxW;
  const boxY = H / 2 - boxH / 2;

  // Backdrop
  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  ctx.fillRect(boxX, boxY, boxW, boxH);

  // Border
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  // Corner accents
  const cs = 8;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(boxX + cs, boxY); ctx.lineTo(boxX, boxY); ctx.lineTo(boxX, boxY + cs);
  ctx.moveTo(boxX + boxW - cs, boxY); ctx.lineTo(boxX + boxW, boxY); ctx.lineTo(boxX + boxW, boxY + cs);
  ctx.moveTo(boxX, boxY + boxH - cs); ctx.lineTo(boxX, boxY + boxH); ctx.lineTo(boxX + cs, boxY + boxH);
  ctx.moveTo(boxX + boxW, boxY + boxH - cs); ctx.lineTo(boxX + boxW, boxY + boxH); ctx.lineTo(boxX + boxW - cs, boxY + boxH);
  ctx.stroke();

  const padX = boxX + 18;
  let curY = boxY + 22;

  // Title
  ctx.font = '700 13px Orbitron, monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.fillText(label, padX, curY);

  // Coins
  ctx.font = '11px Share Tech Mono, monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fa4';
  ctx.fillText(`¢ ${coins}`, boxX + boxW - 18, curY);

  curY += 14;
  ctx.fillStyle = '#222';
  ctx.fillRect(boxX + 12, curY, boxW - 24, 1);
  curY += 12;

  // Held item info
  if (held) {
    const pu = POWERUPS.find(p => p.key === held);
    ctx.textAlign = 'left';
    ctx.font = '10px Share Tech Mono, monospace';
    ctx.fillStyle = pu.color;
    ctx.fillText(`HELD: ${pu.label}  [${activateKey}] to use`, padX, curY);
    curY += 14;
    ctx.fillStyle = '#222';
    ctx.fillRect(boxX + 12, curY, boxW - 24, 1);
    curY += 12;
  } else {
    ctx.textAlign = 'left';
    ctx.font = '10px Share Tech Mono, monospace';
    ctx.fillStyle = '#333';
    ctx.fillText('No item held — buy one below', padX, curY);
    curY += 14;
    ctx.fillStyle = '#222';
    ctx.fillRect(boxX + 12, curY, boxW - 24, 1);
    curY += 12;
  }

  // Item rows
  POWERUPS.forEach((pu, i) => {
    const canAfford = coins >= pu.cost;
    const isHeld    = held === pu.key;
    const rowH = 40;
    const rowY = curY;

    // Hover highlight
    if (canAfford && !held) {
      ctx.fillStyle = '#111';
      ctx.fillRect(boxX + 12, rowY - 2, boxW - 24, rowH - 2);
    }

    // Number key badge
    ctx.font = '10px Share Tech Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = canAfford && !held ? '#555' : '#2a2a2a';
    ctx.fillText(`[${i + 1}]`, padX, rowY + 13);

    // Icon
    ctx.font = '14px monospace';
    ctx.fillStyle = canAfford ? pu.color : '#333';
    ctx.fillText(pu.icon, padX + 26, rowY + 14);

    // Label
    ctx.font = '700 11px Orbitron, monospace';
    ctx.fillStyle = isHeld ? pu.color : (canAfford ? '#ddd' : '#444');
    ctx.textAlign = 'left';
    ctx.fillText(pu.label, padX + 44, rowY + 10);

    // Desc
    ctx.font = '9px Share Tech Mono, monospace';
    ctx.fillStyle = '#555';
    ctx.fillText(pu.desc, padX + 44, rowY + 22);

    // Cost badge
    ctx.textAlign = 'right';
    ctx.font = '10px Share Tech Mono, monospace';
    ctx.fillStyle = canAfford ? '#fa4' : '#444';
    ctx.fillText(`¢${pu.cost}`, boxX + boxW - 18, rowY + 13);

    curY += rowH;
  });

  // Close hint
  ctx.font = '9px Share Tech Mono, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#333';
  ctx.fillText('[ESC] Close', boxX + boxW / 2, boxY + boxH - 10);
}

function drawShowerReminder() {
  const boxW = 340;
  const boxH = 82;
  const boxX = W / 2 - boxW / 2;
  const boxY = 18;

  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  ctx.fillRect(boxX, boxY, boxW, boxH);

  ctx.strokeStyle = '#4af';
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = '700 14px Orbitron, monospace';
  ctx.fillText('DDAAMN YOUVE BEEN PLAYING FOR A WHILE', W / 2, boxY + 26);

  ctx.font = '12px Share Tech Mono, monospace';
  ctx.fillStyle = '#7fd7ff';
  ctx.fillText('Take a shower!', W / 2, boxY + 48);

  ctx.fillStyle = '#888';
  ctx.fillText('Back to the match when you are ready.', W / 2, boxY + 66);
}

// ── Loop ─────────────────────────────────────────────────
function loop(timestamp = performance.now()) {
  if (lastLoopTime === null) lastLoopTime = timestamp;

  const targetFPS = getTargetFPS();
  const baseFrameMs = 1000 / FPS;
  const elapsed = Math.min(timestamp - lastLoopTime, 250);
  lastLoopTime = timestamp;

  let shouldDraw = gameState !== 'playing';

  if (gameState === 'playing') {
    if (targetFPS === 0) {
      update(elapsed / baseFrameMs);
      shouldDraw = true;
    } else {
      frameAccumulatorMs += elapsed;
      const stepMs = 1000 / targetFPS;
      const frameScale = stepMs / baseFrameMs;

      while (frameAccumulatorMs >= stepMs) {
        update(frameScale);
        frameAccumulatorMs -= stepMs;
        shouldDraw = true;
      }
    }
  } else {
    frameAccumulatorMs = 0;
  }

  if (shouldDraw) draw();
  requestAnimationFrame(loop);
}

showMenu(mainMenu);
loop();
