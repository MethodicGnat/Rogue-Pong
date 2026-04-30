const SFX = {
  hit: new Audio('sounds/hit.wav'),
  wall: new Audio('sounds/wall.wav'),
  score: new Audio('sounds/score.wav'),
  flap: new Audio('sounds/flap.wav'),
  rpsWin: new Audio('sounds/rps_win.wav'),
  rpsLose: new Audio('sounds/rps_lose.wav'),
  menu: new Audio('sounds/menu.wav')
};

// Preload + base volume
for (let key in SFX) {
  SFX[key].volume = 0.5;
  SFX[key].preload = 'auto';
}

// Play function
function playSound(name) {
  const sound = SFX[name];
  if (!sound) return;

  const s = sound.cloneNode(); // allows overlap
  const master = document.getElementById('master-volume')?.value || 1;
  const sfx    = document.getElementById('sfx-volume')?.value || 1;

  s.volume = master * sfx;
  s.playbackRate = 0.9 + Math.random() * 0.2; // variation
  s.play();
}

// Fix autoplay restriction
document.addEventListener('click', () => {
  Object.values(SFX).forEach(s => {
    s.play().then(() => s.pause()).catch(() => {});
  });
}, { once: true });
