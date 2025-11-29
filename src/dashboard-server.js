/**
 * Dashboard Server v1.0
 * 
 * WebSocket сервер для отправки live данных торговли на фронтенд
 * Обслуживает статические файлы и управляет подключениями
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

class DashboardServer extends EventEmitter {
  constructor(port = 3000) {
    super();
    this.port = port;
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    
    this.clients = new Set();
    this.sessionStartTime = null;
    
    this.botData = {
      status: 'waiting',
      portfolio: {
        initialCapital: 10000,
        cash: 10000,
        value: 10000,
        positions: {}
      },
      metrics: {
        totalProfit: 0,
        roi: 0,
        totalTrades: 0,
        winTrades: 0,
        lossTrades: 0,
        winRate: 0,
        duration: 0,
        durationFormatted: '0h 0m 0s',
        timestamp: new Date()
      },
      model: {
        status: 'initializing',  // initializing, ready, running, paused
        accuracy: 0,
        avgConfidence: 0,
        lastUpdate: new Date(),
        signalsPerMinute: 0,
        modelType: 'LSTM'
      },
      pairs: {
        total: 29,
        connected: 0,
        list: []
      },
      lastTrades: [],
      openPositions: [],  // Активные открытые позиции
      sessionInfo: {
        startTime: null,
        uptime: '0h 0m 0s',
        elapsedSeconds: 0
      }
    };

    this.setupExpress();
    this.setupWebSocket();
  }

  setupExpress() {
    // Обслуживаем статические файлы
    this.app.use(express.static(path.join(__dirname, '../public')));
    
    // API endpoints
    this.app.get('/api/status', (req, res) => {
      res.json(this.botData);
    });

    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/dashboard.html'));
    });

    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', connectedClients: this.clients.size });
    });
  }

  setupWebSocket() {
    this.wss.on('connection', (ws) => {
      console.log('✅ WebSocket клиент подключен');
      this.clients.add(ws);

      // Отправляем текущее состояние
      ws.send(JSON.stringify(this.botData));

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleClientMessage(data, ws);
        } catch (error) {
          console.error('Ошибка парсинга WebSocket сообщения:', error);
        }
      });

      ws.on('close', () => {
        console.log('🔌 WebSocket клиент отключен');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('❌ WebSocket ошибка:', error);
      });
    });
  }

  handleClientMessage(data, ws) {
    switch(data.command) {
      case 'ping':
        ws.send(JSON.stringify(this.botData));
        break;
      case 'start':
        this.emit('trading:start');
        break;
      case 'stop':
        this.emit('trading:stop');
        break;
      case 'reset':
        this.emit('trading:reset');
        this.resetData();
        break;
      default:
        console.log('Неизвестная команда:', data.command);
    }
  }

  /**
   * Обновить данные портфеля
   */
  updatePortfolio(portfolio) {
    this.botData.portfolio = {
      ...this.botData.portfolio,
      ...portfolio
    };
    this.broadcastUpdate();
  }

  /**
   * Обновить метрики торговли
   */
  updateMetrics(metrics) {
    this.botData.metrics = {
      ...this.botData.metrics,
      ...metrics,
      timestamp: new Date()
    };
    this.broadcastUpdate();
  }

  /**
   * Обновить статус
   */
  updateStatus(status) {
    this.botData.status = status;
    this.broadcastUpdate();
  }

  /**
   * Добавить новую сделку
   */
  addTrade(trade) {
    this.botData.lastTrades.unshift({
      ...trade,
      time: new Date()
    });

    // Ограничиваем количество отображаемых сделок
    if (this.botData.lastTrades.length > 20) {
      this.botData.lastTrades.pop();
    }

    this.broadcastUpdate();
  }

  /**
   * Обновить информацию о модели
   */
  updateModel(modelData) {
    this.botData.model = {
      ...this.botData.model,
      ...modelData,
      lastUpdate: new Date()
    };
    this.broadcastUpdate();
  }

  /**
   * Обновить открытые позиции с расчетом плеча и % от капитала
   */
  updateOpenPositions(positions) {
    // Позиции: { pair: { quantity, entryPrice, currentPrice, leverage } }
    const enrichedPositions = Object.entries(positions).map(([pair, position]) => {
      const positionValue = position.quantity * position.currentPrice;
      const capitalPercentage = (positionValue / this.botData.portfolio.initialCapital) * 100;
      const pnl = (position.currentPrice - position.entryPrice) * position.quantity;
      const pnlPercent = ((pnl / positionValue) * 100).toFixed(2);
      
      return {
        pair,
        quantity: parseFloat(position.quantity.toFixed(8)),
        entryPrice: parseFloat(position.entryPrice.toFixed(8)),
        currentPrice: parseFloat(position.currentPrice.toFixed(8)),
        positionValue: parseFloat(positionValue.toFixed(2)),
        capitalPercentage: parseFloat(capitalPercentage.toFixed(2)),
        leverage: position.leverage || 1,
        pnl: parseFloat(pnl.toFixed(2)),
        pnlPercent: parseFloat(pnlPercent),
        timestamp: new Date()
      };
    });
    
    this.botData.openPositions = enrichedPositions;
    this.broadcastUpdate();
  }

  /**
   * Начать торговую сессию (запустить таймер)
   */
  startSession() {
    this.sessionStartTime = Date.now();
    this.botData.sessionInfo.startTime = new Date(this.sessionStartTime);
    
    // Таймер обновления времени сессии каждую секунду
    if (this.sessionTimer) {
      clearInterval(this.sessionTimer);
    }
    
    this.sessionTimer = setInterval(() => {
      if (this.sessionStartTime) {
        const elapsedMs = Date.now() - this.sessionStartTime;
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        const hours = Math.floor(elapsedSeconds / 3600);
        const minutes = Math.floor((elapsedSeconds % 3600) / 60);
        const seconds = elapsedSeconds % 60;
        
        this.botData.sessionInfo.uptime = `${hours}h ${minutes}m ${seconds}s`;
        this.botData.sessionInfo.elapsedSeconds = elapsedSeconds;
        
        this.broadcastUpdate();
      }
    }, 1000);
  }

  /**
   * Остановить торговую сессию (остановить таймер)
   */
  stopSession() {
    if (this.sessionTimer) {
      clearInterval(this.sessionTimer);
      this.sessionTimer = null;
    }
    this.sessionStartTime = null;
  }

  /**
   * Обновить статус пар
   */
  updatePairs(connected, total, list = []) {
    this.botData.pairs = {
      total,
      connected,
      list
    };
    this.broadcastUpdate();
  }

  /**
   * Отправить обновление всем клиентам
   */
  broadcastUpdate() {
    const message = JSON.stringify(this.botData);
    
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          console.error('Ошибка отправки WebSocket сообщения:', error);
        }
      }
    });
  }

  /**
   * Сбросить данные
   */
  resetData() {
    this.stopSession();
    
    this.botData = {
      status: 'waiting',
      portfolio: {
        initialCapital: 10000,
        cash: 10000,
        value: 10000,
        positions: {}
      },
      metrics: {
        totalProfit: 0,
        roi: 0,
        totalTrades: 0,
        winTrades: 0,
        lossTrades: 0,
        winRate: 0,
        duration: 0,
        durationFormatted: '0h 0m 0s',
        timestamp: new Date()
      },
      model: {
        status: 'initializing',
        accuracy: 0,
        avgConfidence: 0,
        lastUpdate: new Date(),
        signalsPerMinute: 0,
        modelType: 'LSTM'
      },
      pairs: {
        total: 29,
        connected: 0,
        list: []
      },
      lastTrades: [],
      openPositions: [],
      sessionInfo: {
        startTime: null,
        uptime: '0h 0m 0s',
        elapsedSeconds: 0
      }
    };
    this.broadcastUpdate();
  }

  /**
   * Запустить сервер
   */
  start() {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`🚀 Dashboard сервер запущен: http://localhost:${this.port}`);
        console.log(`📊 Откройте http://localhost:${this.port} в браузере`);
        resolve();
      });
    });
  }

  /**
   * Остановить сервер
   */
  stop() {
    return new Promise((resolve) => {
      this.stopSession();
      this.clients.forEach(client => client.close());
      this.wss.close();
      this.server.close(() => {
        console.log('🛑 Dashboard сервер остановлен');
        resolve();
      });
    });
  }

  /**
   * Получить количество подключенных клиентов
   */
  getConnectedClients() {
    return this.clients.size;
  }

  /**
   * Сбросить данные портфеля (reset)
   */
  resetData() {
    this.botData = {
      status: 'waiting',
      portfolio: {
        initialCapital: 10000,
        cash: 10000,
        value: 10000,
        positions: {}
      },
      metrics: {
        totalProfit: 0,
        roi: 0,
        totalTrades: 0,
        winTrades: 0,
        lossTrades: 0,
        winRate: 0,
        duration: 0,
        timestamp: new Date()
      },
      pairs: {
        total: 29,
        connected: 0,
        list: []
      },
      lastTrades: []
    };
    
    // Отправляем очищенные данные клиентам
    this.broadcastUpdate();
  }
}

module.exports = DashboardServer;
