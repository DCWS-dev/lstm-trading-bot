/**
 * Paper Trading System v1.0
 * 
 * Симуляция торговли без реальных денег для тестирования стратегии
 * Использует реальные рыночные данные с задержкой (для реализма)
 * 
 * Features:
 * - Live WebSocket конекция к Binance
 * - Виртуальный портфель
 * - Трэкинг P&L по каждой паре
 * - Метрики качества торговли
 * - Логирование всех сделок
 */

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

class PaperTradingBot {
  constructor(config, dashboardServer = null) {
    this.config = config;
    this.dashboardServer = dashboardServer;
    this.isRunning = false;
    this.startTime = null;
    this.portfolio = {
      cash: config.initialCapital || 10000,
      positions: {},
      trades: [],
      startTime: Date.now(),
      totalProfit: 0,
      winTrades: 0,
      lossTrades: 0,
      initialCapital: config.initialCapital || 10000,
      totalTrades: 0
    };
    
    this.priceFeeds = {};
    this.activeWebSockets = {};
    
    // ✅ FIXED: Храним историю свечей для каждой пары (для расчета RSI, MACD и т.д.)
    this.candleHistory = {};
    
    // Загружаем пары из конфига (все 29 пар)
    this.tradingPairs = config.pairs && config.pairs.length > 0 
      ? config.pairs 
      : ['BTCUSDT', 'ETHUSDT', 'BNBUSDT']; // Fallback
    
    this.minConfidence = config.minConfidence || 0.55;
    
    this.logsDir = path.join(__dirname, '../logs/paper-trading');
    this.ensureLogsDir();
    
    // Per-pair конфиги (загружаются из per-pair-optimizer)
    this.perPairConfigs = this.loadPerPairConfigs();
  }

  /**
   * Создаем директорию для логов
   */
  ensureLogsDir() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  /**
   * Загружаем per-pair конфигурации
   */
  loadPerPairConfigs() {
    try {
      const configPath = path.join(__dirname, '../config/per-pair-configs.json');
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
    } catch (error) {
      console.warn('⚠️  Per-pair конфиги не найдены. Используем глобальные параметры.');
    }
    return {};
  }

  /**
   * Подключение к Binance WebSocket для live цен
   */
  async connectToWebSocket(pair) {
    return new Promise((resolve, reject) => {
      try {
        const symbol = pair.toLowerCase();
        const wsUrl = `wss://stream.binance.com:9443/ws/${symbol}@kline_1m`;
        
        const ws = new WebSocket(wsUrl);
        
        ws.on('open', () => {
          console.log(`✅ WebSocket подключен: ${pair}`);
          resolve(ws);
        });
        
        ws.on('message', (data) => {
          try {
            const json = JSON.parse(data);
            const kline = json.k;
            
            // ✅ УЛУЧШЕНО: Обрабатываем каждое обновление свечи, не только закрытие
            // Это даст нам гораздо больше сигналов для торговли
            if (kline) {
              this.onNewCandle(pair, {
                time: kline.t,
                open: parseFloat(kline.o),
                high: parseFloat(kline.h),
                low: parseFloat(kline.l),
                close: parseFloat(kline.c),
                volume: parseFloat(kline.v),
                isClosed: kline.x // Флаг закрытия свечи
              });
            }
          } catch (error) {
            console.error(`❌ Ошибка при обработке ${pair}:`, error.message);
          }
        });
        
        ws.on('error', (error) => {
          console.error(`❌ WebSocket ошибка ${pair}:`, error.message);
          reject(error);
        });
        
        this.activeWebSockets[pair] = ws;
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * ✅ НОВОЕ: Проверка stop-loss и take-profit для открытых позиций
   * - Stop-Loss: -1.5% от entry (жесткая защита от убытков)
   * - Take-Profit: +3% от entry (фиксируем хорошую прибыль)
   */
  checkStopLossAndTakeProfit(pair, currentPrice) {
    try {
      // Ищем последнюю открытую BUY сделку
      let openTrade = null;
      for (let i = this.portfolio.trades.length - 1; i >= 0; i--) {
        const t = this.portfolio.trades[i];
        if (t.pair === pair && t.action === 'BUY' && !t.closedAt) {
          openTrade = t;
          break;
        }
      }
      
      if (!openTrade || !this.portfolio.positions[pair] || this.portfolio.positions[pair] <= 0) {
        return false; // Нет открытой позиции
      }
      
      const entryPrice = openTrade.entryPrice;
      const percentChange = ((currentPrice - entryPrice) / entryPrice) * 100;
      
      // ✅ STOP-LOSS: -1.5% (защищаемся быстро)
      if (percentChange < -1.5) {
        console.log(`🛑 STOP-LOSS TRIGGERED for ${pair}: ${percentChange.toFixed(2)}% loss at $${currentPrice.toFixed(2)}`);
        
        // Создаём SELL сигнал (автоматический стоп)
        const stopLossTrade = {
          pair,
          action: 'SELL',
          exitPrice: currentPrice,
          quantity: this.portfolio.positions[pair],
          timestamp: new Date().toISOString(),
          confidence: 1.0, // Максимальная confidence для стопа
          rsi: 50,
          signal: 0.5,
          isStopLoss: true, // ✅ Маркер для отладки
          entryPrice: entryPrice
        };
        
        this.executeTrade(pair, stopLossTrade, currentPrice);
        return true;
      }
      
      // ✅ TAKE-PROFIT: +3% (зарабатываем когда эффективно)
      if (percentChange > 3) {
        console.log(`💰 TAKE-PROFIT TRIGGERED for ${pair}: ${percentChange.toFixed(2)}% profit at $${currentPrice.toFixed(2)}`);
        
        // Создаём SELL сигнал (автоматический профит)
        const takeProfitTrade = {
          pair,
          action: 'SELL',
          exitPrice: currentPrice,
          quantity: this.portfolio.positions[pair],
          timestamp: new Date().toISOString(),
          confidence: 1.0, // Максимальная confidence для ТП
          rsi: 50,
          signal: 0.5,
          isTakeProfit: true, // ✅ Маркер для отладки
          entryPrice: entryPrice
        };
        
        this.executeTrade(pair, takeProfitTrade, currentPrice);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`❌ Ошибка при проверке SL/TP для ${pair}:`, error.message);
      return false;
    }
  }

  /**
   * Обработка новой свечи (сигнал для торговли)
   * ✅ REFACTORED: Добавлено логирование для отладки + проверка SL/TP
   */
  async onNewCandle(pair, candle) {
    try {
      // Сохраняем текущую цену
      this.priceFeeds[pair] = candle.close;
      
      // ✅ FIXED: Сохраняем свечу в историю (нужно для RSI, MACD и т.д.)
      if (!this.candleHistory[pair]) {
        this.candleHistory[pair] = [];
      }
      this.candleHistory[pair].push(candle);
      
      // Удерживаем последние 100 свечей (достаточно для любых индикаторов)
      if (this.candleHistory[pair].length > 100) {
        this.candleHistory[pair].shift();
      }
      
      // ✅ НОВОЕ: Проверяем stop-loss и take-profit ПЕРЕД генерацией сигнала
      const slTpTriggered = this.checkStopLossAndTakeProfit(pair, candle.close);
      
      // Генерируем сигнал (только если не сработал SL/TP)
      const signal = await this.generateSignal(pair, candle);
      
      // ✅ Логирование для отладки (каждый 10-й сигнал чтобы не спамить)
      if (Math.random() < 0.05) {
        console.log(`  📡 [${pair}] close=${candle.close.toFixed(2)} | Signal=${signal.action} | Conf=${(signal.confidence * 100).toFixed(0)}%`);
      }
      
      if (signal.action !== 'HOLD' && !slTpTriggered) {
        await this.executeTrade(pair, signal, candle.close);
      }
    } catch (error) {
      console.error(`❌ Ошибка при обработке свечи ${pair}:`, error);
    }
  }

  /**
   * ✅ REFACTORED v3: Максимально прибыльная стратегия
   * - BUY: RSI < 30 (глубокая перепроданность) = хороший вход
   * - SELL: автоматически через SL (-1.5%) или TP (+3%)
   * - Confidence: выше, когда RSI ниже
   * - Фильтр: BUY только если confidence > 70%
   */
  async generateSignal(pair, candle) {
    const rsi = this.calculateRSI(pair, 14);
    const macd = this.calculateMACD(pair);
    
    let confidence = 0;
    let action = 'HOLD';
    
    // ✅ BUY: RSI < 30 (очень перепроданный рынок, хороший вход)
    if (rsi < 30 && candle.close > candle.open) {
      action = 'BUY';
      // Confidence растет с каждым пункт ниже 30
      // RSI = 30 → confidence = 0.70
      // RSI = 0 → confidence = 1.0
      confidence = Math.min(0.70 + ((30 - rsi) / 30) * 0.30, 1.0);
    }
    // SELL: Автоматический через SL/TP (не нужно явно генерировать SELL сигнал)
    // Все позиции закрываются через checkStopLossAndTakeProfit()
    
    return {
      action,
      confidence,
      rsi,
      macd,
      timestamp: Date.now()
    };
  }

  /**
   * ✅ FIXED: Расчет RSI из реальных данных свечей (не случайные числа)
   */
  calculateRSI(pair, period = 14) {
    // Получаем историю свечей
    const history = this.candleHistory[pair] || [];
    
    // Если недостаточно данных, возвращаем нейтральное значение
    if (history.length < period + 1) {
      return 50; // Нейтральный RSI
    }
    
    // Получаем последние period+1 свечей для расчета
    const closes = history.slice(-period - 1).map(c => c.close);
    
    // Считаем изменения
    const changes = [];
    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }
    
    // Разделяем на gains и losses
    let gains = 0, losses = 0;
    changes.forEach(change => {
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    });
    
    // Считаем средние gain и loss
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    // Считаем RS и RSI
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    return Math.max(0, Math.min(100, rsi));
  }

  /**
   * ✅ FIXED: Расчет MACD из реальных данных свечей (не случайные числа)
   */
  calculateMACD(pair) {
    const history = this.candleHistory[pair] || [];
    const closes = history.map(c => c.close);
    
    // Нужно минимум 26 свечей для расчета MACD
    if (closes.length < 26) {
      return {
        macd: 0,
        signal: 0,
        histogram: 0
      };
    }
    
    // EMA 12
    const ema12 = this.calculateEMA(closes, 12);
    // EMA 26
    const ema26 = this.calculateEMA(closes, 26);
    
    // MACD = EMA12 - EMA26
    const macd = ema12 - ema26;
    
    // Signal line = EMA9 от MACD (упрощенно: берем последние 9 значений)
    // Для простоты: signal ≈ EMA12 * 0.8 (грубое приближение)
    const signal = macd * 0.8;
    
    return {
      macd,
      signal,
      histogram: macd - signal
    };
  }
  
  /**
   * ✅ Вспомогательный расчет EMA
   */
  calculateEMA(values, period) {
    if (values.length < period) return values[values.length - 1] || 0;
    
    const multiplier = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((a, b) => a + b) / period;
    
    for (let i = period; i < values.length; i++) {
      ema = values[i] * multiplier + ema * (1 - multiplier);
    }
    
    return ema;
  }

  /**
   * Расчет Momentum (новый индикатор)
   */
  calculateMomentum(pair) {
    const pairHash = pair.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    const baseValue = Math.sin((Date.now() + pairHash) / 30000);
    return baseValue + (Math.random() - 0.5) * 0.3;
  }

  /**
   * Выполнение сделки
   * ✅ REFACTORED: Лучше логирование, обработка ошибок, защита от edge cases
   * ✅ НОВОЕ: Комиссии за открытие/закрытие (0.1% = Binance) и фильтр confidence > 80%
   */
  async executeTrade(pair, signal, currentPrice) {
    try {
      // Валидация входных параметров
      if (!signal || !pair || currentPrice <= 0) {
        console.warn(`⚠️  Попытка сделки с невалидными параметрами: pair=${pair}, price=${currentPrice}`);
        return;
      }

      // ✅ ФИЛЬТР: Только BUY с confidence > 70% (УЛУЧШЕНО: было 80%)
      if (signal.action === 'BUY' && signal.confidence < 0.70) {
        // Сигнал слишком слабый — пропускаем
        return;
      }

      const positionSize = this.calculatePositionSize(pair, currentPrice, signal.confidence);
      
      if (positionSize === 0) {
        // Позиция слишком маленькая — пропускаем
        return;
      }
      
      if (signal.action === 'BUY') {
        const cost = positionSize * currentPrice;
        
        // ✅ НОВОЕ: Комиссия за открытие позиции (0.1% = стандарт Binance)
        const commissionRate = 0.001; // 0.1%
        const commission = cost * commissionRate;
        const totalCost = cost + commission;
        
        // Проверяем баланс (с учетом комиссии)
        if (totalCost > this.portfolio.cash) {
          console.warn(
            `⚠️  SKIP BUY ${pair}: недостаточно средств ` +
            `(нужно $${totalCost.toFixed(2)}, есть $${this.portfolio.cash.toFixed(2)})`
          );
          return;
        }
        
        // Создаем и сохраняем сделку
        const trade = {
          pair,
          action: signal.action,
          entryPrice: currentPrice,
          quantity: positionSize,
          timestamp: new Date().toISOString(),
          confidence: signal.confidence,
          rsi: signal.rsi,
          signal: signal.mlSignal,
          commission: commission, // ✅ НОВОЕ: Сохраняем комиссию
          cost: cost // ✅ НОВОЕ: Сохраняем чистую стоимость (без комиссии)
        };
        
        // Обновляем портфель (вычитаем cost + commission)
        this.portfolio.cash -= totalCost;
        this.portfolio.positions[pair] = (this.portfolio.positions[pair] || 0) + positionSize;
        this.portfolio.trades.push(trade);
        
        // ✅ Обновляем dashboard сразу
        try {
          this.updateDashboard(trade);
        } catch (err) {
          console.error('❌ Ошибка при обновлении dashboard после BUY:', err.message);
        }

        console.log(`🟢 BUY ${pair}: ${positionSize.toFixed(8)} @ $${currentPrice.toFixed(2)}`);
        console.log(`   📊 RSI: ${signal.rsi.toFixed(1)}, Confidence: ${(signal.confidence * 100).toFixed(1)}%`);
        console.log(`   💰 Cost: $${cost.toFixed(2)} + Commission: $${commission.toFixed(4)} = $${totalCost.toFixed(2)}`);
        console.log(`   💵 Cash left: $${this.portfolio.cash.toFixed(2)}\n`);
        
      } else if (signal.action === 'SELL') {
        // Проверяем наличие открытой позиции
        if (!this.portfolio.positions[pair] || this.portfolio.positions[pair] <= 0) {
          // Нет открытой позиции — пропускаем
          return;
        }

        const actualPositionSize = Math.min(positionSize, this.portfolio.positions[pair]);
        const revenue = actualPositionSize * currentPrice;
        
        // ✅ НОВОЕ: Комиссия за закрытие позиции (0.1%)
        const commissionRate = 0.001; // 0.1%
        const closeCommission = revenue * commissionRate;
        const netRevenue = revenue - closeCommission;
        
        this.portfolio.cash += netRevenue;
        this.portfolio.positions[pair] -= actualPositionSize;
        
        // Найдем соответствующую BUY сделку
        let buyTrade = null;
        
        for (let i = this.portfolio.trades.length - 1; i >= 0; i--) {
          const t = this.portfolio.trades[i];
          if (t.pair === pair && t.action === 'BUY' && !t.closedAt) {
            buyTrade = t;
            break;
          }
        }
        
        if (buyTrade) {
          // ✅ НОВОЕ: Прибыль рассчитывается ПОСЛЕ обеих комиссий
          const openCommission = buyTrade.commission || 0;
          const totalCommission = openCommission + closeCommission;
          const profit = netRevenue - (buyTrade.entryPrice * actualPositionSize) - openCommission;
          const returnPercent = (profit / (buyTrade.entryPrice * actualPositionSize)) * 100;
          
          // Создаем SELL сделку
          const trade = {
            pair,
            action: signal.action,
            exitPrice: currentPrice,
            quantity: actualPositionSize,
            timestamp: new Date().toISOString(),
            confidence: signal.confidence,
            rsi: signal.rsi,
            signal: signal.mlSignal,
            profit: profit,
            returnPercent: returnPercent,
            entryPrice: buyTrade.entryPrice,
            closedAt: new Date().toISOString(),
            openCommission: openCommission, // ✅ НОВОЕ: Комиссия открытия
            closeCommission: closeCommission, // ✅ НОВОЕ: Комиссия закрытия
            totalCommission: totalCommission // ✅ НОВОЕ: Всего комиссии
          };
          
          // Обновляем статистику
          this.portfolio.totalTrades++;
          if (profit > 0) this.portfolio.winTrades++;
          else this.portfolio.lossTrades++;
          
          this.portfolio.totalProfit += profit;
          this.portfolio.trades.push(trade);
          
          // Обновляем dashboard
          try {
            this.updateDashboard(trade);
          } catch (err) {
            console.error('❌ Ошибка при обновлении dashboard после SELL:', err.message);
          }
          
          console.log(`🔴 SELL ${pair}: ${actualPositionSize.toFixed(8)} @ $${currentPrice.toFixed(2)}`);
          console.log(`   📊 Entry: $${buyTrade.entryPrice.toFixed(2)}, RSI: ${signal.rsi.toFixed(1)}`);
          console.log(`   💹 Profit (after fees): ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)} (${returnPercent.toFixed(2)}%)`);
          console.log(`   📊 Commissions: Open $${openCommission.toFixed(4)} + Close $${closeCommission.toFixed(4)} = $${totalCommission.toFixed(4)}`);
          console.log(`   💰 Revenue: $${revenue.toFixed(2)}, Net: $${netRevenue.toFixed(2)}, Cash: $${this.portfolio.cash.toFixed(2)}\n`);
        } else {
          console.warn(`⚠️  SELL ${pair}: не найдена соответствующая BUY сделка\n`);
        }
      }
    } catch (error) {
      console.error(`❌ Ошибка при выполнении сделки ${pair}:`, error.message);
    }
  }

  /**
   * Расчет размера позиции (Kelly Criterion + улучшения)
   * ✅ REFACTORED: Более гибкий расчет с адаптацией к portfolio size
   */
  calculatePositionSize(pair, currentPrice, confidence) {
    try {
      // Базовый размер позиции как % от портфеля
      const portfolioValue = this.portfolio.cash + 
                            Object.entries(this.portfolio.positions).reduce((sum, [p, qty]) => {
                              return sum + (qty * (this.priceFeeds[p] || 0));
                            }, 0);
      
      // Начисляем как %  от потфеля (адаптируется к confidence)
      const baseAllocation = portfolioValue * 0.02; // 2% базовой позиции
      const confidenceMultiplier = Math.min(confidence, 1); // 0 - 1
      
      // Финальный размер денег для позиции
      const positionCost = baseAllocation * (0.5 + confidenceMultiplier * 1.5); // 0.5 - 2x множитель
      
      // Если не хватает денег, используем то что есть
      const actualCost = Math.min(positionCost, this.portfolio.cash * 0.3); // Макс 30% cash в одну сделку
      
      // ✅ НОВОЕ: Минимальный размер позиции - $50 (чтобы избежать микро-позиций)
      if (actualCost < 50) {
        return 0; // Позиция слишком маленькая — пропускаем
      }
      
      // Конвертируем в количество
      const positionSize = actualCost / currentPrice;
      
      // Минимум микро-позиции (0.0001) и максимум, чтобы не было edge cases
      return Math.max(
        Math.floor(positionSize * 100000000) / 100000000, // 8 decimal places
        0
      );
    } catch (error) {
      console.error(`❌ Ошибка при расчете размера позиции ${pair}:`, error.message);
      return 0;
    }
  }

  /**
   * Обновить информацию об открытых позициях на dashboard
   */
  updateOpenPositions() {
    if (!this.dashboardServer) return;
    
    const openPositions = [];
    for (const [pair, quantity] of Object.entries(this.portfolio.positions)) {
      if (quantity > 0) {
        const currentPrice = this.priceFeeds[pair] || 0;
        const positionValue = quantity * currentPrice;
        
        // Найти BUY сделку для этой пары
        let entryPrice = 0;
        for (let i = this.portfolio.trades.length - 1; i >= 0; i--) {
          const t = this.portfolio.trades[i];
          if (t.pair === pair && t.action === 'BUY' && !t.closedAt) {
            entryPrice = t.entryPrice;
            break;
          }
        }
        
        const unrealizedProfit = positionValue - (quantity * entryPrice);
        const unrealizedReturn = entryPrice > 0 ? ((unrealizedProfit / (quantity * entryPrice)) * 100) : 0;
        
        openPositions.push({
          pair,
          quantity: parseFloat(quantity.toFixed(4)),
          entryPrice: parseFloat(entryPrice.toFixed(2)),
          currentPrice: parseFloat(currentPrice.toFixed(2)),
          positionValue: parseFloat(positionValue.toFixed(2)),
          unrealizedProfit: parseFloat(unrealizedProfit.toFixed(2)),
          unrealizedReturn: parseFloat(unrealizedReturn.toFixed(2))
        });
      }
    }
    
    this.dashboardServer.updateOpenPositions(openPositions);
  }

  /**
   * Обновить информацию о модели на dashboard
   */
  updateModelInfo(confidence, accuracy) {
    if (!this.dashboardServer) return;
    
    this.dashboardServer.updateModel({
      status: this.isRunning ? 'running' : 'ready',
      accuracy: parseFloat(accuracy.toFixed(2)),
      avgConfidence: parseFloat(confidence.toFixed(2))
    });
  }

  /**
   * Запуск paper trading
   */
  async start() {
    console.log(`\n${'='.repeat(70)}`);
    console.log('🎬 ЗАПУСК PAPER TRADING');
    console.log(`${'='.repeat(70)}\n`);
    
    console.log(`📊 Начальный капитал: $${this.portfolio.cash.toFixed(2)}`);
    console.log(`📈 Торговые пары (всего): ${this.tradingPairs.length}`);
    console.log(`   ${this.tradingPairs.slice(0, 5).join(', ')}...`);
    console.log(`🔐 Минимальная confidence: ${(this.minConfidence * 100).toFixed(1)}%`);
    console.log(`⏰ Начало: ${new Date().toLocaleString()}\n`);
    
    // Сохраняем время старта для расчета длительности
    this.startTime = Date.now();
    this.isRunning = true;
    
    try {
      // Подключаемся к WebSocket для ВСЕХ пар
      let connected = 0;
      for (const pair of this.tradingPairs) {
        try {
          await this.connectToWebSocket(pair);
          connected++;
          // Задержка 200ms между подключениями чтобы не перегружать
          if (connected % 10 === 0) {
            console.log(`✅ Подключено ${connected}/${this.tradingPairs.length} пар`);
          }
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          console.error(`❌ Не смог подключиться к ${pair}:`, error.message);
        }
      }
      
      console.log(`\n✅ Подключено ${connected}/${this.tradingPairs.length} пар`);
      console.log(`🎯 Paper trading запущен. Ожидаем торговых сигналов...\n`);
      
      // Обновляем dashboard статус
      if (this.dashboardServer) {
        this.dashboardServer.updateStatus('running');
        this.dashboardServer.updatePairs(connected, this.tradingPairs.length, this.tradingPairs);
        // Запускаем таймер сессии
        this.dashboardServer.startSession();
      }
      
      // Логирование статуса каждые 30 сек
      this.statusInterval = setInterval(() => this.logStatus(), 30000);
      
    } catch (error) {
      console.error('❌ Ошибка при запуске:', error);
      this.stop();
    }
  }

  /**
   * Логирование текущего статуса
   */
  logStatus() {
    const portfolioValue = this.portfolio.cash + 
                          Object.entries(this.portfolio.positions).reduce((sum, [pair, qty]) => {
                            return sum + (qty * (this.priceFeeds[pair] || 0));
                          }, 0);
    
    const roi = ((portfolioValue - this.config.initialCapital) / this.config.initialCapital) * 100;
    const winRate = ((this.portfolio.winTrades / 
                     (this.portfolio.winTrades + this.portfolio.lossTrades || 1)) * 100);
    
    console.log(`\n📊 СТАТУС (${new Date().toLocaleTimeString()})`);
    console.log(`${'─'.repeat(50)}`);
    console.log(`Стоимость портфеля: $${portfolioValue.toFixed(2)}`);
    console.log(`Прибыль: $${this.portfolio.totalProfit.toFixed(2)} (${roi.toFixed(2)}%)`);
    console.log(`Сделок: ${this.portfolio.trades.length} (W: ${this.portfolio.winTrades}, L: ${this.portfolio.lossTrades})`);
    console.log(`Win Rate: ${winRate.toFixed(1)}%`);
    console.log(`${'─'.repeat(50)}`);
    
    // Отправляем обновления в dashboard
    if (this.dashboardServer) {
      this.dashboardServer.updatePortfolio({
        cash: this.portfolio.cash,
        value: portfolioValue,
        positions: Object.keys(this.portfolio.positions).length
      });
      
      this.dashboardServer.updateMetrics({
        totalProfit: this.portfolio.totalProfit,
        ROI: parseFloat(roi.toFixed(2)),
        totalTrades: this.portfolio.totalTrades,
        winTrades: this.portfolio.winTrades,
        lossTrades: this.portfolio.lossTrades,
        winRate: parseFloat(winRate.toFixed(1))
      });
    }
  }

  /**
   * Остановка trading
   */
  stop() {
    console.log(`\n⏹️  Остановка paper trading...`);
    
    this.isRunning = false;
    
    // Закрываем все WebSocket подключения
    Object.entries(this.activeWebSockets).forEach(([pair, ws]) => {
      try {
        ws.close();
      } catch (error) {
        console.error(`Ошибка при закрытии WebSocket для ${pair}:`, error);
      }
    });
    
    // Сохраняем финальный отчет
    this.saveReport();
    
    // Останавливаем логирование статуса
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }
    
    // Обновляем dashboard статус
    if (this.dashboardServer) {
      this.dashboardServer.updateStatus('stopped');
      this.dashboardServer.stopSession();
    }
  }

  /**
   * Сохранение финального отчета
   */
  saveReport() {
    const portfolioValue = this.portfolio.cash + 
                          Object.entries(this.portfolio.positions).reduce((sum, [pair, qty]) => {
                            return sum + (qty * (this.priceFeeds[pair] || 0));
                          }, 0);
    
    const roi = ((portfolioValue - this.config.initialCapital) / this.config.initialCapital) * 100;
    const winRate = ((this.portfolio.winTrades / 
                     (this.portfolio.winTrades + this.portfolio.lossTrades || 1)) * 100);
    
    const report = {
      startTime: new Date(this.portfolio.startTime).toISOString(),
      endTime: new Date().toISOString(),
      durationHours: (Date.now() - this.portfolio.startTime) / 3600000,
      initialCapital: this.config.initialCapital,
      finalValue: portfolioValue,
      totalProfit: this.portfolio.totalProfit,
      roi: roi,
      totalTrades: this.portfolio.trades.length,
      winTrades: this.portfolio.winTrades,
      lossTrades: this.portfolio.lossTrades,
      winRate: winRate,
      trades: this.portfolio.trades
    };
    
    const reportPath = path.join(this.logsDir, `paper-trading-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    
    console.log(`\n✅ Отчет сохранен: ${reportPath}\n`);
    console.log(`📊 ФИНАЛЬНЫЙ РЕЗУЛЬТАТ`);
    console.log(`${'='.repeat(50)}`);
    console.log(`Начальный капитал: $${report.initialCapital.toFixed(2)}`);
    console.log(`Финальная стоимость: $${report.finalValue.toFixed(2)}`);
    console.log(`Прибыль: $${report.totalProfit.toFixed(2)}`);
    console.log(`ROI: ${report.roi.toFixed(2)}%`);
    console.log(`Сделок (закрытых): ${report.totalTrades}`);
    console.log(`Выигрышных: ${report.winTrades} | Убыточных: ${report.lossTrades}`);
    console.log(`Win Rate: ${report.winRate.toFixed(1)}%`);
    console.log(`Длительность: ${report.durationHours.toFixed(2)} часов`);
    console.log(`${'='.repeat(50)}\n`);
  }

  // Обновляем dashboard если он подключен
  updateDashboard(trade) {
    if (!this.dashboardServer) return;
    
    // Рассчитываем портфель
    let totalPositionValue = 0;
    const currentPositions = {};
    
    // Обновляем открытые позиции с текущей стоимостью
    Object.entries(this.portfolio.positions).forEach(([pair, quantity]) => {
      if (quantity > 0) {
        const currentPrice = this.priceFeeds[pair] || 0;
        const positionValue = quantity * currentPrice;
        totalPositionValue += positionValue;
        
        currentPositions[pair] = {
          quantity,
          entryPrice: this.getEntryPrice(pair, quantity),
          currentPrice,
          leverage: 1
        };
      }
    });
    
    const portfolioValue = this.portfolio.cash + totalPositionValue;
    
    // Обновляем портфель
    this.dashboardServer.updatePortfolio({
      initialCapital: this.portfolio.initialCapital,
      cash: this.portfolio.cash,
      value: portfolioValue,
      positions: Object.keys(currentPositions).length
    });
    
    // Обновляем метрики
    const profit = portfolioValue - this.portfolio.initialCapital;
    const roi = ((profit / this.portfolio.initialCapital) * 100).toFixed(2);
    const winRate = this.portfolio.totalTrades > 0 
      ? ((this.portfolio.winTrades / this.portfolio.totalTrades) * 100).toFixed(2)
      : 0;
    
    this.dashboardServer.updateMetrics({
      totalProfit: parseFloat(profit.toFixed(2)),
      roi: parseFloat(roi),
      totalTrades: this.portfolio.totalTrades,
      winTrades: this.portfolio.winTrades,
      lossTrades: this.portfolio.lossTrades,
      winRate: parseFloat(winRate)
    });
    
    // Обновляем открытые позиции
    this.dashboardServer.updateOpenPositions(currentPositions);
    
    // Добавляем сделку в историю если она передана
    if (trade) {
      this.dashboardServer.addTrade({
        pair: trade.pair,
        action: trade.action,
        price: parseFloat(trade.price || trade.entryPrice).toFixed(2),
        quantity: parseFloat(trade.quantity || trade.amount).toFixed(8),
        profit: trade.profit || 0,
        time: new Date(trade.timestamp).toLocaleTimeString('ru-RU', { 
          hour: '2-digit', 
          minute: '2-digit',
          second: '2-digit'
        })
      });
    }
  }

  /**
   * Получить цену входа для пары (средняя цена покупки)
   */
  getEntryPrice(pair, quantity) {
    let totalQuantity = 0;
    let totalCost = 0;
    
    // Ищем все покупки этой пары
    for (const trade of this.portfolio.trades) {
      if (trade.pair === pair && trade.action === 'BUY' && !trade.closedAt) {
        totalQuantity += trade.quantity;
        totalCost += trade.quantity * trade.entryPrice;
      }
    }
    
    return totalQuantity > 0 ? totalCost / totalQuantity : 0;
  }
}

// ============================================
// MAIN EXECUTION
// ============================================

async function main() {
  // Загружаем конфиг
  const configPath = path.join(__dirname, '../config/live-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  const bot = new PaperTradingBot(config);
  
  // Запускаем
  await bot.start();
  
  // Останавливаем через 1 час (для тестирования)
  setTimeout(() => {
    bot.stop();
    process.exit(0);
  }, 3600000);
  
  // Graceful shutdown на Ctrl+C
  process.on('SIGINT', () => {
    bot.stop();
    process.exit(0);
  });
}

// Запуск если вызвано напрямую
if (require.main === module) {
  main().catch(console.error);
}

module.exports = PaperTradingBot;
