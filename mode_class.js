// ── Game Mode System ──────────────────────────────────────
// Modes rotate every 5 paddle hits.
// Order: normal → noWalls → rockPaperScissors → flappyBird → repeat

const MODE_ORDER = ['normal', 'noWallsMode', 'rockPaperScissors', 'flappyBird'];
let currentModeIndex = 0;
let paddleHitCount = 0;         // counts hits since last mode switch
const HITS_PER_MODE = 5;

// ── Mode transition banner ────────────────────────────────
let modeBannerFrames = 0;
const MODE_BANNER_DURATION = 180; // 3 seconds at 60fps
const MODE_NAMES = {
  normal:            'NORMAL',
  noWallsMode:       'NO WALLS',
  rockPaperScissors: 'ROCK PAPER SCISSORS',
  flappyBird:        'FLAPPY BIRD'
};
const MODE_SUBTITLES = {
  normal:            'Classic pong',
  noWallsMode:       'Ball wraps through top & bottom',
  rockPaperScissors: 'Lose the RPS? Dodge the ball!',
  flappyBird:        'Gravity is real — bounce past the walls'
};

function getCurrentMode() {
  return MODE_ORDER[currentModeIndex];
}

// Called from paddle hit logic in game.js (patched below)
function onPaddleHit() {
  paddleHitCount++;
  if (paddleHitCount >= HITS_PER_MODE) {
    paddleHitCount = 0;
    currentModeIndex = (currentModeIndex + 1) % MODE_ORDER.length;
    modeBannerFrames = MODE_BANNER_DURATION;
    onModeEnter(getCurrentMode());
  }
}

// Reset mode state when a new game starts
function resetModeState() {
  currentModeIndex = 0;
  paddleHitCount   = 0;
  modeBannerFrames = MODE_BANNER_DURATION; // show mode name at start
  onModeEnter(getCurrentMode());
}

// ── Per-mode entry initialisation ────────────────────────
function onModeEnter(mode) {
  if (mode === 'rockPaperScissors') {
    rpsState = 'idle';
    rpsPlayerChoice = null;
    rpsResult       = null;
    rpsReactionFrames = 0;
    rpsFlashFrames    = 0;
    rpsPunishSide     = null;
  }
  if (mode === 'flappyBird') {
    buildFbWalls();
    fbP1Vel = 0;
    fbP2Vel = 0;
    fbLastFlap1 = false;
    fbLastFlap2 = false;
    fbWallTime  = 0;
  }
}

// ── Utility ───────────────────────────────────────────────
function moveBall(frameScale = 1) {
  ballX += ballDX * frameScale;
  ballY += ballDY * frameScale;

  if (SETTINGS.trail[cfg.trail]) {
    trailPoints.push({ x: ballX, y: ballY });
    if (trailPoints.length > 12) trailPoints.shift();
  } else {
    trailPoints = [];
  }
}

// ── Mode Banner Draw ──────────────────────────────────────
function drawModeBanner() {
  if (modeBannerFrames <= 0) return;

  const alpha = Math.min(1, modeBannerFrames / 40) * Math.min(1, (modeBannerFrames) / 40);
  const mode  = getCurrentMode();
  const name  = MODE_NAMES[mode]     || mode;
  const sub   = MODE_SUBTITLES[mode] || '';

  // Hit counter badge (bottom-centre)
  const hitsLeft = HITS_PER_MODE - paddleHitCount;
  ctx.save();
  ctx.globalAlpha = Math.min(1, modeBannerFrames / 40) * 0.85;

  // Banner backdrop
  const bw = 380, bh = 74;
  const bx = W / 2 - bw / 2;
  const by = H / 2 - bh / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, bw, bh);

  // Corner ticks
  const cs = 7;
  [[bx,by,1,1],[bx+bw,by,-1,1],[bx,by+bh,1,-1],[bx+bw,by+bh,-1,-1]].forEach(([cx,cy,sx,sy])=>{
    ctx.beginPath();
    ctx.moveTo(cx+sx*cs, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy+sy*cs);
    ctx.stroke();
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = '700 22px Orbitron, monospace';
  ctx.fillText(name, W / 2, by + 32);

  ctx.font = '10px Share Tech Mono, monospace';
  ctx.fillStyle = '#777';
  ctx.fillText(sub.toUpperCase(), W / 2, by + 52);

  ctx.restore();

  modeBannerFrames--;
}

// Hit-counter pill (always visible during play)
function drawHitCounter() {
  if (gameState !== 'playing') return;
  const hitsLeft = HITS_PER_MODE - paddleHitCount;
  const mode = getCurrentMode();
  const nextMode = MODE_ORDER[(currentModeIndex + 1) % MODE_ORDER.length];
  const label = `MODE SWITCH IN ${hitsLeft} HIT${hitsLeft !== 1 ? 'S' : ''}  →  ${MODE_NAMES[nextMode]}`;

  ctx.save();
  ctx.font = '9px Share Tech Mono, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#2a2a2a';
  ctx.fillText(label, W / 2, H - 10);
  ctx.restore();
}

// ══════════════════════════════════════════════════════════
// ── Rock Paper Scissors mode ──────────────────────────────
// ══════════════════════════════════════════════════════════
// Every few seconds a "RPS round" fires. Both players choose
// R/P/S (left: A/S/D  right: ←/↓/→  or shown on screen).
// The loser gets a random-direction punish ball launched at
// their goal and they must react quickly to deflect it.

let rpsState = 'idle';        // 'idle' | 'choosing' | 'resolving' | 'punish'
let rpsChooseFrames = 0;
const RPS_CHOOSE_DURATION = 240; // 4 seconds to pick
let rpsLeftChoice  = null;   // 'rock'|'paper'|'scissors'|null
let rpsRightChoice = null;
let rpsResult      = null;   // 'left'|'right'|'draw'
let rpsReactionFrames = 0;
const RPS_PUNISH_DURATION = 300; // 5 seconds of punish phase
let rpsFlashFrames = 0;
let rpsPunishSide  = null;   // side that lost
let rpsRoundTimer  = 0;
const RPS_ROUND_INTERVAL = 360; // trigger a round every ~6 sec

// Saved ball state during RPS round (restored after)
let rpsSavedBall = null;

const RPS_SYMBOLS = { rock: '✊', paper: '✋', scissors: '✌' };
const RPS_KEYS_LEFT  = { a: 'rock', s: 'paper', d: 'scissors' };
const RPS_KEYS_RIGHT = { arrowleft: 'rock', arrowdown: 'paper', arrowright: 'scissors' };

function rpsWinner(l, r) {
  if (l === r) return 'draw';
  if ((l==='rock'&&r==='scissors')||(l==='scissors'&&r==='paper')||(l==='paper'&&r==='rock')) return 'left';
  return 'right';
}

function startRpsRound() {
  rpsState       = 'choosing';
  rpsChooseFrames = RPS_CHOOSE_DURATION;
  rpsLeftChoice  = null;
  rpsRightChoice = null;
  rpsResult      = null;
  rpsPunishSide  = null;
  // Freeze the main ball
  rpsSavedBall = { x: ballX, y: ballY, dx: ballDX, dy: ballDY };
  ballDX = 0; ballDY = 0;
}

function resolveRps() {
  const l = rpsLeftChoice  || ['rock','paper','scissors'][Math.floor(Math.random()*3)];
  const r = rpsRightChoice || ['rock','paper','scissors'][Math.floor(Math.random()*3)];
  rpsLeftChoice  = l;
  rpsRightChoice = r;
  rpsResult = rpsWinner(l, r);
  rpsFlashFrames = 90;

  if (rpsResult !== 'draw') {
    rpsPunishSide = rpsResult === 'left' ? 'right' : 'left'; // loser
    rpsState = 'resolving';
  } else {
    // Draw: restore ball, back to idle
    restoreRpsBall();
    rpsState = 'idle';
  }
}

function startRpsPunish() {
  rpsState = 'punish';
  rpsReactionFrames = RPS_PUNISH_DURATION;
  // Launch a punish ball toward the loser's goal
  const spd = SETTINGS.ballSpeed[cfg.ballSpeed] * 1.6;
  const angle = (Math.random() * 60 - 30) * Math.PI / 180; // ±30° random
  if (rpsPunishSide === 'left') {
    // ball goes left
    ballX  = W / 2; ballY = H / 2;
    ballDX = -spd * Math.cos(angle);
    ballDY =  spd * Math.sin(angle);
  } else {
    // ball goes right
    ballX  = W / 2; ballY = H / 2;
    ballDX =  spd * Math.cos(angle);
    ballDY =  spd * Math.sin(angle);
  }
  trailPoints = [];
}

function restoreRpsBall() {
  if (rpsSavedBall) {
    ballX = rpsSavedBall.x; ballY = rpsSavedBall.y;
    ballDX = rpsSavedBall.dx; ballDY = rpsSavedBall.dy;
    rpsSavedBall = null;
  }
}

function updateRpsChoiceKeys() {
  if (rpsState !== 'choosing') return;
  for (const [k, choice] of Object.entries(RPS_KEYS_LEFT)) {
    if (keys[k]) rpsLeftChoice = choice;
  }
  for (const [k, choice] of Object.entries(RPS_KEYS_RIGHT)) {
    if (keys[k]) rpsRightChoice = choice;
  }
}

function drawRpsOverlay() {
  if (rpsState === 'idle') return;

  ctx.save();

  if (rpsState === 'choosing') {
    const t = rpsChooseFrames / RPS_CHOOSE_DURATION;

    // Timer bar
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(W/2-160, H/2-74, 320, 148);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(W/2-160, H/2-74, 320, 148);

    ctx.fillStyle = '#fff';
    ctx.font = '700 16px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ROCK · PAPER · SCISSORS', W/2, H/2-48);

    // Timer bar
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(W/2-120, H/2-30, 240, 6);
    ctx.fillStyle = t > 0.4 ? '#4f4' : t > 0.2 ? '#fa4' : '#f44';
    ctx.fillRect(W/2-120, H/2-30, 240 * t, 6);

    // Left choices
    ctx.textAlign = 'left';
    ctx.font = '11px Share Tech Mono, monospace';
    ctx.fillStyle = '#555';
    ctx.fillText('P1:  [A] ✊  [S] ✋  [D] ✌', W/2-150, H/2-8);
    ctx.fillStyle = rpsLeftChoice ? '#fff' : '#333';
    ctx.font = '700 28px monospace';
    ctx.fillText(rpsLeftChoice ? RPS_SYMBOLS[rpsLeftChoice] : '?', W/2-140, H/2+32);

    // Right choices
    ctx.textAlign = 'right';
    ctx.font = '11px Share Tech Mono, monospace';
    ctx.fillStyle = '#555';
    ctx.fillText('P2:  [←] ✊  [↓] ✋  [→] ✌', W/2+150, H/2-8);
    ctx.fillStyle = rpsRightChoice ? '#fff' : '#333';
    ctx.font = '700 28px monospace';
    ctx.fillText(rpsRightChoice ? RPS_SYMBOLS[rpsRightChoice] : '?', W/2+140, H/2+32);

    // "VS"
    ctx.textAlign = 'center';
    ctx.fillStyle = '#333';
    ctx.font = '700 14px Orbitron, monospace';
    ctx.fillText('VS', W/2, H/2+32);
  }

  if (rpsState === 'resolving' && rpsFlashFrames > 0) {
    const flash = Math.floor(rpsFlashFrames / 10) % 2 === 0;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(W/2-200, H/2-80, 400, 160);

    ctx.textAlign = 'center';
    ctx.font = '700 42px monospace';
    ctx.fillText(
      `${RPS_SYMBOLS[rpsLeftChoice]}  VS  ${RPS_SYMBOLS[rpsRightChoice]}`,
      W/2, H/2
    );

    const loserLabel = rpsPunishSide === 'left' ? 'P1 LOSES!' : 'P2 LOSES!';
    ctx.font = '700 18px Orbitron, monospace';
    ctx.fillStyle = flash ? '#f44' : '#800';
    ctx.fillText(loserLabel, W/2, H/2+38);

    ctx.font = '10px Share Tech Mono, monospace';
    ctx.fillStyle = '#555';
    ctx.fillText('GET READY TO DEFLECT...', W/2, H/2+60);
  }

  if (rpsState === 'punish') {
    // Pulse danger border on loser's side
    const pulse = Math.sin(Date.now() / 120) * 0.5 + 0.5;
    ctx.strokeStyle = `rgba(255,50,50,${pulse * 0.7})`;
    ctx.lineWidth = 4;
    if (rpsPunishSide === 'left') {
      ctx.strokeRect(2, 2, W/2, H-4);
    } else {
      ctx.strokeRect(W/2, 2, W/2-2, H-4);
    }

    // Countdown bar
    const t = rpsReactionFrames / RPS_PUNISH_DURATION;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(W/2-100, H-22, 200, 8);
    ctx.fillStyle = t > 0.5 ? '#f44' : t > 0.25 ? '#fa4' : '#4f4';
    ctx.fillRect(W/2-100, H-22, 200 * t, 8);
  }

  ctx.restore();
}

// ══════════════════════════════════════════════════════════
// ── Flappy Bird mode ──────────────────────────────────────
// ══════════════════════════════════════════════════════════
// Paddles fall due to gravity. Players press their UP key to
// flap (jump). Pipes scroll from right to left — if the ball
// or a paddle clips a pipe, that side scores a point.

const FB_GRAVITY   = 0.28;
const FB_FLAP      = -6.5;
const FB_WALL_GAP  = 140;   // vertical opening size in each static wall
const FB_WALL_W    = 18;

// Static walls defined as { x (0-1 fraction of W), gapY (0-1 fraction of H) }
// These are initialised in onModeEnter so they use the live W/H values.
let fbWalls = [];       // { x, gapY } — pixel coords set on mode enter
let fbP1Vel = 0;
let fbP2Vel = 0;
let fbLastFlap1 = false; // edge-detect
let fbLastFlap2 = false;

let fbWallTime = 0; // global timer for wall animation

function buildFbWalls() {
  // 3 walls evenly spread across the middle third of the canvas.
  // Each wall gets its own sine-wave phase and speed so they move independently.
  const positions = [0.32, 0.5, 0.68];
  fbWalls = positions.map((xFrac, i) => ({
    x:         xFrac * W,
    phase:     (i / positions.length) * Math.PI * 2,  // stagger phases
    speed:     0.012 + i * 0.004,                      // slightly different speeds
    amplitude: (H - FB_WALL_GAP - 60) / 2,             // max travel range
    gapY:      0                                        // computed each frame
  }));
  fbWallTime = 0;
}

function updateFlappyBird(frameScale) {
  const leftPadH  = getLeftPadH();
  const rightPadH = getRightPadH();

  // Advance wall animation timer
  fbWallTime += frameScale;

  // Animate each wall's gap position with its own sine wave
  for (const wall of fbWalls) {
    const centre = (H - FB_WALL_GAP) / 2;
    wall.gapY = centre + Math.sin(fbWallTime * wall.speed + wall.phase) * wall.amplitude;
    wall.gapY = Math.max(20, Math.min(H - FB_WALL_GAP - 20, wall.gapY));
  }

  // Gravity on left (human) paddle only
  fbP1Vel += FB_GRAVITY * frameScale;

  // Flap on UP key (edge-detect) — P1 only; bot uses normal AI movement
  const p1Up = keys[keybinds.p1Up] || keys[keybinds.p1Up.toLowerCase()];
  if (p1Up && !fbLastFlap1) { fbP1Vel = FB_FLAP; }
  fbLastFlap1 = p1Up;

  // Clamp and apply P1 velocity
  fbP1Vel = Math.max(-10, Math.min(10, fbP1Vel));
  leftY   = Math.max(0, Math.min(H - leftPadH, leftY + fbP1Vel * frameScale));

  // Bot (right paddle) uses normal AI movement — no gravity
  if (!botActive) {
    fbP2Vel += FB_GRAVITY * frameScale;
    const p2Up = keys[keybinds.p2Up] || keys[keybinds.p2Up.toLowerCase()];
    if (p2Up && !fbLastFlap2) { fbP2Vel = FB_FLAP; }
    fbLastFlap2 = p2Up;
    fbP2Vel = Math.max(-10, Math.min(10, fbP2Vel));
    rightY  = Math.max(0, Math.min(H - rightPadH, rightY + fbP2Vel * frameScale));
  }
  // (bot rightY is managed by updateBot() in game.js when botActive)

  // Move ball
  moveBall(frameScale);

  // Bounce off top/bottom walls (no passing through)
  if (ballY <= 0)               { ballY = 0;             ballDY = Math.abs(ballDY); }
  if (ballY + BALL_SIZE >= H)   { ballY = H - BALL_SIZE; ballDY = -Math.abs(ballDY); }

  // Bounce off static centre walls
  for (const wall of fbWalls) {
    const wallLeft  = wall.x;
    const wallRight = wall.x + FB_WALL_W;
    const gapTop    = wall.gapY;
    const gapBot    = wall.gapY + FB_WALL_GAP;

    // Horizontal overlap with wall?
    if (ballX + BALL_SIZE > wallLeft && ballX < wallRight) {
      // Is the ball in the SOLID part (not in the gap)?
      if (ballY < gapTop || ballY + BALL_SIZE > gapBot) {
        // Deflect: reverse X and add a small random Y nudge
        ballDX *= -1;
        ballX   = ballDX > 0 ? wallRight : wallLeft - BALL_SIZE;
        ballDY += (Math.random() - 0.5) * 2;
      }
    }
  }
}

function drawFlappyPipes() {
  if (getCurrentMode() !== 'flappyBird') return;
  ctx.save();

  fbWalls.forEach(wall => {
    const gapTop = wall.gapY;
    const gapBot = wall.gapY + FB_WALL_GAP;

    // Top solid section
    ctx.fillStyle = '#1e3a1e';
    ctx.fillRect(wall.x, 0, FB_WALL_W, gapTop);
    ctx.strokeStyle = '#4f4';
    ctx.lineWidth = 1;
    ctx.strokeRect(wall.x, 0, FB_WALL_W, gapTop);

    // Bottom solid section
    ctx.fillStyle = '#1e3a1e';
    ctx.fillRect(wall.x, gapBot, FB_WALL_W, H - gapBot);
    ctx.strokeStyle = '#4f4';
    ctx.strokeRect(wall.x, gapBot, FB_WALL_W, H - gapBot);

    // Gap highlight
    ctx.strokeStyle = 'rgba(100,255,100,0.10)';
    ctx.lineWidth = FB_WALL_GAP;
    ctx.beginPath();
    ctx.moveTo(wall.x + FB_WALL_W / 2, gapTop);
    ctx.lineTo(wall.x + FB_WALL_W / 2, gapBot);
    ctx.stroke();
  });

  // Gravity indicator — only on human-controlled paddles
  ctx.fillStyle = 'rgba(100,255,100,0.4)';
  ctx.font = '14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('▼', 20 + PAD_W/2, leftY + getLeftPadH() + 16);
  if (!botActive) {
    ctx.fillText('▼', W - 20 - PAD_W/2, rightY + getRightPadH() + 16);
  }

  ctx.restore();
}

// ══════════════════════════════════════════════════════════
// ── GameMode class ────────────────────────────────────────
// ══════════════════════════════════════════════════════════

class GameMode {

  // ── 1. Normal ───────────────────────────────────────────
  normal(frameScale) {
    moveBall(frameScale);
    if (ballY <= 0)               { ballY = 0;             ballDY *= -1; }
    if (ballY + BALL_SIZE >= H)   { ballY = H - BALL_SIZE; ballDY *= -1; }
  }

  // ── 2. No Walls ─────────────────────────────────────────
  noWallsMode(frameScale) {
    moveBall(frameScale);

    // Ghost-ball preview at the opposite edge when close to a wall
    if (ballY < 50 || ballY > H - 50 - BALL_SIZE) {
      const ghostY = ballY < 50 ? ballY + H : ballY - H;
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#fff';
      ctx.fillRect(ballX, ghostY, BALL_SIZE, BALL_SIZE);
      ctx.restore();
    }

    // Wrap through top/bottom walls
    if (ballY + BALL_SIZE < 0) ballY += H;
    if (ballY > H)             ballY -= H;
  }

  // ── 3. Rock Paper Scissors ───────────────────────────────
  rockPaperScissors(frameScale) {
    updateRpsChoiceKeys();

    rpsRoundTimer += frameScale;

    if (rpsState === 'idle') {
      // Normal ball movement during idle
      moveBall(frameScale);
      if (ballY <= 0)               { ballY = 0;             ballDY *= -1; }
      if (ballY + BALL_SIZE >= H)   { ballY = H - BALL_SIZE; ballDY *= -1; }

      if (rpsRoundTimer >= RPS_ROUND_INTERVAL) {
        rpsRoundTimer = 0;
        startRpsRound();
      }
    }

    if (rpsState === 'choosing') {
      rpsChooseFrames -= frameScale;
      // Both chose early? Resolve immediately.
      if ((rpsLeftChoice && rpsRightChoice) || rpsChooseFrames <= 0) {
        resolveRps();
      }
    }

    if (rpsState === 'resolving') {
      rpsFlashFrames -= frameScale;
      if (rpsFlashFrames <= 0) {
        startRpsPunish();
      }
    }

    if (rpsState === 'punish') {
      // Move punish ball (same wall-bounce rules)
      moveBall(frameScale);
      if (ballY <= 0)               { ballY = 0;             ballDY *= -1; }
      if (ballY + BALL_SIZE >= H)   { ballY = H - BALL_SIZE; ballDY *= -1; }

      rpsReactionFrames -= frameScale;
      if (rpsReactionFrames <= 0) {
        // Time's up — restore original ball, back to idle
        restoreRpsBall();
        rpsState = 'idle';
        rpsRoundTimer = 0;
      }
    }
  }

  // ── 4. Flappy Bird ───────────────────────────────────────
  flappyBird(frameScale) {
    updateFlappyBird(frameScale);
  }
}

// ── Draw hook (called from game.js draw()) ─────────────────
// Insert into game.js draw() after paddles are drawn.
function drawModeExtras() {
  drawFlappyPipes();
  drawRpsOverlay();
  drawModeBanner();
  drawHitCounter();
}