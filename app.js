import { MartingaleEngine } from './src/core/martingale.js';

// --- Audio Synthesizer (Web Audio API) ---
let audioCtx = null;
let soundEnabled = true;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playSound(type) {
  if (!soundEnabled) return;
  try {
    initAudio();
    if (!audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'gem') {
      // Short, high-pitched chime for wins
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.08);
      
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } else if (type === 'bomb') {
      // Deep rumbling explosion for losses
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, audioCtx.currentTime);
      osc.frequency.linearRampToValueAtTime(30, audioCtx.currentTime + 0.35);
      
      // Add a bit of noise-like quality by modulating with low frequency
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.18, audioCtx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } else if (type === 'click') {
      // Tiny subtle tick for button interactions or selection
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, audioCtx.currentTime);
      
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.03, audioCtx.currentTime + 0.005);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.03);
    }
  } catch (e) {
    console.error('Audio playback failed', e);
  }
}

// --- App State ---
let engine = null;
let selectedTileIndex = 0; // Default to first tile
let targetMode = 'specific'; // 'specific' or 'random'
let isAutobetting = false;
let runTimeoutId = null;
let speedMode = 3; // 1 to 5

// --- Multi-Session Simulation State ---
let isMultiSessionRunning = false;
let sessionsToRun = 0;
let sessionsCompleted = 0;
let multiSessionData = []; // array of { peakBalance, roundsSurvived }
let multiSessionTimeoutId = null;
let currentMultiSessionEngine = null;
let currentInstantEngine = null;

// --- DOM Elements ---
const elInitialBalance = document.getElementById('initial-balance');
const elBaseBet = document.getElementById('base-bet');
const elGridSize = document.getElementById('grid-size');
const elMinesCount = document.getElementById('mines-count');
const elLossIncrease = document.getElementById('loss-increase');
const elSpeedSlider = document.getElementById('speed-slider');
const elSpeedLabel = document.getElementById('speed-label');
const elTargetMode = document.getElementById('target-mode');
const elSoundToggle = document.getElementById('sound-toggle');

// Buttons
const elBtnStart = document.getElementById('btn-start');
const elBtnPause = document.getElementById('btn-pause');
const elBtnStep = document.getElementById('btn-step');
const elBtnReset = document.getElementById('btn-reset');
const elBtnHalfBet = document.getElementById('btn-half-bet');
const elBtnDoubleBet = document.getElementById('btn-double-bet');

// Display Fields
const elBoardGrid = document.getElementById('board-grid');
const elMultiplierBadge = document.getElementById('multiplier-badge');
const elStatBalance = document.getElementById('stat-balance');
const elStatProfit = document.getElementById('stat-profit');
const elStatBets = document.getElementById('stat-bets');
const elStatWinRate = document.getElementById('stat-win-rate');
const elStatMaxBet = document.getElementById('stat-max-bet');
const elStatLossStreak = document.getElementById('stat-loss-streak');
const elLogsBody = document.getElementById('logs-body');

// Canvas
const elCanvas = document.getElementById('balance-chart');
const ctx = elCanvas.getContext('2d');

// Modal
const elModalOverlay = document.getElementById('modal-overlay');
const elModalClose = document.getElementById('modal-close');
const elModalFinalBalance = document.getElementById('modal-final-balance');
const elModalTotalBets = document.getElementById('modal-total-bets');
const elModalPeakBalance = document.getElementById('modal-peak-balance');
const elModalMaxBet = document.getElementById('modal-max-bet');

// Multi-Session Prompt Modal
const elMultiPromptModal = document.getElementById('multi-session-prompt-modal');
const elMultiCountInput = document.getElementById('multi-session-count');
const elBtnMultiPromptCancel = document.getElementById('btn-multi-prompt-cancel');
const elBtnMultiPromptStart = document.getElementById('btn-multi-prompt-start');

// Multi-Session Summary Modal
const elMultiSummaryModal = document.getElementById('multi-session-summary-modal');
const elSummaryTotalSessions = document.getElementById('summary-total-sessions');
const elSummaryAvgRounds = document.getElementById('summary-avg-rounds');
const elSummaryMaxRounds = document.getElementById('summary-max-rounds');
const elSummaryAvgPeak = document.getElementById('summary-avg-peak');
const elSummaryHighestPeak = document.getElementById('summary-highest-peak');
const elBtnSummaryClose = document.getElementById('btn-summary-close');

// Multi-Session Controls
const elBtnStartMulti = document.getElementById('btn-start-multi');
const elBtnPauseMulti = document.getElementById('btn-pause-multi');

// Detail Modal
const elChartDetailModal = document.getElementById('chart-detail-modal');
const elBtnDetailClose = document.getElementById('btn-detail-close');
const elDetailModalTitle = document.getElementById('detail-modal-title');
const elDetailModalTabs = document.getElementById('detail-modal-tabs');
const elDetailHistogramsWrapper = document.getElementById('detail-histograms-wrapper');
const elDetailLineWrapper = document.getElementById('detail-line-wrapper');
const elDetailStatsPanel = document.getElementById('detail-stats-panel');
const elDetailLineCanvas = document.getElementById('detail-line-canvas');
const elDetailLineCtx = elDetailLineCanvas.getContext('2d');
const elDetailCDFCanvas = document.getElementById('detail-cdf-canvas');
const elDetailCDFCtx = elDetailCDFCanvas.getContext('2d');

// Profit Book
const elProfitBook = document.getElementById('profit-book');
const elProfitBookModal = document.getElementById('profit-book-modal');
const elBtnPBModalClose = document.getElementById('btn-pb-modal-close');

// --- Profit Book Helper ---
function getProfitBookTarget() {
  const val = parseFloat(elProfitBook.value);
  return (isNaN(val) || val <= 0) ? null : val;
}

function showProfitBookModal(balance, initialBal, rounds, target) {
  playSound('gem');
  document.getElementById('pb-modal-balance').textContent = `₹${balance.toFixed(2)}`;
  const profit = balance - initialBal;
  const profitEl = document.getElementById('pb-modal-profit');
  profitEl.textContent = `${profit >= 0 ? '+' : ''}₹${profit.toFixed(2)}`;
  profitEl.style.color = profit >= 0 ? 'var(--color-green)' : 'var(--color-red)';
  document.getElementById('pb-modal-rounds').textContent = rounds.toLocaleString();
  document.getElementById('pb-modal-target').textContent = `₹${target.toFixed(2)}`;
  elProfitBookModal.style.display = 'flex';
}

elBtnPBModalClose.addEventListener('click', () => {
  playSound('click');
  elProfitBookModal.style.display = 'none';
});

// Close on backdrop click
elProfitBookModal.addEventListener('click', (e) => {
  if (e.target === elProfitBookModal) {
    elProfitBookModal.style.display = 'none';
  }
});

// --- Helper Functions ---
function getMin(arr) {
  if (!arr || arr.length === 0) return 0;
  let m = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] < m) m = arr[i];
  }
  return m;
}

function getMax(arr) {
  if (!arr || arr.length === 0) return 0;
  let m = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > m) m = arr[i];
  }
  return m;
}

function getSpeedMs() {
  // Speed 1: 1000ms, Speed 2: 450ms, Speed 3: 150ms, Speed 4: 30ms, Speed 5: 0ms (Instant/Asynchronous)
  switch (speedMode) {
    case 1: return 1000;
    case 2: return 450;
    case 3: return 150;
    case 4: return 30;
    case 5: return 0;
    default: return 150;
  }
}

function updateSpeedLabel() {
  const speeds = ['1 bet/s', '2.2 bets/s', '6.6 bets/s', '33 bets/s', 'Instant (Max Speed)'];
  elSpeedLabel.textContent = speeds[speedMode - 1];
}

function updateBaseMultiplier() {
  const gridN = parseInt(elGridSize.value) || 5;
  const mines = parseInt(elMinesCount.value) || 3;
  const T = gridN * gridN;
  
  // Cap mines limit
  if (mines >= T) {
    elMinesCount.value = T - 1;
  }
  if (mines < 1) {
    elMinesCount.value = 1;
  }

  const cleanMines = parseInt(elMinesCount.value) || 1;
  
  // Calculate multiplier: 0.99 * T / (T - M)
  const mult = 0.99 * T / (T - cleanMines);
  elMultiplierBadge.textContent = `${mult.toFixed(4)}x`;
}

// --- Grid Renderers ---
function rebuildGrid() {
  const gridN = parseInt(elGridSize.value) || 5;
  elBoardGrid.innerHTML = '';
  elBoardGrid.style.gridTemplateColumns = `repeat(${gridN}, 1fr)`;
  
  const total = gridN * gridN;
  if (selectedTileIndex >= total) {
    selectedTileIndex = 0;
  }

  for (let i = 0; i < total; i++) {
    const tile = document.createElement('div');
    tile.classList.add('tile');
    tile.dataset.index = i;
    
    // Index indicator
    const overlay = document.createElement('span');
    overlay.classList.add('tile-index');
    overlay.textContent = i + 1;
    tile.appendChild(overlay);

    // Target Selection indicator
    if (targetMode === 'specific' && selectedTileIndex === i) {
      tile.classList.add('target-selected');
    }

    tile.addEventListener('click', () => {
      if (isAutobetting) return; // Lock during simulation
      playSound('click');
      
      // If we are in random mode, switch to specific tile mode on click
      if (targetMode === 'random') {
        targetMode = 'specific';
        elTargetMode.value = 'specific';
      }

      selectedTileIndex = i;
      document.querySelectorAll('.tile').forEach(t => t.classList.remove('target-selected'));
      tile.classList.add('target-selected');
    });

    elBoardGrid.appendChild(tile);
  }
}

function renderRoundOutcome(outcome) {
  const tiles = document.querySelectorAll('.tile');
  
  // First clear any previous outcome class
  tiles.forEach(tile => {
    tile.classList.remove('revealed-gem', 'revealed-bomb', 'revealed-unclicked-bomb');
    const existingIcon = tile.querySelector('.tile-icon');
    if (existingIcon) existingIcon.remove();
  });

  const selectedIdx = outcome.selectedTileIndex;
  
  // Highlight the clicked tile
  const clickedTile = tiles[selectedIdx];
  if (clickedTile) {
    const icon = document.createElement('span');
    icon.classList.add('tile-icon');
    
    if (outcome.isMine) {
      clickedTile.classList.add('revealed-bomb');
      icon.textContent = '💣';
      playSound('bomb');
    } else {
      clickedTile.classList.add('revealed-gem');
      icon.textContent = '💎';
      playSound('gem');
    }
    clickedTile.appendChild(icon);
  }

  // At speeds 1-3, reveal all other mines on the board for a authentic feel
  if (speedMode <= 3) {
    outcome.mines.forEach(mineIdx => {
      if (mineIdx !== selectedIdx) {
        const mineTile = tiles[mineIdx];
        if (mineTile) {
          mineTile.classList.add('revealed-unclicked-bomb');
          const icon = document.createElement('span');
          icon.classList.add('tile-icon');
          icon.style.fontSize = '16px';
          icon.textContent = '💣';
          mineTile.appendChild(icon);
        }
      }
    });
  }
}

function clearBoardOutcomes() {
  const tiles = document.querySelectorAll('.tile');
  tiles.forEach(tile => {
    tile.classList.remove('revealed-gem', 'revealed-bomb', 'revealed-unclicked-bomb');
    const existingIcon = tile.querySelector('.tile-icon');
    if (existingIcon) existingIcon.remove();

    const i = parseInt(tile.dataset.index);
    if (targetMode === 'specific' && selectedTileIndex === i) {
      tile.classList.add('target-selected');
    } else {
      tile.classList.remove('target-selected');
    }
  });
}

// --- Canvas Chart Renderer ---
function drawChart(targetCanvas = elCanvas, targetCtx = ctx) {
  const ctx = targetCtx; // Shadow global ctx inside function scope
  const width = targetCanvas.clientWidth;
  const height = targetCanvas.clientHeight;
  
  // Set canvas coordinate size with pixel ratio for crisp text/lines
  const dpr = window.devicePixelRatio || 1;
  targetCanvas.width = width * dpr;
  targetCanvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = '#0f212e';
  ctx.fillRect(0, 0, width, height);

  if (!engine) return;

  const data = engine.history;
  const n = data.length;
  if (n === 0) return;

  // Find min and max
  let min = getMin(data);
  let max = getMax(data);
  
  // Force include starting balance
  const initial = engine.initialBalance;
  min = Math.min(min, initial);
  max = Math.max(max, initial);

  // Add 10% padding
  const range = max - min;
  const padding = range === 0 ? 10 : range * 0.1;
  const yMin = min - padding;
  const yMax = max + padding;
  const yRange = yMax - yMin;

  // Grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = 15 + ((height - 30) * i) / gridLines;
    ctx.beginPath();
    ctx.moveTo(50, y);
    ctx.lineTo(width - 15, y);
    ctx.stroke();
    
    // Labels
    ctx.fillStyle = '#b1b6c0';
    ctx.font = '9px "Fira Code", monospace';
    ctx.textAlign = 'right';
    const val = yMax - (yRange * i) / gridLines;
    ctx.fillText(val.toFixed(2), 42, y + 3);
  }

  // Draw initial balance baseline (dashed)
  const initialY = 15 + (height - 30) * (1 - (initial - yMin) / yRange);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(50, initialY);
  ctx.lineTo(width - 15, initialY);
  ctx.stroke();
  ctx.setLineDash([]); // Reset line dash

  // Downsample data if too large for rendering performance
  const maxPoints = 400;
  let points = [];
  if (n <= maxPoints) {
    for (let i = 0; i < n; i++) {
      points.push({
        x: 50 + ((width - 65) * i) / Math.max(1, n - 1),
        y: 15 + (height - 30) * (1 - (data[i] - yMin) / yRange),
        val: data[i]
      });
    }
  } else {
    // Downsample using bucket averages
    const bucketSize = n / maxPoints;
    for (let i = 0; i < maxPoints; i++) {
      const startIdx = Math.floor(i * bucketSize);
      const endIdx = Math.min(n, Math.floor((i + 1) * bucketSize));
      let sum = 0;
      for (let j = startIdx; j < endIdx; j++) {
        sum += data[j];
      }
      const avgVal = sum / (endIdx - startIdx);
      points.push({
        x: 50 + ((width - 65) * i) / (maxPoints - 1),
        y: 15 + (height - 30) * (1 - (avgVal - yMin) / yRange),
        val: avgVal
      });
    }
  }

  if (points.length < 2) return;

  targetCanvas.renderedPoints = points; // Export points for tooltip guide line

  // Path outline
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  
  // Select color: Green if positive net profit, Red if negative
  const currentProfit = data[n - 1] - initial;
  const strokeColor = currentProfit >= 0 ? '#00e5a3' : '#ff3860';
  const glowColor = currentProfit >= 0 ? 'rgba(0, 229, 163, 0.07)' : 'rgba(255, 56, 96, 0.07)';
  
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Fill gradient below path
  ctx.lineTo(points[points.length - 1].x, height - 15);
  ctx.lineTo(points[0].x, height - 15);
  ctx.closePath();
  
  const grad = ctx.createLinearGradient(0, 15, 0, height - 15);
  grad.addColorStop(0, glowColor);
  grad.addColorStop(1, 'rgba(15, 33, 46, 0)');
  ctx.fillStyle = grad;
  ctx.fill();
}

// --- UI Updates ---
function updateStatsUI() {
  if (!engine) return;

  elStatBalance.textContent = `₹${engine.balance.toFixed(2)}`;
  
  const profit = engine.stats.netProfit;
  elStatProfit.textContent = `${profit >= 0 ? '+' : ''}₹${profit.toFixed(2)}`;
  elStatProfit.className = `stat-value mono ${profit >= 0 ? 'win' : 'loss'}`;

  elStatBets.textContent = engine.stats.totalBets;
  
  const totalRounds = engine.stats.totalWins + engine.stats.totalLosses;
  const rate = totalRounds > 0 ? (engine.stats.totalWins / totalRounds) * 100 : 0;
  elStatWinRate.textContent = `${rate.toFixed(1)}%`;

  elStatMaxBet.textContent = `₹${engine.stats.maxBet.toFixed(2)}`;
  elStatLossStreak.textContent = `${engine.stats.currentLossStreak} / ${engine.stats.maxLossStreak}`;
}

function appendLog(outcome) {
  const row = document.createElement('tr');
  
  const cellBetNum = document.createElement('td');
  cellBetNum.textContent = `#${engine.stats.totalBets}`;
  
  const cellBetSize = document.createElement('td');
  cellBetSize.textContent = `₹${outcome.betAmount.toFixed(2)}`;
  
  const cellTile = document.createElement('td');
  cellTile.textContent = outcome.selectedTileIndex + 1;
  
  const cellResult = document.createElement('td');
  cellResult.className = outcome.isMine ? 'text-loss' : 'text-win';
  cellResult.textContent = outcome.isMine ? 'Loss (Mine)' : 'Win (Gem)';
  
  const cellPayout = document.createElement('td');
  cellPayout.textContent = outcome.isMine ? '0.00x' : `${outcome.multiplier.toFixed(2)}x`;
  
  const cellProfit = document.createElement('td');
  cellProfit.className = outcome.profit >= 0 ? 'text-win' : 'text-loss';
  cellProfit.textContent = `${outcome.profit >= 0 ? '+' : ''}₹${outcome.profit.toFixed(2)}`;

  row.appendChild(cellBetNum);
  row.appendChild(cellBetSize);
  row.appendChild(cellTile);
  row.appendChild(cellResult);
  row.appendChild(cellPayout);
  row.appendChild(cellProfit);

  elLogsBody.insertBefore(row, elLogsBody.firstChild);

  // Cap logs display list at 15 for DOM efficiency
  if (elLogsBody.children.length > 15) {
    elLogsBody.removeChild(elLogsBody.lastChild);
  }
}

function showBankruptcyModal() {
  if (!engine) return;
  playSound('bomb');

  elModalFinalBalance.textContent = `₹${engine.balance.toFixed(2)}`;
  elModalTotalBets.textContent = engine.stats.totalBets;
  
  // Find peak balance
  const peak = getMax(engine.history);
  elModalPeakBalance.textContent = `₹${peak.toFixed(2)}`;
  elModalMaxBet.textContent = `₹${engine.stats.maxBet.toFixed(2)}`;

  elModalOverlay.style.display = 'flex';
}

function lockSettings(lock) {
  elInitialBalance.disabled = lock;
  elBaseBet.disabled = lock;
  elGridSize.disabled = lock;
  elMinesCount.disabled = lock;
  elLossIncrease.disabled = lock;
  elTargetMode.disabled = lock;
  elProfitBook.disabled = lock;
  
  elBtnHalfBet.disabled = lock;
  elBtnDoubleBet.disabled = lock;
  elBtnStep.disabled = lock;
}

// --- Simulation Logic ---
function initSimulation() {
  if (engine) return;

  const R = parseFloat(elInitialBalance.value) || 1000;
  const B = parseFloat(elBaseBet.value) || 1;
  const N = parseInt(elGridSize.value) || 5;
  const M = parseInt(elMinesCount.value) || 3;
  const P = parseFloat(elLossIncrease.value) || 100;

  engine = new MartingaleEngine({
    initialBalance: R,
    baseBet: B,
    gridSize: N,
    minesCount: M,
    increaseOnLossPercent: P
  });

  elLogsBody.innerHTML = '';
  clearBoardOutcomes();
}

function runAutobetStep() {
  if (!isAutobetting || !engine) return;

  // Decide clicked tile based on target setting
  let clickedTile = selectedTileIndex;
  if (targetMode === 'random') {
    const totalTiles = engine.totalTiles;
    clickedTile = Math.floor(Math.random() * totalTiles);
    
    // At slower speeds, show where the random cursor lands before reveal
    if (speedMode <= 3) {
      document.querySelectorAll('.tile').forEach(t => t.classList.remove('target-selected'));
      const activeTile = document.querySelector(`.tile[data-index="${clickedTile}"]`);
      if (activeTile) activeTile.classList.add('target-selected');
    }
  }

  // Play round
  const outcome = engine.playRound(clickedTile);

  if (outcome.error) {
    stopAutobet();
    if (outcome.isBankrupt) {
      showBankruptcyModal();
    }
    return;
  }

  // UI Updates
  updateStatsUI();
  appendLog(outcome);

  // --- Profit Book Check ---
  const pbTarget = getProfitBookTarget();
  if (pbTarget !== null && engine.balance >= pbTarget) {
    drawChart();
    stopAutobet();
    showProfitBookModal(engine.balance, engine.initialBalance, engine.stats.totalBets, pbTarget);
    return;
  }

  if (speedMode === 5) {
    // Instant mode - run in batches without visual rendering delays
    // Redraw graph and board values at 60fps instead of each step
    if (outcome.isBankrupt) {
      stopAutobet();
      drawChart();
      showBankruptcyModal();
      return;
    }
    
    // Queue next immediate step
    runTimeoutId = setTimeout(runAutobetStep, 0);
  } else {
    // Visual mode - show board details and wait for timeout
    renderRoundOutcome(outcome);
    drawChart();

    if (outcome.isBankrupt) {
      stopAutobet();
      setTimeout(showBankruptcyModal, getSpeedMs());
      return;
    }

    runTimeoutId = setTimeout(() => {
      clearBoardOutcomes();
      runAutobetStep();
    }, getSpeedMs());
  }
}

// In instant mode, we can batch run bets to speed up massive runs
function runInstantBatch() {
  if (!isAutobetting || !engine || speedMode !== 5) return;

  const batchSize = 100; // process 100 rounds per frame
  for (let i = 0; i < batchSize; i++) {
    let clickedTile = selectedTileIndex;
    if (targetMode === 'random') {
      clickedTile = Math.floor(Math.random() * engine.totalTiles);
    }
    
    const outcome = engine.playRound(clickedTile);
    if (outcome.error || outcome.isBankrupt) {
      updateStatsUI();
      appendLog(outcome);
      drawChart();
      stopAutobet();
      showBankruptcyModal();
      return;
    }

    // --- Profit Book Check (batch mode) ---
    const pbTarget = getProfitBookTarget();
    if (pbTarget !== null && engine.balance >= pbTarget) {
      updateStatsUI();
      drawChart();
      stopAutobet();
      showProfitBookModal(engine.balance, engine.initialBalance, engine.stats.totalBets, pbTarget);
      return;
    }

    // Only log occasionally in batch for speed, but log the final one
    if (i === batchSize - 1 || engine.stats.totalBets % 50 === 0) {
      appendLog(outcome);
    }
  }

  updateStatsUI();
  drawChart();

  runTimeoutId = requestAnimationFrame(runInstantBatch);
}

function startAutobet() {
  if (isAutobetting) return;

  initSimulation();

  isAutobetting = true;
  elBtnStart.style.display = 'none';
  elBtnPause.style.display = 'inline-block';
  lockSettings(true);

  if (speedMode === 5) {
    runInstantBatch();
  } else {
    runAutobetStep();
  }
}

function stopAutobet() {
  if (!isAutobetting) return;

  isAutobetting = false;
  elBtnStart.style.display = 'inline-block';
  elBtnPause.style.display = 'none';

  if (runTimeoutId) {
    if (speedMode === 5) {
      cancelAnimationFrame(runTimeoutId);
    } else {
      clearTimeout(runTimeoutId);
    }
    runTimeoutId = null;
  }

  lockSettings(false);
  clearBoardOutcomes();
}

function stepBet() {
  if (isAutobetting) return;

  initSimulation();
  
  let clickedTile = selectedTileIndex;
  if (targetMode === 'random') {
    clickedTile = Math.floor(Math.random() * engine.totalTiles);
  }

  const outcome = engine.playRound(clickedTile);

  if (outcome.error) {
    if (outcome.isBankrupt) {
      showBankruptcyModal();
    }
    return;
  }

  renderRoundOutcome(outcome);
  updateStatsUI();
  appendLog(outcome);
  drawChart();

  if (outcome.isBankrupt) {
    setTimeout(showBankruptcyModal, 800);
  }
}

function resetSimulation() {
  stopAutobet();
  engine = null;
  
  clearBoardOutcomes();
  elLogsBody.innerHTML = '';
  
  elStatBalance.textContent = '₹0.00';
  elStatProfit.textContent = '₹0.00';
  elStatProfit.className = 'stat-value mono';
  elStatBets.textContent = '0';
  elStatWinRate.textContent = '0.0%';
  elStatMaxBet.textContent = '₹0.00';
  elStatLossStreak.textContent = '0 / 0';
  
  // Clear Canvas
  ctx.clearRect(0, 0, elCanvas.width, elCanvas.height);
  
  // Re-draw base grid
  rebuildGrid();
  clearHistograms();
}

// --- Histogram Calculations & Renderer ---
function drawHistogram(canvasId, dataValues, title, color, isLog = true, numBins = 10) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctxHist = canvas.getContext('2d');
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctxHist.scale(dpr, dpr);

  // Background
  ctxHist.fillStyle = '#0f212e';
  ctxHist.fillRect(0, 0, width, height);

  // Draw Title
  ctxHist.fillStyle = '#b1b6c0';
  ctxHist.font = 'bold 11px "Inter", sans-serif';
  ctxHist.textAlign = 'left';
  ctxHist.fillText(title + (isLog ? ' (Log Scale)' : ''), 12, 18);

  if (dataValues.length === 0) {
    ctxHist.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctxHist.font = '12px "Inter", sans-serif';
    ctxHist.textAlign = 'center';
    ctxHist.fillText('Waiting for data...', width / 2, height / 2);
    return;
  }

  // numBins is passed as parameter
  let min = getMin(dataValues);
  let max = getMax(dataValues);
  if (min === max) {
    min = Math.max(0, min - 10);
    max = max + 10;
  }

  const bins = [];
  const isCurrency = title.toLowerCase().includes('amount') || title.toLowerCase().includes('balance');

  if (isLog) {
    if (isCurrency && engine) {
      // For peak balances, log-scale the profit offset: peakBalance - initialBalance
      const initial = engine.initialBalance;
      const logMin = 0; // log10(0 + 1)
      const logMax = Math.log10(Math.max(1.1, max - initial + 1));
      const logStep = (logMax - logMin) / numBins;
      
      for (let i = 0; i < numBins; i++) {
        const startProfit = Math.pow(10, logMin + i * logStep) - 1;
        const endProfit = Math.pow(10, logMin + (i + 1) * logStep) - 1;
        bins.push({
          start: initial + startProfit,
          end: initial + endProfit,
          count: 0
        });
      }

      // Group values into bins
      for (const val of dataValues) {
        const profit = Math.max(0, val - initial);
        let binIdx = Math.floor(Math.log10(profit + 1) / logStep);
        if (binIdx >= numBins) binIdx = numBins - 1;
        if (binIdx < 0) binIdx = 0;
        bins[binIdx].count++;
      }
    } else {
      // For rounds survived, standard log scaling starting from min rounds (min 1)
      const logMin = Math.log10(Math.max(1, min));
      const logMax = Math.log10(Math.max(1.1, max));
      const logStep = (logMax - logMin) / numBins;

      for (let i = 0; i < numBins; i++) {
        bins.push({
          start: Math.pow(10, logMin + i * logStep),
          end: Math.pow(10, logMin + (i + 1) * logStep),
          count: 0
        });
      }

      // Group values into bins
      for (const val of dataValues) {
        const cleanVal = Math.max(1, val);
        let binIdx = Math.floor((Math.log10(cleanVal) - logMin) / logStep);
        if (binIdx >= numBins) binIdx = numBins - 1;
        if (binIdx < 0) binIdx = 0;
        bins[binIdx].count++;
      }
    }
  } else {
    // Linear scale (fallback)
    const range = max - min;
    const binWidth = range / numBins;
    for (let i = 0; i < numBins; i++) {
      bins.push({
        start: min + i * binWidth,
        end: min + (i + 1) * binWidth,
        count: 0
      });
    }
    for (const val of dataValues) {
      let binIdx = Math.floor((val - min) / binWidth);
      if (binIdx >= numBins) binIdx = numBins - 1;
      if (binIdx < 0) binIdx = 0;
      bins[binIdx].count++;
    }
  }

  const maxCount = Math.max(getMax(bins.map(b => b.count)), 1);

  // Chart Layout Metrics — extra bottom margin for rotated labels
  const isDetailCanvas = (canvasId === 'detail-linear-canvas' || canvasId === 'detail-log-canvas');
  const marginL = 52;
  const marginR = 18;
  const marginT = 36;
  const marginB = isDetailCanvas ? 70 : 32;  // tall bottom for rotated labels
  const graphWidth = width - marginL - marginR;
  const graphHeight = height - marginT - marginB;

  // Horizontal Grid Lines & Y Axis Labels
  const gridLines = 5;
  for (let i = 0; i <= gridLines; i++) {
    const y = marginT + (graphHeight * i) / gridLines;
    ctxHist.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctxHist.lineWidth = 1;
    ctxHist.beginPath();
    ctxHist.moveTo(marginL, y);
    ctxHist.lineTo(width - marginR, y);
    ctxHist.stroke();

    ctxHist.fillStyle = '#8b9ba5';
    ctxHist.font = '9px "Fira Code", monospace';
    ctxHist.textAlign = 'right';
    const countVal = Math.round(maxCount - (maxCount * i) / gridLines);
    // Abbreviate large counts
    const countLabel = countVal >= 1000 ? (countVal / 1000).toFixed(1) + 'k' : String(countVal);
    ctxHist.fillText(countLabel, marginL - 7, y + 3);
  }

  // Y-Axis title
  ctxHist.save();
  ctxHist.translate(12, marginT + graphHeight / 2);
  ctxHist.rotate(-Math.PI / 2);
  ctxHist.fillStyle = '#5a6a75';
  ctxHist.font = '9px "Inter", sans-serif';
  ctxHist.textAlign = 'center';
  ctxHist.fillText('Frequency', 0, 0);
  ctxHist.restore();

  // Draw Histogram Bars
  const barMargin = numBins > 15 ? 0.8 : 1.5;
  const totalBarSpace = graphWidth / numBins;

  for (let i = 0; i < numBins; i++) {
    const count = bins[i].count;
    if (count === 0) continue;

    const xCenter = marginL + (i + 0.5) * totalBarSpace;
    const xStart = marginL + i * totalBarSpace + barMargin;
    const xEnd = marginL + (i + 1) * totalBarSpace - barMargin;
    const barW = xEnd - xStart;
    const barH = (count / maxCount) * graphHeight;
    const yStart = height - marginB - barH;

    const grad = ctxHist.createLinearGradient(0, yStart, 0, height - marginB);
    grad.addColorStop(0, color);
    grad.addColorStop(1, color.replace(')', ', 0.15)').replace('rgb', 'rgba').replace('#', 'rgba(').split('rgba(')[0] + color + '26');
    // simpler: just use opacity trick
    ctxHist.globalAlpha = 0.85;
    ctxHist.fillStyle = color;
    ctxHist.fillRect(xStart, yStart, barW, barH);
    ctxHist.globalAlpha = 1;

    // Subtle inner glow top edge
    ctxHist.strokeStyle = color;
    ctxHist.lineWidth = 1.5;
    ctxHist.strokeRect(xStart, yStart, barW, barH);

    // Count label on tall bars (only if bar is wide enough)
    if (barW >= 14 && count > 0) {
      ctxHist.fillStyle = '#ffffff';
      ctxHist.font = `${barW > 22 ? 9 : 7}px "Fira Code", monospace`;
      ctxHist.textAlign = 'center';
      const label = count >= 1000 ? (count / 1000).toFixed(1) + 'k' : String(count);
      if (barH > 14) {
        ctxHist.fillText(label, xCenter, yStart - 3);
      }
    }
  }

  // Draw X Axis — every bar gets a label, rotated 45° for detail canvases
  ctxHist.fillStyle = '#7a8a96';
  const fontSize = isDetailCanvas ? 9 : 8;
  ctxHist.font = `${fontSize}px "Fira Code", monospace`;

  const skipEvery = isDetailCanvas ? 1 : 2;  // label every bar in detail mode
  const bottomLineY = height - marginB + 6;

  // Axis baseline
  ctxHist.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctxHist.lineWidth = 1;
  ctxHist.beginPath();
  ctxHist.moveTo(marginL, height - marginB);
  ctxHist.lineTo(width - marginR, height - marginB);
  ctxHist.stroke();

  for (let i = 0; i < numBins; i++) {
    if (i % skipEvery !== 0) continue;
    const xCenter = marginL + (i + 0.5) * totalBarSpace;
    const val = bins[i].start;
    const displayVal = isCurrency ? '₹' + formatShort(val) : formatShort(val);

    // Tick mark
    ctxHist.strokeStyle = 'rgba(255,255,255,0.15)';
    ctxHist.lineWidth = 1;
    ctxHist.beginPath();
    ctxHist.moveTo(xCenter, height - marginB);
    ctxHist.lineTo(xCenter, height - marginB + 4);
    ctxHist.stroke();

    if (isDetailCanvas) {
      ctxHist.save();
      ctxHist.translate(xCenter, bottomLineY + 2);
      ctxHist.rotate(-Math.PI / 4);
      ctxHist.textAlign = 'right';
      ctxHist.fillStyle = '#7a8a96';
      ctxHist.fillText(displayVal, 0, 0);
      ctxHist.restore();
    } else {
      ctxHist.textAlign = 'center';
      ctxHist.fillText(displayVal, xCenter, height - 8);
    }
  }

  // Always label the last bin's end boundary
  const lastX = marginL + numBins * totalBarSpace;
  const lastVal = bins[numBins - 1].end;
  const displayLastVal = isCurrency ? '₹' + formatShort(lastVal) : formatShort(lastVal);
  if (isDetailCanvas) {
    ctxHist.save();
    ctxHist.translate(lastX, bottomLineY + 2);
    ctxHist.rotate(-Math.PI / 4);
    ctxHist.textAlign = 'right';
    ctxHist.fillStyle = '#9aabb5';
    ctxHist.fillText(displayLastVal, 0, 0);
    ctxHist.restore();
  } else {
    ctxHist.textAlign = 'center';
    ctxHist.fillText(displayLastVal, lastX, height - 8);
  }
}

function formatShort(val) {
  if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
  if (val >= 1000) return (val / 1000).toFixed(1) + 'k';
  return val.toFixed(0);
}

function drawHistograms() {
  const peakValues = multiSessionData.map(d => d.peakBalance);
  const survivalValues = multiSessionData.map(d => d.roundsSurvived);
  
  drawHistogram('peak-balance-histogram', peakValues, 'Max Amount Reached Frequency', '#00e5a3');
  drawHistogram('survival-histogram', survivalValues, 'Rounds Survived Frequency', '#2f80ed');
}

function clearHistograms() {
  drawHistogram('peak-balance-histogram', [], 'Max Amount Reached Frequency', '#00e5a3');
  drawHistogram('survival-histogram', [], 'Rounds Survived Frequency', '#2f80ed');
}

const ROUND_CHECKPOINTS = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

// --- Multi-Session Simulation Loop ---
function runMultiSessionLoop() {
  if (!isMultiSessionRunning) return;

  const R = parseFloat(elInitialBalance.value) || 1000;
  const B = parseFloat(elBaseBet.value) || 1;
  const N = parseInt(elGridSize.value) || 5;
  const M = parseInt(elMinesCount.value) || 3;
  const P = parseFloat(elLossIncrease.value) || 100;

  if (speedMode === 5) {
    // Instant mode - process bets in batches per frame to prevent blocking the main thread
    const betsPerFrame = 10000;
    let betsPlacedInFrame = 0;
    
    while (betsPlacedInFrame < betsPerFrame && sessionsCompleted < sessionsToRun) {
      if (!currentInstantEngine) {
        currentInstantEngine = new MartingaleEngine({
          initialBalance: R,
          baseBet: B,
          gridSize: N,
          minesCount: M,
          increaseOnLossPercent: P,
          storeHistory: true // Store history so we can draw the live line chart for the active run!
        });
        currentInstantEngine.checkpointBalances = {};
        for (const cp of ROUND_CHECKPOINTS) {
          currentInstantEngine.checkpointBalances[cp] = 0;
        }
        engine = currentInstantEngine;
      }

      // Play a round
      let clickedTile = selectedTileIndex;
      if (targetMode === 'random') {
        clickedTile = Math.floor(Math.random() * currentInstantEngine.totalTiles);
      }
      currentInstantEngine.playRound(clickedTile);
      betsPlacedInFrame++;

      const rounds = currentInstantEngine.stats.totalBets;
      if (ROUND_CHECKPOINTS.includes(rounds)) {
        currentInstantEngine.checkpointBalances[rounds] = currentInstantEngine.balance;
      }

      if (currentInstantEngine.stats.isBankrupt) {
        // Record results
        const peak = currentInstantEngine.stats.peakBalance;
        const survived = currentInstantEngine.stats.totalBets;
        multiSessionData.push({ 
          peakBalance: peak, 
          roundsSurvived: survived,
          checkpointBalances: currentInstantEngine.checkpointBalances
        });
        sessionsCompleted++;
        
        // Reset current engine so the next loop iteration starts a new session
        currentInstantEngine = null;
        continue;
      }

      // --- Profit Book Check (multi-session instant mode) ---
      const pbTargetInst = getProfitBookTarget();
      if (pbTargetInst !== null && currentInstantEngine.balance >= pbTargetInst) {
        // Record this successful session before stopping
        const peak = currentInstantEngine.stats.peakBalance;
        const survived = currentInstantEngine.stats.totalBets;
        multiSessionData.push({
          peakBalance: peak,
          roundsSurvived: survived,
          checkpointBalances: currentInstantEngine.checkpointBalances
        });
        sessionsCompleted++;

        updateStatsUI();
        drawChart();
        drawHistograms();
        stopMultiSession();
        showProfitBookModal(currentInstantEngine.balance, currentInstantEngine.initialBalance, survived, pbTargetInst);
        return;
      }
    }

    // Update UI and graphs
    updateStatsUI();
    drawChart();
    drawHistograms();

    elStatBalance.textContent = `Runs: ${sessionsCompleted} / ${sessionsToRun}`;

    if (sessionsCompleted >= sessionsToRun) {
      stopMultiSession();
      showMultiSessionSummary();
    } else {
      multiSessionTimeoutId = requestAnimationFrame(runMultiSessionLoop);
    }
  } else {
    // Visual mode - run the active session bet-by-bet
    if (!currentMultiSessionEngine || currentMultiSessionEngine.stats.isBankrupt) {
      currentMultiSessionEngine = new MartingaleEngine({
        initialBalance: R,
        baseBet: B,
        gridSize: N,
        minesCount: M,
        increaseOnLossPercent: P,
        storeHistory: true
      });
      engine = currentMultiSessionEngine;
      clearBoardOutcomes();
    }

    let clickedTile = selectedTileIndex;
    if (targetMode === 'random') {
      clickedTile = Math.floor(Math.random() * engine.totalTiles);
    }
    
    const outcome = engine.playRound(clickedTile);

    updateStatsUI();
    appendLog(outcome);
    renderRoundOutcome(outcome);
    drawChart();

    // --- Profit Book Check (multi-session visual mode) ---
    const pbTargetVis = getProfitBookTarget();
    if (pbTargetVis !== null && engine.balance >= pbTargetVis) {
      const peak = engine.stats.peakBalance;
      const survived = engine.stats.totalBets;
      const checkpointBalances = {};
      for (const cp of ROUND_CHECKPOINTS) {
        checkpointBalances[cp] = (cp <= survived && cp < engine.history.length) ? engine.history[cp] : 0;
      }
      multiSessionData.push({ peakBalance: peak, roundsSurvived: survived, checkpointBalances });
      sessionsCompleted++;
      drawHistograms();
      stopMultiSession();
      showProfitBookModal(engine.balance, engine.initialBalance, survived, pbTargetVis);
      return;
    }

    if (outcome.isBankrupt) {
      // Completed this session
      const peak = engine.stats.peakBalance;
      const survived = engine.stats.totalBets;
      
      const checkpointBalances = {};
      for (const cp of ROUND_CHECKPOINTS) {
        if (cp <= survived && cp < engine.history.length) {
          checkpointBalances[cp] = engine.history[cp];
        } else {
          checkpointBalances[cp] = 0;
        }
      }

      multiSessionData.push({ 
        peakBalance: peak, 
        roundsSurvived: survived,
        checkpointBalances: checkpointBalances
      });
      sessionsCompleted++;
      drawHistograms();

      if (sessionsCompleted >= sessionsToRun) {
        stopMultiSession();
        setTimeout(showMultiSessionSummary, getSpeedMs());
        return;
      }
    }

    multiSessionTimeoutId = setTimeout(() => {
      if (outcome.isBankrupt) {
        clearBoardOutcomes();
      }
      runMultiSessionLoop();
    }, getSpeedMs());
  }
}

function startMultiSession() {
  if (isMultiSessionRunning) return;

  multiSessionData = [];
  sessionsCompleted = 0;
  currentMultiSessionEngine = null;
  currentInstantEngine = null;

  isMultiSessionRunning = true;
  elBtnStartMulti.style.display = 'none';
  elBtnPauseMulti.style.display = 'inline-block';
  elBtnStart.disabled = true;
  lockSettings(true);

  elLogsBody.innerHTML = '';
  clearBoardOutcomes();
  clearHistograms();

  runMultiSessionLoop();
}

function stopMultiSession() {
  if (!isMultiSessionRunning) return;

  isMultiSessionRunning = false;
  elBtnStartMulti.style.display = 'inline-block';
  elBtnPauseMulti.style.display = 'none';
  elBtnStart.disabled = false;
  lockSettings(false);

  if (multiSessionTimeoutId) {
    if (speedMode === 5) {
      cancelAnimationFrame(multiSessionTimeoutId);
    } else {
      clearTimeout(multiSessionTimeoutId);
    }
    multiSessionTimeoutId = null;
  }
  currentInstantEngine = null;
  clearBoardOutcomes();
}

function showMultiSessionSummary() {
  playSound('gem');

  const peakValues = multiSessionData.map(d => d.peakBalance);
  const survivalValues = multiSessionData.map(d => d.roundsSurvived);
  
  const total = multiSessionData.length;
  if (total === 0) return;

  const avgRounds = survivalValues.reduce((a, b) => a + b, 0) / total;
  const maxRounds = getMax(survivalValues);
  const avgPeak = peakValues.reduce((a, b) => a + b, 0) / total;
  const maxPeak = getMax(peakValues);

  elSummaryTotalSessions.textContent = total;
  elSummaryAvgRounds.textContent = avgRounds.toFixed(1);
  elSummaryMaxRounds.textContent = maxRounds;
  elSummaryAvgPeak.textContent = `₹${avgPeak.toFixed(2)}`;
  elSummaryHighestPeak.textContent = `₹${maxPeak.toFixed(2)}`;

  elMultiSummaryModal.style.display = 'flex';
}

// --- Event Handlers ---
elGridSize.addEventListener('change', () => {
  updateBaseMultiplier();
  rebuildGrid();
  resetSimulation();
});

elMinesCount.addEventListener('change', () => {
  updateBaseMultiplier();
  resetSimulation();
});

elTargetMode.addEventListener('change', (e) => {
  targetMode = e.target.value;
  rebuildGrid();
});

elSpeedSlider.addEventListener('input', (e) => {
  speedMode = parseInt(e.target.value);
  updateSpeedLabel();
  
  // If running, restart loop to capture speed change
  if (isAutobetting) {
    stopAutobet();
    startAutobet();
  }
});

elSoundToggle.addEventListener('change', (e) => {
  soundEnabled = e.target.checked;
  if (soundEnabled) {
    initAudio();
    playSound('click');
  }
});

// Bet Amount Adjusters
elBtnHalfBet.addEventListener('click', () => {
  playSound('click');
  const val = parseFloat(elBaseBet.value) || 1;
  elBaseBet.value = Math.max(0.01, val / 2).toFixed(2);
});

elBtnDoubleBet.addEventListener('click', () => {
  playSound('click');
  const val = parseFloat(elBaseBet.value) || 1;
  elBaseBet.value = (val * 2).toFixed(2);
});

// Control panel buttons
elBtnStart.addEventListener('click', () => {
  playSound('click');
  startAutobet();
});

elBtnPause.addEventListener('click', () => {
  playSound('click');
  stopAutobet();
});

elBtnStep.addEventListener('click', () => {
  playSound('click');
  stepBet();
});

elBtnReset.addEventListener('click', () => {
  playSound('click');
  stopMultiSession();
  resetSimulation();
  multiSessionData = [];
  sessionsCompleted = 0;
  clearHistograms();
});

elModalClose.addEventListener('click', () => {
  playSound('click');
  elModalOverlay.style.display = 'none';
  resetSimulation();
});

// Multi-Session Controls Event Listeners
elBtnStartMulti.addEventListener('click', () => {
  playSound('click');
  elMultiPromptModal.style.display = 'flex';
});

elBtnPauseMulti.addEventListener('click', () => {
  playSound('click');
  stopMultiSession();
});

elBtnMultiPromptCancel.addEventListener('click', () => {
  playSound('click');
  elMultiPromptModal.style.display = 'none';
});

elBtnMultiPromptStart.addEventListener('click', () => {
  playSound('click');
  const val = parseInt(elMultiCountInput.value) || 100;
  sessionsToRun = Math.max(1, val);
  elMultiPromptModal.style.display = 'none';
  startMultiSession();
});

elBtnSummaryClose.addEventListener('click', () => {
  playSound('click');
  elMultiSummaryModal.style.display = 'none';
});

// --- Chart Detail Analysis Modal Functions ---
function getPercentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (sorted.length - 1) * (p / 100);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function openChartDetail(chartType) {
  playSound('click');
  elChartDetailModal.style.display = 'flex';
  
  if (chartType === 'line') {
    elDetailModalTitle.textContent = 'Balance History Path Analysis';
    
    elDetailModalTabs.innerHTML = `
      <button type="button" class="detail-tab active" data-tab="line">Interactive Path</button>
      <button type="button" class="detail-tab" data-tab="bet-table">Bet Log Table</button>
    `;
    
    // Bind Tab Click Handlers
    elDetailModalTabs.querySelectorAll('.detail-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        switchDetailTab(e.target.getAttribute('data-tab'));
      });
    });

    switchDetailTab('line');
    populateLineDetailStats();
  } else {
    const isPeak = (chartType === 'peak');
    elDetailModalTitle.textContent = isPeak ? 'Max Amount Reached Detail Analysis' : 'Rounds Survived Detail Analysis';
    
    elDetailModalTabs.innerHTML = `
      <button type="button" class="detail-tab active" data-tab="cdf">Probability Curve</button>
      <button type="button" class="detail-tab" data-tab="histograms">Histogram Views</button>
      <button type="button" class="detail-tab" data-tab="table">Sessions List</button>
      <button type="button" class="detail-tab" data-tab="optimizer">Stop Optimizer</button>
    `;
    
    // Bind Tab Click Handlers
    elDetailModalTabs.querySelectorAll('.detail-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        switchDetailTab(e.target.getAttribute('data-tab'));
      });
    });

    switchDetailTab('cdf');
    
    const vals = isPeak ? multiSessionData.map(d => d.peakBalance) : multiSessionData.map(d => d.roundsSurvived);
    populateHistogramDetailStats(chartType, vals);
  }
}

let activeDetailTab = 'cdf';
let activeOptimizerMode = 'rounds'; // 'rounds' or 'exit'

function setupOptimizerButtons() {
  const btnRounds = document.getElementById('btn-opt-rounds');
  const btnExit = document.getElementById('btn-opt-exit');
  if (!btnRounds || !btnExit) return;

  // Remove existing listeners by cloning
  const newRounds = btnRounds.cloneNode(true);
  const newExit = btnExit.cloneNode(true);
  btnRounds.parentNode.replaceChild(newRounds, btnRounds);
  btnExit.parentNode.replaceChild(newExit, btnExit);

  newRounds.addEventListener('click', () => {
    playSound('click');
    activeOptimizerMode = 'rounds';
    newRounds.classList.add('active');
    newExit.classList.remove('active');
    drawOptimizerChart('rounds');
    populateOptimizerStats('rounds');
  });

  newExit.addEventListener('click', () => {
    playSound('click');
    activeOptimizerMode = 'exit';
    newExit.classList.add('active');
    newRounds.classList.remove('active');
    drawOptimizerChart('exit');
    populateOptimizerStats('exit');
  });
}

function switchDetailTab(tabName) {
  activeDetailTab = tabName;
  
  // Hide all tab contents
  document.getElementById('tab-content-cdf').style.display = 'none';
  document.getElementById('tab-content-histograms').style.display = 'none';
  document.getElementById('tab-content-table').style.display = 'none';
  document.getElementById('tab-content-line').style.display = 'none';
  document.getElementById('tab-content-bet-table').style.display = 'none';
  document.getElementById('tab-content-optimizer').style.display = 'none';
  
  // Deactivate all tab buttons
  const tabs = elDetailModalTabs.querySelectorAll('.detail-tab');
  tabs.forEach(t => t.classList.remove('active'));
  
  // Activate selected tab button
  const activeBtn = elDetailModalTabs.querySelector(`[data-tab="${tabName}"]`);
  if (activeBtn) activeBtn.classList.add('active');
  
  // Show active tab content and render curves
  const isPeak = elDetailModalTitle.textContent.includes('Max Amount');
  const vals = isPeak ? multiSessionData.map(d => d.peakBalance) : multiSessionData.map(d => d.roundsSurvived);
  const title = isPeak ? 'Max Amount Reached' : 'Rounds Survived';
  const clr = isPeak ? '#00e5a3' : '#2f80ed';

  if (tabName === 'cdf') {
    document.getElementById('tab-content-cdf').style.display = 'block';
    setTimeout(() => {
      drawCDFCurve('detail-cdf-canvas', vals, title, clr);
    }, 50);
  } else if (tabName === 'histograms') {
    document.getElementById('tab-content-histograms').style.display = 'block';
    setTimeout(() => {
      drawHistogram('detail-linear-canvas', vals, title, clr, false, 25);
      drawHistogram('detail-log-canvas', vals, title, clr, true, 25);
    }, 50);
  } else if (tabName === 'table') {
    document.getElementById('tab-content-table').style.display = 'block';
    populateSessionTable();
  } else if (tabName === 'line') {
    document.getElementById('tab-content-line').style.display = 'block';
    setTimeout(() => {
      drawChart(elDetailLineCanvas, elDetailLineCtx);
    }, 50);
  } else if (tabName === 'bet-table') {
    document.getElementById('tab-content-bet-table').style.display = 'block';
    populateBetTable();
  } else if (tabName === 'optimizer') {
    document.getElementById('tab-content-optimizer').style.display = 'block';
    setupOptimizerButtons();
    setTimeout(() => {
      drawOptimizerChart(activeOptimizerMode);
      populateOptimizerStats(activeOptimizerMode);
    }, 50);
  }
}

function drawCDFCurve(canvasId, dataValues, title, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctxCDF = canvas.getContext('2d');
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctxCDF.scale(dpr, dpr);

  // Background
  ctxCDF.fillStyle = '#0f212e';
  ctxCDF.fillRect(0, 0, width, height);

  if (dataValues.length === 0) return;

  const sorted = [...dataValues].sort((a, b) => a - b);
  const n = sorted.length;

  const min = sorted[0];
  const max = sorted[n - 1];
  const isCurrency = title.toLowerCase().includes('amount') || title.toLowerCase().includes('balance');

  // Plot X-axis log scale
  const logMin = Math.log10(Math.max(1, min));
  const logMax = Math.log10(Math.max(1.1, max));
  const logRange = logMax - logMin;

  const marginL = 40;
  const marginR = 20;
  const marginT = 20;
  const marginB = 30;
  const graphWidth = width - marginL - marginR;
  const graphHeight = height - marginT - marginB;

  // Grid Lines & Labels
  ctxCDF.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctxCDF.lineWidth = 1;
  
  const yGrids = 4;
  for (let i = 0; i <= yGrids; i++) {
    const y = marginT + (graphHeight * i) / yGrids;
    ctxCDF.beginPath();
    ctxCDF.moveTo(marginL, y);
    ctxCDF.lineTo(width - marginR, y);
    ctxCDF.stroke();

    ctxCDF.fillStyle = '#8b9ba5';
    ctxCDF.font = '8px "Fira Code", monospace';
    ctxCDF.textAlign = 'right';
    const percent = 100 - (100 * i) / yGrids;
    ctxCDF.fillText(percent + '%', marginL - 6, y + 3);
  }

  // Generate points
  const points = [];
  const sampleSize = Math.min(200, n);
  for (let i = 0; i < sampleSize; i++) {
    const idx = Math.floor((i * (n - 1)) / (sampleSize - 1));
    const val = sorted[idx];
    const logVal = Math.log10(Math.max(1, val));
    const prob = 1 - (idx / n);
    
    const x = marginL + ((logVal - logMin) / (logRange || 1)) * graphWidth;
    const y = marginT + (1 - prob) * graphHeight;
    points.push({ x, y });
  }

  if (points.length < 2) return;

  // Draw smooth curve
  ctxCDF.beginPath();
  ctxCDF.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctxCDF.lineTo(points[i].x, points[i].y);
  }
  ctxCDF.strokeStyle = color;
  ctxCDF.lineWidth = 2.5;
  ctxCDF.stroke();

  // Draw fill gradient below path
  ctxCDF.lineTo(points[points.length - 1].x, height - marginB);
  ctxCDF.lineTo(points[0].x, height - marginB);
  ctxCDF.closePath();
  const grad = ctxCDF.createLinearGradient(0, marginT, 0, height - marginB);
  grad.addColorStop(0, color.replace('1)', '0.15)'));
  grad.addColorStop(1, 'rgba(15, 33, 46, 0)');
  ctxCDF.fillStyle = grad;
  ctxCDF.fill();

  // Draw X ticks (log scale)
  ctxCDF.fillStyle = '#8b9ba5';
  ctxCDF.font = '8px "Fira Code", monospace';
  ctxCDF.textAlign = 'center';
  
  const tickCount = 5;
  for (let i = 0; i < tickCount; i++) {
    const logTick = logMin + (logRange * i) / (tickCount - 1);
    const tickVal = Math.pow(10, logTick);
    const x = marginL + (i / (tickCount - 1)) * graphWidth;
    
    const displayVal = isCurrency ? '₹' + formatShort(tickVal) : formatShort(tickVal);
    ctxCDF.fillText(displayVal, x, height - 10);
  }
}

let currentSessionSortField = 'id';
let currentSessionSortAsc = true;

function sortSessionTable(field) {
  if (currentSessionSortField === field) {
    currentSessionSortAsc = !currentSessionSortAsc;
  } else {
    currentSessionSortField = field;
    currentSessionSortAsc = true;
  }
  populateSessionTable();
}

// Bind sorting headers in HTML dynamically
document.getElementById('th-sess-id').addEventListener('click', () => sortSessionTable('id'));
document.getElementById('th-sess-rounds').addEventListener('click', () => sortSessionTable('rounds'));
document.getElementById('th-sess-peak').addEventListener('click', () => sortSessionTable('peak'));

function populateSessionTable() {
  const body = document.getElementById('session-detail-table-body');
  if (!body) return;
  body.innerHTML = '';
  
  const mapped = multiSessionData.map((d, idx) => ({
    id: idx + 1,
    rounds: d.roundsSurvived,
    peak: d.peakBalance
  }));
  
  mapped.sort((a, b) => {
    let valA = a[currentSessionSortField];
    let valB = b[currentSessionSortField];
    if (valA < valB) return currentSessionSortAsc ? -1 : 1;
    if (valA > valB) return currentSessionSortAsc ? 1 : -1;
    return 0;
  });
  
  for (const sess of mapped) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>Session #${sess.id}</td>
      <td>${sess.rounds.toLocaleString()}</td>
      <td style="color: var(--color-green);">₹${sess.peak.toFixed(2)}</td>
    `;
    body.appendChild(tr);
  }
}

function populateBetTable() {
  const body = document.getElementById('bet-detail-table-body');
  if (!body) return;
  body.innerHTML = '';
  
  if (!engine) return;
  
  const history = engine.history;
  const len = history.length;
  
  for (let i = 0; i < len; i++) {
    const bal = history[i];
    let changeText = '-';
    let outcomeText = 'START';
    let betSizeText = '-';
    
    if (i > 0) {
      const prevBal = history[i - 1];
      const diff = bal - prevBal;
      if (diff >= 0) {
        changeText = `<span style="color: var(--color-green);">+₹${diff.toFixed(2)}</span>`;
        outcomeText = 'WIN';
        const mult = engine.getSingleTileMultiplier();
        const betSize = diff / (mult - 1);
        betSizeText = `₹${betSize.toFixed(2)}`;
      } else {
        changeText = `<span style="color: var(--color-red);">-₹${Math.abs(diff).toFixed(2)}</span>`;
        outcomeText = 'LOSS';
        betSizeText = `₹${Math.abs(diff).toFixed(2)}`;
      }
    }
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>Bet #${i}</td>
      <td>${betSizeText}</td>
      <td>${outcomeText}</td>
      <td>${changeText}</td>
      <td>₹${bal.toFixed(2)}</td>
    `;
    body.appendChild(tr);
  }
}

function populateLineDetailStats() {
  if (!engine) {
    elDetailStatsPanel.innerHTML = '<p style="color: var(--text-muted);">No active run session data.</p>';
    return;
  }
  
  const totalBets = engine.stats.totalBets;
  const totalWins = engine.stats.totalWins;
  const totalLosses = engine.stats.totalLosses;
  const profit = engine.stats.netProfit;
  const winRate = totalBets > 0 ? (totalWins / totalBets) * 100 : 0;
  const maxBet = engine.stats.maxBet;
  const maxWinStreak = engine.stats.maxWinStreak;
  const maxLossStreak = engine.stats.maxLossStreak;
  const peak = engine.stats.peakBalance;
  
  elDetailStatsPanel.innerHTML = `
    <h4 class="panel-section-title">Session Summary</h4>
    <div class="detail-stats-grid">
      <div class="detail-stat-card">
        <span>Current Balance</span>
        <span style="color: ${engine.balance >= engine.initialBalance ? 'var(--color-green)' : 'var(--color-red)'};">₹${engine.balance.toFixed(2)}</span>
      </div>
      <div class="detail-stat-card">
        <span>Net Profit</span>
        <span style="color: ${profit >= 0 ? 'var(--color-green)' : 'var(--color-red)'};">${profit >= 0 ? '+' : ''}₹${profit.toFixed(2)}</span>
      </div>
      <div class="detail-stat-card">
        <span>Total Bets</span>
        <span>${totalBets}</span>
      </div>
      <div class="detail-stat-card">
        <span>Win Rate</span>
        <span>${winRate.toFixed(1)}%</span>
      </div>
      <div class="detail-stat-card">
        <span>Max Bet Placed</span>
        <span>₹${maxBet.toFixed(2)}</span>
      </div>
      <div class="detail-stat-card">
        <span>Peak Balance</span>
        <span style="color: var(--color-green);">₹${peak.toFixed(2)}</span>
      </div>
    </div>
    
    <h4 class="panel-section-title" style="margin-top: 15px;">Streak Records</h4>
    <div class="detail-stats-grid">
      <div class="detail-stat-card">
        <span>Max Win Streak</span>
        <span style="color: var(--color-green);">${maxWinStreak} wins</span>
      </div>
      <div class="detail-stat-card">
        <span>Max Loss Streak</span>
        <span style="color: var(--color-red);">${maxLossStreak} losses</span>
      </div>
    </div>

    <h4 class="panel-section-title" style="margin-top: 15px;">Visual Insight</h4>
    <p class="detail-insight-text">
      This graph details the sequence of your account balance. Notice the sharp, sudden drops when the martingale doubling occurs, followed by immediate recovery when a win is secured. If a losing streak exceeds the bankroll cushion, it falls straight to zero (bankruptcy).
    </p>
  `;
}

function populateHistogramDetailStats(type, values) {
  if (values.length === 0) {
    elDetailStatsPanel.innerHTML = '<p style="color: var(--text-muted);">No multi-session simulation data has been recorded yet.</p>';
    return;
  }
  
  const total = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / total;
  const min = getMin(values);
  const max = getMax(values);
  
  const p10 = getPercentile(values, 10);
  const p25 = getPercentile(values, 25);
  const p50 = getPercentile(values, 50);
  const p75 = getPercentile(values, 75);
  const p90 = getPercentile(values, 90);
  const p95 = getPercentile(values, 95);
  const p99 = getPercentile(values, 99);

  const isCurrency = (type === 'peak');
  const fmt = (val) => isCurrency ? `₹${val.toFixed(2)}` : Math.round(val).toLocaleString();

  let insightHTML = '';
  if (type === 'survival') {
    insightHTML = `
      <h4 class="panel-section-title" style="margin-top: 15px;">Statistical Insights</h4>
      <p class="detail-insight-text">
        <strong>Survival Analysis:</strong> 50% of the simulated runs went bankrupt within <strong>${fmt(p50)}</strong> rounds. Only 10% of sessions survived beyond <strong>${fmt(p90)}</strong> rounds, and the most resilient run lasted for <strong>${fmt(max)}</strong> rounds.
      </p>
    `;
  } else {
    insightHTML = `
      <h4 class="panel-section-title" style="margin-top: 15px;">Statistical Insights</h4>
      <p class="detail-insight-text">
        <strong>Peak Balance Analysis:</strong> The average peak reached by the strategy was <strong>${fmt(avg)}</strong>. In 90% of the runs, the player was able to grow the balance to at least <strong>${fmt(p10)}</strong>, whereas only 1% of the runs reached a peak balance of <strong>${fmt(p99)}</strong> before going bankrupt.
      </p>
    `;
  }

  elDetailStatsPanel.innerHTML = `
    <h4 class="panel-section-title">Aggregate Summary</h4>
    <div class="detail-stats-grid">
      <div class="detail-stat-card">
        <span>Average</span>
        <span>${fmt(avg)}</span>
      </div>
      <div class="detail-stat-card">
        <span>Median (50%)</span>
        <span>${fmt(p50)}</span>
      </div>
      <div class="detail-stat-card">
        <span>Minimum</span>
        <span>${fmt(min)}</span>
      </div>
      <div class="detail-stat-card">
        <span>Maximum</span>
        <span>${fmt(max)}</span>
      </div>
    </div>
    
    <h4 class="panel-section-title" style="margin-top: 15px;">Percentiles Distribution</h4>
    <div class="detail-percentiles-list">
      <div class="detail-percentile-row">
        <span>10th Percentile (Bottom 10%)</span>
        <span>${fmt(p10)}</span>
      </div>
      <div class="detail-percentile-row">
        <span>25th Percentile</span>
        <span>${fmt(p25)}</span>
      </div>
      <div class="detail-percentile-row">
        <span>50th Percentile (Median)</span>
        <span>${fmt(p50)}</span>
      </div>
      <div class="detail-percentile-row">
        <span>75th Percentile</span>
        <span>${fmt(p75)}</span>
      </div>
      <div class="detail-percentile-row">
        <span>90th Percentile (Top 10%)</span>
        <span>${fmt(p90)}</span>
      </div>
      <div class="detail-percentile-row">
        <span>95th Percentile (Top 5%)</span>
        <span>${fmt(p95)}</span>
      </div>
      <div class="detail-percentile-row">
        <span>99th Percentile (Top 1%)</span>
        <span style="color: var(--color-green);">${fmt(p99)}</span>
      </div>
    </div>
    
    ${insightHTML}
  `;
}

function drawOptimizerChart(mode) {
  const canvas = document.getElementById('detail-optimizer-canvas');
  if (!canvas) return;
  const ctxOpt = canvas.getContext('2d');
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctxOpt.scale(dpr, dpr);

  // Background
  ctxOpt.fillStyle = '#0f212e';
  ctxOpt.fillRect(0, 0, width, height);

  if (multiSessionData.length === 0) return;

  const initialBal = parseFloat(elInitialBalance.value) || 1000;

  // Generate data points based on mode
  const pointsData = [];
  if (mode === 'rounds') {
    for (const cp of ROUND_CHECKPOINTS) {
      let totalProfit = 0;
      for (const sess of multiSessionData) {
        const bal = sess.checkpointBalances ? sess.checkpointBalances[cp] : 0;
        if (bal === 0) {
          totalProfit -= initialBal;
        } else {
          totalProfit += (bal - initialBal);
        }
      }
      pointsData.push({ xVal: cp, yVal: totalProfit });
    }
  } else {
    // Sample densely in the realistic range (initialBal+1 unit to 95th percentile of peak),
    // then sparsely beyond that up to the absolute max.
    const sortedPeaks = [...multiSessionData.map(d => d.peakBalance)].sort((a, b) => a - b);
    const p95 = sortedPeaks[Math.floor(sortedPeaks.length * 0.95)];
    const maxPeak = sortedPeaks[sortedPeaks.length - 1];
    const minProfit = 0.1; // just above zero profit

    // Dense phase: 40 steps from initialBal to 95th percentile
    const denseSteps = 40;
    const denseRange = p95 - initialBal;
    for (let i = 0; i <= denseSteps; i++) {
      const target = initialBal + minProfit + (denseRange * i) / denseSteps;
      let totalProfit = 0;
      for (const sess of multiSessionData) {
        if (sess.peakBalance >= target) {
          totalProfit += (target - initialBal);
        } else {
          totalProfit -= initialBal;
        }
      }
      pointsData.push({ xVal: target, yVal: totalProfit });
    }
    // Sparse phase: 10 steps from 95th percentile to max
    if (maxPeak > p95) {
      const sparseSteps = 10;
      const sparseRange = maxPeak - p95;
      for (let i = 1; i <= sparseSteps; i++) {
        const target = p95 + (sparseRange * i) / sparseSteps;
        let totalProfit = 0;
        for (const sess of multiSessionData) {
          if (sess.peakBalance >= target) {
            totalProfit += (target - initialBal);
          } else {
            totalProfit -= initialBal;
          }
        }
        pointsData.push({ xVal: target, yVal: totalProfit });
      }
    }
  }

  // Find Min/Max Y to scale the graph
  const yValues = pointsData.map(p => p.yVal);
  let yMin = getMin(yValues);
  let yMax = getMax(yValues);
  
  if (yMax === yMin) {
    yMax += 10;
    yMin -= 10;
  }
  const yRange = yMax - yMin;

  const marginL = 50;
  const marginR = 20;
  const marginT = 20;
  const marginB = 30;
  const graphWidth = width - marginL - marginR;
  const graphHeight = height - marginT - marginB;

  // Draw grid lines
  ctxOpt.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctxOpt.lineWidth = 1;

  const yGrids = 4;
  for (let i = 0; i <= yGrids; i++) {
    const y = marginT + (graphHeight * i) / yGrids;
    ctxOpt.beginPath();
    ctxOpt.moveTo(marginL, y);
    ctxOpt.lineTo(width - marginR, y);
    ctxOpt.stroke();

    ctxOpt.fillStyle = '#8b9ba5';
    ctxOpt.font = '8px "Fira Code", monospace';
    ctxOpt.textAlign = 'right';
    const gridVal = yMax - (yRange * i) / yGrids;
    ctxOpt.fillText('₹' + formatShort(gridVal), marginL - 6, y + 3);
  }

  // Draw 0 baseline
  if (yMin <= 0 && yMax >= 0) {
    const zeroY = marginT + (1 - (0 - yMin) / yRange) * graphHeight;
    ctxOpt.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctxOpt.lineWidth = 1.2;
    ctxOpt.beginPath();
    ctxOpt.moveTo(marginL, zeroY);
    ctxOpt.lineTo(width - marginR, zeroY);
    ctxOpt.stroke();
  }

  // Map values to coordinates
  const canvasPoints = [];
  const n = pointsData.length;
  const isRounds = (mode === 'rounds');
  const xMin = pointsData[0].xVal;
  const xMax = pointsData[n - 1].xVal;
  const logXMin = isRounds ? Math.log10(xMin) : xMin;
  const logXMax = isRounds ? Math.log10(xMax) : xMax;
  const logXRange = logXMax - logXMin;

  for (let i = 0; i < n; i++) {
    const p = pointsData[i];
    const logX = isRounds ? Math.log10(p.xVal) : p.xVal;
    const x = marginL + ((logX - logXMin) / (logXRange || 1)) * graphWidth;
    const y = marginT + (1 - (p.yVal - yMin) / yRange) * graphHeight;
    canvasPoints.push({ x, y, xVal: p.xVal, yVal: p.yVal });
  }

  let optIndex = 0;
  let optVal = pointsData[0].yVal;
  for (let i = 1; i < n; i++) {
    if (pointsData[i].yVal > optVal) {
      optVal = pointsData[i].yVal;
      optIndex = i;
    }
  }
  const optimalPoint = canvasPoints[optIndex];

  // Draw path curve
  ctxOpt.beginPath();
  ctxOpt.moveTo(canvasPoints[0].x, canvasPoints[0].y);
  for (let i = 1; i < n; i++) {
    ctxOpt.lineTo(canvasPoints[i].x, canvasPoints[i].y);
  }
  const pathColor = optVal >= 0 ? '#00e5a3' : '#ff3860';
  ctxOpt.strokeStyle = pathColor;
  ctxOpt.lineWidth = 2.5;
  ctxOpt.stroke();

  // Draw fill gradient
  ctxOpt.lineTo(canvasPoints[n - 1].x, height - marginB);
  ctxOpt.lineTo(canvasPoints[0].x, height - marginB);
  ctxOpt.closePath();
  const grad = ctxOpt.createLinearGradient(0, marginT, 0, height - marginB);
  grad.addColorStop(0, pathColor.replace('1)', '0.12)'));
  grad.addColorStop(1, 'rgba(15, 33, 46, 0)');
  ctxOpt.fillStyle = grad;
  ctxOpt.fill();

  // Draw vertical guide line to peak
  if (optimalPoint) {
    ctxOpt.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctxOpt.lineWidth = 1;
    ctxOpt.setLineDash([3, 3]);
    ctxOpt.beginPath();
    ctxOpt.moveTo(optimalPoint.x, marginT);
    ctxOpt.lineTo(optimalPoint.x, height - marginB);
    ctxOpt.stroke();
    ctxOpt.setLineDash([]);

    // Highlight dot
    ctxOpt.fillStyle = '#ffffff';
    ctxOpt.strokeStyle = pathColor;
    ctxOpt.lineWidth = 2;
    ctxOpt.beginPath();
    ctxOpt.arc(optimalPoint.x, optimalPoint.y, 4.5, 0, 2 * Math.PI);
    ctxOpt.fill();
    ctxOpt.stroke();
  }

  // Draw X ticks
  ctxOpt.fillStyle = '#8b9ba5';
  ctxOpt.font = '8px "Fira Code", monospace';
  ctxOpt.textAlign = 'center';

  const tickIndices = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1];
  for (const idx of tickIndices) {
    if (idx < 0 || idx >= n) continue;
    const pt = canvasPoints[idx];
    const displayVal = isRounds ? formatShort(pt.xVal) : '₹' + formatShort(pt.xVal);
    ctxOpt.fillText(displayVal, pt.x, height - 10);
  }
}

function populateOptimizerStats(mode) {
  if (multiSessionData.length === 0) {
    elDetailStatsPanel.innerHTML = '<p style="color: var(--text-muted);">No simulation data recorded.</p>';
    return;
  }

  const initialBal = parseFloat(elInitialBalance.value) || 1000;
  const isRounds = (mode === 'rounds');

  const pointsData = [];
  if (isRounds) {
    for (const cp of ROUND_CHECKPOINTS) {
      let totalProfit = 0;
      let survivalCount = 0;
      for (const sess of multiSessionData) {
        const bal = sess.checkpointBalances ? sess.checkpointBalances[cp] : 0;
        if (bal === 0) {
          totalProfit -= initialBal;
        } else {
          totalProfit += (bal - initialBal);
          survivalCount++;
        }
      }
      pointsData.push({ threshold: cp, profit: totalProfit, survivalRate: (survivalCount / multiSessionData.length) * 100 });
    }
  } else {
    // Match the same dense+sparse sampling as the chart
    const sortedPeaks = [...multiSessionData.map(d => d.peakBalance)].sort((a, b) => a - b);
    const p95 = sortedPeaks[Math.floor(sortedPeaks.length * 0.95)];
    const maxPeak = sortedPeaks[sortedPeaks.length - 1];
    const minProfit = 0.1;

    const buildExitPoints = (from, to, steps) => {
      const arr = [];
      for (let i = 0; i <= steps; i++) {
        const target = from + minProfit + ((to - from) * i) / steps;
        let totalProfit = 0;
        let successCount = 0;
        for (const sess of multiSessionData) {
          if (sess.peakBalance >= target) {
            totalProfit += (target - initialBal);
            successCount++;
          } else {
            totalProfit -= initialBal;
          }
        }
        arr.push({ threshold: target, profit: totalProfit, successRate: (successCount / multiSessionData.length) * 100 });
      }
      return arr;
    };

    pointsData.push(...buildExitPoints(initialBal, p95, 40));
    if (maxPeak > p95) {
      const sparsePoints = buildExitPoints(p95, maxPeak, 10);
      pointsData.push(...sparsePoints.slice(1)); // skip duplicate at p95
    }
  }

  let opt = pointsData[0];
  for (const pt of pointsData) {
    if (pt.profit > opt.profit) {
      opt = pt;
    }
  }

  const formatThreshold = (val) => isRounds ? `${val.toLocaleString()} rounds` : `₹${val.toFixed(2)}`;
  const formatProfit = (val) => `${val >= 0 ? '+' : ''}₹${val.toFixed(2)}`;
  const profitColor = (val) => val >= 0 ? 'var(--color-green)' : 'var(--color-red)';

  let insightsCopy = '';
  if (isRounds) {
    insightsCopy = `
      <p class="detail-insight-text">
        <strong>Optimal Stop Round:</strong> Stopping exactly at <strong>${opt.threshold.toLocaleString()} rounds</strong> would have maximized your aggregate net outcome to <strong style="color: ${profitColor(opt.profit)};">${formatProfit(opt.profit)}</strong> across all simulated sessions.
      </p>
      <p class="detail-insight-text" style="margin-top: 10px;">
        At this stop limit, the probability of reaching the limit before bankruptcy was <strong>${opt.survivalRate.toFixed(1)}%</strong>. Stopping earlier leaves profit on the table; stopping later increases bankruptcy exposure.
      </p>
    `;
  } else {
    insightsCopy = `
      <p class="detail-insight-text">
        <strong>Optimal Exit Value:</strong> Setting a take-profit target at <strong>₹${opt.threshold.toFixed(2)}</strong> (Net Profit target of ₹${(opt.threshold - initialBal).toFixed(2)}) would have maximized your aggregate net outcome to <strong style="color: ${profitColor(opt.profit)};">${formatProfit(opt.profit)}</strong>.
      </p>
      <p class="detail-insight-text" style="margin-top: 10px;">
        At this take-profit target, the success probability of reaching the peak before bankruptcy was <strong>${opt.successRate.toFixed(1)}%</strong>. If target is set higher, too many runs go bankrupt first; if set lower, wins are cut too early.
      </p>
    `;
  }

  let rowsHTML = '';
  const stride = Math.max(1, Math.floor(pointsData.length / 6));
  for (let i = 0; i < pointsData.length; i += stride) {
    const pt = pointsData[i];
    const rateText = isRounds ? `(${pt.survivalRate.toFixed(0)}% survived)` : `(${pt.successRate.toFixed(0)}% reached)`;
    rowsHTML += `
      <div class="detail-percentile-row">
        <span>${formatThreshold(pt.threshold)} ${rateText}</span>
        <span style="color: ${profitColor(pt.profit)}; font-weight: 700;">${formatProfit(pt.profit)}</span>
      </div>
    `;
  }

  elDetailStatsPanel.innerHTML = `
    <h4 class="panel-section-title">Optimizer Results</h4>
    <div class="detail-stats-grid">
      <div class="detail-stat-card" style="grid-column: span 2;">
        <span>Optimal Hard Stop Limit</span>
        <span style="color: var(--color-green); font-size: 16px; font-weight: 800;">${formatThreshold(opt.threshold)}</span>
      </div>
      <div class="detail-stat-card" style="grid-column: span 2;">
        <span>Peak Aggregate Profit</span>
        <span style="color: ${profitColor(opt.profit)}; font-size: 16px; font-weight: 800;">${formatProfit(opt.profit)}</span>
      </div>
    </div>
    
    <h4 class="panel-section-title" style="margin-top: 15px;">Threshold Comparison</h4>
    <div class="detail-percentiles-list">
      ${rowsHTML}
    </div>

    <h4 class="panel-section-title" style="margin-top: 15px;">Mathematical Summary</h4>
    ${insightsCopy}
  `;
}

function drawDetailLineWithGuide(point) {
  drawChart(elDetailLineCanvas, elDetailLineCtx);
  
  elDetailLineCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  elDetailLineCtx.lineWidth = 1;
  elDetailLineCtx.setLineDash([3, 3]);
  elDetailLineCtx.beginPath();
  elDetailLineCtx.moveTo(point.x, 15);
  elDetailLineCtx.lineTo(point.x, elDetailLineCanvas.height / (window.devicePixelRatio || 1) - 15);
  elDetailLineCtx.stroke();
  elDetailLineCtx.setLineDash([]);
  
  elDetailLineCtx.fillStyle = '#ffffff';
  elDetailLineCtx.strokeStyle = '#00e5a3';
  elDetailLineCtx.lineWidth = 2;
  elDetailLineCtx.beginPath();
  elDetailLineCtx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
  elDetailLineCtx.fill();
  elDetailLineCtx.stroke();
}

// Chart Click Bindings
elCanvas.addEventListener('click', () => {
  if (engine && engine.history.length > 0) {
    openChartDetail('line');
  }
});

document.getElementById('peak-balance-histogram').addEventListener('click', () => {
  if (multiSessionData.length > 0) {
    openChartDetail('peak');
  }
});

document.getElementById('survival-histogram').addEventListener('click', () => {
  if (multiSessionData.length > 0) {
    openChartDetail('survival');
  }
});

// Interactive Path canvas hover listeners
const elDetailTooltip = document.getElementById('detail-line-tooltip');

elDetailLineCanvas.addEventListener('mousemove', (e) => {
  const points = elDetailLineCanvas.renderedPoints;
  if (!points || points.length === 0 || !engine) return;

  const rect = elDetailLineCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;

  let closestPoint = points[0];
  let minDiff = Math.abs(points[0].x - mouseX);
  let closestIdx = 0;

  for (let i = 1; i < points.length; i++) {
    const diff = Math.abs(points[i].x - mouseX);
    if (diff < minDiff) {
      minDiff = diff;
      closestPoint = points[i];
      closestIdx = i;
    }
  }

  // Draw trace lines
  drawDetailLineWithGuide(closestPoint);

  // Position and show tooltip
  elDetailTooltip.style.display = 'block';
  elDetailTooltip.style.left = `${closestPoint.x + 10}px`;
  elDetailTooltip.style.top = `${closestPoint.y - 60}px`;
  
  const history = engine.history;
  const exactIdx = Math.floor((closestIdx / (points.length - 1)) * (history.length - 1));
  const currentBal = history[exactIdx];
  
  let changeText = 'START';
  let betText = '-';
  if (exactIdx > 0) {
    const prevBal = history[exactIdx - 1];
    const diff = currentBal - prevBal;
    if (diff >= 0) {
      const mult = engine.getSingleTileMultiplier();
      const betSize = diff / (mult - 1);
      betText = `₹${betSize.toFixed(2)}`;
      changeText = `<span style="color: var(--color-green); font-weight: 700;">WIN (+₹${diff.toFixed(2)})</span>`;
    } else {
      betText = `₹${Math.abs(diff).toFixed(2)}`;
      changeText = `<span style="color: var(--color-red); font-weight: 700;">LOSS (-₹${Math.abs(diff).toFixed(2)})</span>`;
    }
  }

  elDetailTooltip.innerHTML = `
    <strong>Round #${exactIdx}</strong><br/>
    Bet Size: ${betText}<br/>
    Outcome: ${changeText}<br/>
    Balance: <strong>₹${currentBal.toFixed(2)}</strong>
  `;
});

elDetailLineCanvas.addEventListener('mouseleave', () => {
  elDetailTooltip.style.display = 'none';
  drawChart(elDetailLineCanvas, elDetailLineCtx);
});

// Modal close button
elBtnDetailClose.addEventListener('click', () => {
  playSound('click');
  elChartDetailModal.style.display = 'none';
});

// Modal overlay backdrop close
elChartDetailModal.addEventListener('click', (e) => {
  if (e.target === elChartDetailModal) {
    playSound('click');
    elChartDetailModal.style.display = 'none';
  }
});

// Register functions on window for module scoping compatibility
window.switchDetailTab = switchDetailTab;
window.sortSessionTable = sortSessionTable;

// Window resize handling for responsive canvas
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    drawChart();
    drawHistograms();
    if (elChartDetailModal.style.display === 'flex') {
      if (activeDetailTab === 'line') {
        drawChart(elDetailLineCanvas, elDetailLineCtx);
      } else if (activeDetailTab === 'cdf') {
        const isPeak = elDetailModalTitle.textContent.includes('Max Amount');
        const vals = isPeak ? multiSessionData.map(d => d.peakBalance) : multiSessionData.map(d => d.roundsSurvived);
        const title = isPeak ? 'Max Amount Reached' : 'Rounds Survived';
        const clr = isPeak ? '#00e5a3' : '#2f80ed';
        drawCDFCurve('detail-cdf-canvas', vals, title, clr);
      } else if (activeDetailTab === 'histograms') {
        const isPeak = elDetailModalTitle.textContent.includes('Max Amount');
        const vals = isPeak ? multiSessionData.map(d => d.peakBalance) : multiSessionData.map(d => d.roundsSurvived);
        const titleText = isPeak ? 'Max Amount Reached Frequency' : 'Rounds Survived Frequency';
        const clr = isPeak ? '#00e5a3' : '#2f80ed';
        drawHistogram('detail-linear-canvas', vals, titleText, clr, false, 25);
        drawHistogram('detail-log-canvas', vals, titleText, clr, true, 25);
      } else if (activeDetailTab === 'optimizer') {
        drawOptimizerChart(activeOptimizerMode);
        populateOptimizerStats(activeOptimizerMode);
      }
    }
  }, 100);
});

// Initialize Page
updateBaseMultiplier();
rebuildGrid();
updateSpeedLabel();
clearHistograms();
