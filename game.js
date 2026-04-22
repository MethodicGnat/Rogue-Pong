const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const PAD_W = 10,
      PAD_H = 80,
      SPEED = 5,
      BALL_SIZE = 10,
      SCORED_INCREMENT = 4;

let leftY = H / 2 - PAD_H / 2;
let rightY = H / 2 - PAD_H / 2;
let ballX = W / 2, ballY = H / 2;
let ballDX = 4 * (Math.random() < 0.5 ? 1 : -1);
let ballDY = 3 * (Math.random() < 0.5 ? 1 : -1);
let leftScore = 0, rightScore = 0;
let currentGameMode = new GameMode();

const keys = {};
document.addEventListener('keydown', e => { keys[e.key] = true; e.preventDefault(); });
document.addEventListener('keyup',   e => { keys[e.key] = false; });

function resetBall(dir) {
  ballX = W / 2;
  ballY = H / 2;
  ballDX = 4 * dir;
  ballDY = 3 * (Math.random() < 0.5 ? 1 : -1);
}

// Wrap-aware paddle collision — handles ball straddling the top/bottom edge
function paddleHit(padY) {
  const bTop = ballY, bBot = ballY + BALL_SIZE;
  const pTop = padY,  pBot = padY + PAD_H;

  if (bBot >= pTop && bTop <= pBot) return true;        // normal overlap
  if (bTop + H >= pTop && bTop + H <= pBot) return true; // ball near top, paddle near bottom
  if (bBot - H >= pTop && bBot - H <= pBot) return true; // ball near bottom, paddle near top
  return false;
}

function update() {
  // Paddle movement
  if (keys['w'] || keys['W']) leftY  = Math.max(0, leftY  - SPEED);
  if (keys['s'] || keys['S']) leftY  = Math.min(H - PAD_H, leftY  + SPEED);
  if (keys['ArrowUp'])        rightY = Math.max(0, rightY - SPEED);
  if (keys['ArrowDown'])      rightY = Math.min(H - PAD_H, rightY + SPEED);

  // Ball movement
  ballX += ballDX;
  ballY += ballDY;

  // Trail
  if (SETTINGS.trail[cfg.trail]) {
    trailPoints.push({ x: ballX, y: ballY });
    if (trailPoints.length > 12) trailPoints.shift();
  } else {
    trailPoints = [];
  }

  //choose gamemode
  currentGameMode.normal();

  // Left paddle collision
  if (ballX <= 20 + PAD_W && ballDX < 0 && paddleHit(leftY)) {
    ballDX *= -1;
    ballX = 20 + PAD_W;
  }

  // Right paddle collision
  if (ballX + BALL_SIZE >= W - 20 - PAD_W && ballDX > 0 && paddleHit(rightY)) {
    ballDX *= -1;
    ballX = W - 20 - PAD_W - BALL_SIZE;
  }

  // Scoring
  if (ballX < 0) { rightScore += SCORED_INCREMENT; resetBall(1);  }
  if (ballX > W) { leftScore  += SCORED_INCREMENT; resetBall(-1); }
}

function draw() {
  // Background
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Centre dashed line
  ctx.fillStyle = '#fff';
  for (let y = 0; y < H; y += 20) ctx.fillRect(W / 2 - 1, y, 2, 10);

  // Paddles
  ctx.fillStyle = '#fff';
  ctx.fillRect(20, leftY, PAD_W, PAD_H);
  ctx.fillRect(W - 20 - PAD_W, rightY, PAD_W, PAD_H);

  // Ball (cyan glow to signal wrap mode)

  ctx.fillStyle = 'rgb(255, 255, 255)';
  ctx.shadowColor = 'rgb(255, 255, 255)';
  ctx.shadowBlur = 8;
  ctx.fillRect(ballX, ballY, BALL_SIZE, BALL_SIZE);
  ctx.shadowBlur = 0;

  // Scores
  ctx.fillStyle = '#fff';
  ctx.font = '40px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(leftScore,  W / 4,     50);
  ctx.fillText(rightScore, 3 * W / 4, 50);
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

loop();
