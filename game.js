const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

const W = canvas.width, H = canvas.height;
const PAD_W = 10, PAD_H = 80, SPEED = 5, BALL_SIZE = 10;

let leftY = H / 2 - PAD_H / 2;
let rightY = H / 2 - PAD_H / 2;
let ballX = W / 2, ballY = H / 2;
let ballDX = 4 * (Math.random() < 0.5 ? 1 : -1);
let ballDY = 3 * (Math.random() < 0.5 ? 1 : -1);
let leftScore = 0, rightScore = 0;
const keys = {};

document.addEventListener('keydown', e => keys[e.key] = true);
document.addEventListener('keyup', e => keys[e.key] = false);

function resetBall(dir) {
  ballX = W / 2;
  ballY = H / 2;
  ballDX = 4 * dir;
  ballDY = 3 * (Math.random() < 0.5 ? 1 : -1);
}

function update() {
  if (keys['w'] || keys['W']) leftY = Math.max(0, leftY - SPEED);
  if (keys['s'] || keys['S']) leftY = Math.min(H - PAD_H, leftY + SPEED);
  if (keys['ArrowUp'])   rightY = Math.max(0, rightY - SPEED);
  if (keys['ArrowDown']) rightY = Math.min(H - PAD_H, rightY + SPEED);

  ballX += ballDX;
  ballY += ballDY;

  if (ballY <= 0) { ballY = 0; ballDY *= -1; }
  if (ballY + BALL_SIZE >= H) { ballY = H - BALL_SIZE; ballDY *= -1; }

  if (ballX <= 20 + PAD_W && ballY + BALL_SIZE >= leftY && ballY <= leftY + PAD_H && ballDX < 0) {
    ballDX *= -1;
    ballX = 20 + PAD_W;
    leftScore++;
  }

  if (ballX + BALL_SIZE >= W - 20 - PAD_W && ballY + BALL_SIZE >= rightY && ballY <= rightY + PAD_H && ballDX > 0) {
    ballDX *= -1;
    ballX = W - 20 - PAD_W - BALL_SIZE;
    rightScore++;
  }

  if (ballX < 0) { rightScore += 10; resetBall(1); }
  if (ballX > W) { leftScore  += 10; resetBall(-1); }
}

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#fff';

  for (let y = 0; y < H; y += 20) {
    ctx.fillRect(W / 2 - 1, y, 2, 10);
  }

  ctx.fillRect(20, leftY, PAD_W, PAD_H);
  ctx.fillRect(W - 20 - PAD_W, rightY, PAD_W, PAD_H);
  ctx.fillRect(ballX, ballY, BALL_SIZE, BALL_SIZE);

  ctx.font = '40px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(leftScore, W / 4, 50);
  ctx.fillText(rightScore, 3 * W / 4, 50);
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

loop();