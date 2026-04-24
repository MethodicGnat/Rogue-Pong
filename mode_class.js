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
  flappyBird:        'Gravity is real — jump to survive'
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
    fbPipes = [];
    fbPipeTimer = 0;
    fbP1Vel = 0;
    fbP2Vel = 0;
    fbP1Grounded = false;
    fbP2Grounded = false;
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
const FB_PIPE_GAP  = 130;   // vertical opening size
const FB_PIPE_W    = 18;
const FB_PIPE_SPEED = 1.8;
const FB_PIPE_INTERVAL = 180; // frames between pipes

let fbPipes = [];       // { x, topH }
let fbPipeTimer = 0;
let fbP1Vel = 0;
let fbP2Vel = 0;
let fbLastFlap1 = false; // edge-detect
let fbLastFlap2 = false;

function updateFlappyBird(frameScale) {
  const leftPadH  = getLeftPadH();
  const rightPadH = getRightPadH();

  // Gravity on paddles
  fbP1Vel = (fbP1Vel + FB_GRAVITY) * frameScale + fbP1Vel * (1 - frameScale);
  fbP2Vel = (fbP2Vel + FB_GRAVITY) * frameScale + fbP2Vel * (1 - frameScale);

  // Simplify: apply velocity each frame
  fbP1Vel += FB_GRAVITY * frameScale;
  fbP2Vel += FB_GRAVITY * frameScale;

  // Flap on UP key (edge-detect)
  const p1Up = keys[keybinds.p1Up] || keys[keybinds.p1Up.toLowerCase()];
  const p2Up = keys[keybinds.p2Up] || keys[keybinds.p2Up.toLowerCase()];
  if (p1Up && !fbLastFlap1) { fbP1Vel = FB_FLAP; }
  if (p2Up && !fbLastFlap2) { fbP2Vel = FB_FLAP; }
  fbLastFlap1 = p1Up;
  fbLastFlap2 = p2Up;

  // Clamp velocity
  fbP1Vel = Math.max(-10, Math.min(10, fbP1Vel));
  fbP2Vel = Math.max(-10, Math.min(10, fbP2Vel));

  leftY  = Math.max(0, Math.min(H - leftPadH,  leftY  + fbP1Vel * frameScale));
  rightY = Math.max(0, Math.min(H - rightPadH, rightY + fbP2Vel * frameScale));

  // Spawn pipes
  fbPipeTimer += frameScale;
  if (fbPipeTimer >= FB_PIPE_INTERVAL) {
    fbPipeTimer -= FB_PIPE_INTERVAL;
    const minTop = 40;
    const maxTop = H - FB_PIPE_GAP - 40;
    const topH = minTop + Math.random() * (maxTop - minTop);
    fbPipes.push({ x: W, topH });
  }

  // Move pipes & check collisions
  fbPipes = fbPipes.filter(pipe => {
    pipe.x -= FB_PIPE_SPEED * frameScale;

    // Ball hits pipe?
    if (
      ballX + BALL_SIZE > pipe.x && ballX < pipe.x + FB_PIPE_W &&
      (ballY < pipe.topH || ballY + BALL_SIZE > pipe.topH + FB_PIPE_GAP)
    ) {
      ballDX *= -1;
      ballDY  = (Math.random() - 0.5) * Math.abs(ballDX) * 2;
    }

    return pipe.x + FB_PIPE_W > 0;
  });

  // Normal ball physics (walls bounce)
  moveBall(frameScale);
  if (ballY <= 0)               { ballY = 0;             ballDY *= -1; }
  if (ballY + BALL_SIZE >= H)   { ballY = H - BALL_SIZE; ballDY *= -1; }
}

function drawFlappyPipes() {
  if (getCurrentMode() !== 'flappyBird') return;
  ctx.save();
  fbPipes.forEach(pipe => {
    // Top pipe
    ctx.fillStyle = '#1e3a1e';
    ctx.fillRect(pipe.x, 0, FB_PIPE_W, pipe.topH);
    ctx.strokeStyle = '#4f4';
    ctx.lineWidth = 1;
    ctx.strokeRect(pipe.x, 0, FB_PIPE_W, pipe.topH);

    // Bottom pipe
    const botY = pipe.topH + FB_PIPE_GAP;
    ctx.fillStyle = '#1e3a1e';
    ctx.fillRect(pipe.x, botY, FB_PIPE_W, H - botY);
    ctx.strokeStyle = '#4f4';
    ctx.strokeRect(pipe.x, botY, FB_PIPE_W, H - botY);

    // Gap highlight
    ctx.strokeStyle = 'rgba(100,255,100,0.12)';
    ctx.lineWidth = FB_PIPE_GAP;
    ctx.beginPath();
    ctx.moveTo(pipe.x + FB_PIPE_W/2, pipe.topH);
    ctx.lineTo(pipe.x + FB_PIPE_W/2, pipe.topH + FB_PIPE_GAP);
    ctx.stroke();
  });

  // Gravity indicator (small arrow on each paddle)
  ctx.fillStyle = 'rgba(100,255,100,0.4)';
  ctx.font = '14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('▼', 20 + PAD_W/2, leftY + getLeftPadH() + 16);
  ctx.fillText('▼', W - 20 - PAD_W/2, rightY + getRightPadH() + 16);

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
