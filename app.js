const games = [
  { name: 'Circle Accuracy', active: true },
  { name: 'Reaction Rush', emoji: '⚡', color: '#ff9b6b' },
  { name: 'Memory Match', emoji: '🧠', color: '#58b9d0' },
  { name: 'Line Sprint', emoji: '📏', color: '#d075c6' },
  { name: 'Color Pop', emoji: '🎨', color: '#86bc68' },
  { name: 'Cup Toss', emoji: '🏓', color: '#e2b656' },
];

const $ = (selector) => document.querySelector(selector);
const screens = document.querySelectorAll('.screen');
const canvas = $('#drawCanvas');
const context = canvas.getContext('2d');
const bestKey = 'orbit-circle-best';
let points = [];
let drawing = false;
let attemptFinished = false;
let startedAt = 0;

const formatPercent = (value) => `${value.toFixed(2)}%`;
const getBest = () => Number(localStorage.getItem(bestKey) || 0);

function show(screenId) {
  screens.forEach((screen) => screen.classList.toggle('active', screen.id === screenId));
  window.scrollTo(0, 0);
}

function renderHome() {
  $('#gameGrid').innerHTML = games.map((game) => game.active
    ? `<button class="game-card circle-card" id="openCircle"><div class="circle-art"></div><h3>${game.name}<small>DRAW TO WIN</small></h3></button>`
    : `<button class="game-card soon" disabled style="--bg:${game.color}"><span class="emoji">${game.emoji}</span><h3>${game.name}<small>COMING SOON</small></h3></button>`).join('');
  $('#openCircle').onclick = startGame;
}

function setCanvasSize() {
  const bounds = canvas.getBoundingClientRect();
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = bounds.width * scale;
  canvas.height = bounds.height * scale;
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = '#f36aa3';
  context.lineWidth = 5;
}

function clearDrawing() {
  points = [];
  attemptFinished = false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  $('#drawHint').textContent = 'Draw a circle around the center dot. Any size is allowed.';
}

function startGame() {
  show('play');
  setCanvasSize();
  clearDrawing();
}

function getPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function beginDrawing(event) {
  if (attemptFinished) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  drawing = true;
  startedAt = performance.now();
  const firstPoint = getPoint(event);
  points = [firstPoint];
  context.beginPath();
  context.moveTo(firstPoint.x, firstPoint.y);
  $('#drawHint').textContent = 'Keep your radius steady, then release to score.';
}

function continueDrawing(event) {
  if (!drawing || attemptFinished) return;
  event.preventDefault();
  const nextPoint = getPoint(event);
  const previousPoint = points[points.length - 1];
  if (Math.hypot(nextPoint.x - previousPoint.x, nextPoint.y - previousPoint.y) < 1.5) return;
  points.push(nextPoint);
  context.lineTo(nextPoint.x, nextPoint.y);
  context.stroke();
}

function endDrawing(event) {
  if (!drawing || attemptFinished) return;
  if (event) event.preventDefault();
  drawing = false;
  attemptFinished = true;
  scoreAttempt(performance.now() - startedAt);
}

/* Scores the player's selected radius from distances to the fixed center dot.
   No target radius is ever stored or compared. */
function scoreCircle(trace, target) {
  if (trace.length < 12) return null;

  const distances = trace.map((point) => Math.hypot(point.x - target.x, point.y - target.y));
  const radius = distances.reduce((sum, distance) => sum + distance, 0) / distances.length;
  if (radius < 16) return null;

  const radiusDeviation = Math.sqrt(distances.reduce((sum, distance) => sum + (distance - radius) ** 2, 0) / distances.length) / radius;
  const closure = Math.hypot(trace[0].x - trace.at(-1).x, trace[0].y - trace.at(-1).y) / radius;

  let signedTravel = 0;
  let previousAngle = Math.atan2(trace[0].y - target.y, trace[0].x - target.x);
  let direction = 0;
  let directionChanges = 0;
  for (let index = 1; index < trace.length; index += 1) {
    const angle = Math.atan2(trace[index].y - target.y, trace[index].x - target.x);
    let delta = angle - previousAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    if (Math.abs(delta) > 0.004) {
      const nextDirection = Math.sign(delta);
      if (direction && nextDirection !== direction) directionChanges += 1;
      direction = nextDirection;
      signedTravel += Math.abs(delta);
    }
    previousAngle = angle;
  }

  const completeness = Math.min(1, signedTravel / (Math.PI * 2));
  const fittedCenter = trace.reduce((total, point) => ({ x: total.x + point.x, y: total.y + point.y }), { x: 0, y: 0 });
  fittedCenter.x /= trace.length;
  fittedCenter.y /= trace.length;
  const centerOffset = Math.hypot(fittedCenter.x - target.x, fittedCenter.y - target.y) / radius;

  // Angle-step variation detects wobbly/reversed strokes without favoring a radius.
  const smoothness = Math.exp(-directionChanges * 0.14) * Math.exp(-radiusDeviation * 0.9);
  const consistency = Math.exp(-4.6 * radiusDeviation);
  const centerAccuracy = Math.exp(-2.9 * centerOffset);
  const completionAccuracy = completeness * Math.exp(-1.8 * closure);
  const score = Math.min(99.92, Math.max(0, 100 * (
    0.42 * consistency + 0.32 * centerAccuracy + 0.18 * completionAccuracy + 0.08 * smoothness
  )));

  return { score, radius, consistency, centerAccuracy, completionAccuracy, centerOffset };
}

function scoreAttempt(duration) {
  const bounds = canvas.getBoundingClientRect();
  const score = scoreCircle(points, { x: bounds.width / 2, y: bounds.height / 2 });
  if (!score) {
    attemptFinished = false;
    $('#drawHint').textContent = 'Draw a complete circle, then release to score.';
    toast('Make one larger, complete loop around the dot.');
    return;
  }
  showResult(score, duration);
}

function resultMessage(score) {
  if (score >= 95) return 'PERFECT! 🔥';
  if (score >= 90) return 'Excellent! 🏆';
  if (score >= 80) return 'Great!';
  if (score >= 70) return 'Good!';
  return 'Keep Practicing!';
}

function resultInsight(data) {
  if (data.centerAccuracy < 0.7) return 'Your circle was slightly off-center from the dot.';
  if (data.completionAccuracy < 0.72) return 'Your circle was consistent, but the loop was incomplete.';
  if (data.consistency < 0.75) return 'Great center placement, but the radius varied.';
  return 'Balanced center placement and a steady radius.';
}

function showResult(data, duration) {
  const previousBest = getBest();
  const isNewBest = data.score > previousBest;
  if (isNewBest) localStorage.setItem(bestKey, data.score.toFixed(2));
  $('#mainScore').textContent = formatPercent(data.score);
  $('#resultMessage').textContent = resultMessage(data.score);
  $('#newBest').classList.toggle('show', isNewBest);
  $('#insight').textContent = resultInsight(data);
  const stats = [
    ['CENTER', formatPercent(data.centerAccuracy * 100)],
    ['CONSISTENCY', formatPercent(data.consistency * 100)],
    ['COMPLETE', formatPercent(data.completionAccuracy * 100)],
    ['RADIUS', `${Math.round(data.radius)} px`],
    ['DRAW TIME', `${(duration / 1000).toFixed(2)} s`],
    ['BEST', formatPercent(Math.max(data.score, previousBest))],
  ];
  $('#statGrid').innerHTML = stats.map(([label, value]) => `<div class="stat"><b>${value}</b><small>${label}</small></div>`).join('');
  drawComparison(data.radius);
  show('results');
}

function drawComparison(radius) {
  const resultCanvas = $('#resultCanvas');
  const resultContext = resultCanvas.getContext('2d');
  const bounds = resultCanvas.getBoundingClientRect();
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  resultCanvas.width = bounds.width * scale;
  resultCanvas.height = bounds.height * scale;
  resultContext.setTransform(scale, 0, 0, scale, 0, 0);
  const sourceWidth = canvas.getBoundingClientRect().width;
  const ratio = bounds.width / sourceWidth;
  const center = bounds.width / 2;
  resultContext.strokeStyle = '#48c8d7';
  resultContext.setLineDash([5, 5]);
  resultContext.lineWidth = 2;
  resultContext.beginPath();
  resultContext.arc(center, center, radius * ratio, 0, Math.PI * 2);
  resultContext.stroke();
  resultContext.setLineDash([]);
  resultContext.strokeStyle = '#f36aa3';
  resultContext.lineWidth = 3;
  resultContext.lineCap = 'round';
  resultContext.lineJoin = 'round';
  resultContext.beginPath();
  points.forEach((point, index) => (index ? resultContext.lineTo(point.x * ratio, point.y * ratio) : resultContext.moveTo(point.x * ratio, point.y * ratio)));
  resultContext.stroke();
}

function toast(message) {
  const notification = $('#toast');
  notification.textContent = message;
  notification.classList.add('show');
  setTimeout(() => notification.classList.remove('show'), 2200);
}

canvas.addEventListener('pointerdown', beginDrawing);
canvas.addEventListener('pointermove', continueDrawing);
canvas.addEventListener('pointerup', endDrawing);
canvas.addEventListener('pointercancel', endDrawing);
canvas.addEventListener('lostpointercapture', endDrawing);
$('#clearCanvas').onclick = clearDrawing;
$('#quitGame').onclick = () => show('home');
$('#retryButton').onclick = startGame;
document.querySelectorAll('[data-go]').forEach((button) => { button.onclick = () => show(button.dataset.go); });
$('#shareButton').onclick = async () => {
  const message = `I scored ${$('#mainScore').textContent} on Circle Accuracy! 🎯 Can you beat me?`;
  try {
    if (navigator.share) await navigator.share({ title: 'Circle Accuracy', text: message, url: location.href });
    else {
      await navigator.clipboard.writeText(message);
      toast('Score copied to clipboard!');
    }
  } catch (error) {
    if (error.name !== 'AbortError') toast('Could not share this score.');
  }
};
$('#statsButton').onclick = () => toast(getBest() ? `Circle Accuracy best: ${formatPercent(getBest())}` : 'Play Circle Accuracy to set a best!');
renderHome();
