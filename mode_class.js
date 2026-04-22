class GameMode {
  normal() {
    // Wall bounce
    if (ballY <= 0)               { ballY = 0;              ballDY *= -1; }
    if (ballY + BALL_SIZE >= H)   { ballY = H - BALL_SIZE;  ballDY *= -1; }
  }

  noWallsMode() {
     // Ghost ball — faint preview at the opposite edge when ball is near a wall
    if (ballY < 40 || ballY > H - 40 - BALL_SIZE) {
      const ghostY = ballY < 40 ? ballY + H : ballY - H;
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = 'rgb(255, 255, 255)';
      ctx.fillRect(ballX, ghostY, BALL_SIZE, BALL_SIZE);
      ctx.globalAlpha = 1;
    }
    
      // Wrap through top/bottom walls instead of bouncing
      if (ballY + BALL_SIZE < 0) ballY += H;
      if (ballY > H)             ballY -= H;
  }

  rockPaperScissors() {

  }
}