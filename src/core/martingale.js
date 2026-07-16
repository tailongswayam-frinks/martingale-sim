/**
 * Helper to calculate combinations (n choose r)
 */
export function nCr(n, r) {
  if (r < 0 || r > n) return 0;
  if (r === 0 || r === n) return 1;
  if (r > n / 2) r = n - r;
  let res = 1;
  for (let i = 1; i <= r; i++) {
    res = res * (n - i + 1) / i;
  }
  return res;
}

/**
 * Calculates the exact Stake Mines multiplier for k successful clicks.
 * @param {number} totalTiles Total number of tiles on the board (N^2)
 * @param {number} minesCount Number of mines on the board
 * @param {number} clicks Number of safe tiles successfully clicked
 * @param {number} rtp House Return to Player (typically 0.99 for 1% house edge)
 * @returns {number} The multiplier value
 */
export function getMinesMultiplier(totalTiles, minesCount, clicks, rtp = 0.99) {
  if (clicks <= 0 || clicks > totalTiles - minesCount) return 0;
  const num = nCr(totalTiles, clicks);
  const den = nCr(totalTiles - minesCount, clicks);
  if (den === 0) return 0;
  return rtp * (num / den);
}

export class MartingaleEngine {
  constructor({
    initialBalance,
    baseBet,
    gridSize = 5,
    minesCount = 3,
    increaseOnLossPercent = 100,
    rtp = 0.99,
    storeHistory = true
  }) {
    this.initialBalance = Math.max(0.01, Number(initialBalance));
    this.balance = this.initialBalance;
    this.baseBet = Math.max(0.01, Number(baseBet));
    this.currentBet = this.baseBet;
    this.gridSize = Math.max(2, Number(gridSize));
    this.totalTiles = this.gridSize * this.gridSize;
    this.minesCount = Math.max(1, Math.min(this.totalTiles - 1, Number(minesCount)));
    this.increaseOnLossPercent = Math.max(0, Number(increaseOnLossPercent));
    this.rtp = Math.max(0, Math.min(1, Number(rtp)));
    this.storeHistory = storeHistory;

    this.history = this.storeHistory ? [this.initialBalance] : [];
    this.stats = {
      totalBets: 0,
      totalWins: 0,
      totalLosses: 0,
      maxBet: this.baseBet,
      maxWinStreak: 0,
      maxLossStreak: 0,
      currentWinStreak: 0,
      currentLossStreak: 0,
      netProfit: 0,
      peakBalance: this.initialBalance,
      isBankrupt: false
    };
  }

  /**
   * Get the current 1-tile multiplier
   */
  getSingleTileMultiplier() {
    return getMinesMultiplier(this.totalTiles, this.minesCount, 1, this.rtp);
  }

  /**
   * Plays a single round of Mines using the selected tile index.
   * If selectedTileIndex is negative or null, a random tile index will be chosen.
   * @param {number} selectedTileIndex The tile index the player bets on (0 to T-1)
   * @returns {object} The details of the round outcome
   */
  playRound(selectedTileIndex = -1) {
    if (this.stats.isBankrupt) {
      return { error: 'Bankrupt. Reset the simulation to start again.' };
    }

    // Check if player has enough balance for current bet
    if (this.balance < this.currentBet) {
      this.stats.isBankrupt = true;
      return {
        error: 'Insufficient balance to place the bet.',
        isBankrupt: true,
        requiredBet: this.currentBet,
        currentBalance: this.balance
      };
    }

    // Determine the tile to click
    let clickedIndex = selectedTileIndex;
    if (clickedIndex < 0 || clickedIndex >= this.totalTiles) {
      clickedIndex = Math.floor(Math.random() * this.totalTiles);
    }

    // Generate random mines distribution
    const mines = this.generateMines();
    const isMine = mines.includes(clickedIndex);

    const multiplier = this.getSingleTileMultiplier();
    let profit = 0;
    let payout = 0;

    if (isMine) {
      // Loss
      profit = -this.currentBet;
      payout = 0;
      this.balance -= this.currentBet;

      this.stats.totalLosses++;
      this.stats.currentLossStreak++;
      this.stats.currentWinStreak = 0;
      if (this.stats.currentLossStreak > this.stats.maxLossStreak) {
        this.stats.maxLossStreak = this.stats.currentLossStreak;
      }

      // Martingale bet scaling
      const nextBet = this.currentBet * (1 + this.increaseOnLossPercent / 100);
      this.stats.maxBet = Math.max(this.stats.maxBet, nextBet);
      
      // Update bet for next round
      this.currentBet = nextBet;
    } else {
      // Win
      payout = this.currentBet * multiplier;
      profit = payout - this.currentBet;
      this.balance += profit;

      this.stats.totalWins++;
      this.stats.currentWinStreak++;
      this.stats.currentLossStreak = 0;
      if (this.stats.currentWinStreak > this.stats.maxWinStreak) {
        this.stats.maxWinStreak = this.stats.currentWinStreak;
      }

      // Reset bet to base bet
      this.currentBet = this.baseBet;
    }

    this.stats.totalBets++;
    this.stats.netProfit = this.balance - this.initialBalance;
    
    if (this.balance > this.stats.peakBalance) {
      this.stats.peakBalance = this.balance;
    }

    if (this.storeHistory) {
      this.history.push(this.balance);
    }

    // Check if player is bankrupt for future rounds
    if (this.balance < this.currentBet) {
      this.stats.isBankrupt = true;
    }

    return {
      betAmount: this.currentBet === this.baseBet && !isMine ? (payout / multiplier) : (isMine ? -profit : (payout / multiplier)), // return the bet placed this round
      actualBetPlaced: isMine ? -profit : (payout / multiplier),
      selectedTileIndex: clickedIndex,
      isMine,
      mines,
      multiplier: isMine ? 0 : multiplier,
      payout,
      profit,
      newBalance: this.balance,
      isBankrupt: this.stats.isBankrupt
    };
  }

  /**
   * Generates M random distinct indices from 0 to T-1 representing mines.
   */
  generateMines() {
    const indices = Array.from({ length: this.totalTiles }, (_, i) => i);
    const mines = [];
    for (let i = 0; i < this.minesCount; i++) {
      if (indices.length === 0) break;
      const randIdx = Math.floor(Math.random() * indices.length);
      mines.push(indices[randIdx]);
      indices.splice(randIdx, 1);
    }
    return mines;
  }
}
