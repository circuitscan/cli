import {cursorUp, cursorLeft} from 'ansi-escapes';

import {formatBytes} from './utils.js';

export class NotFoundError extends Error {}

export class StatusLogger {
  constructor(url, interval, maxMemGB) {
    this.url = url;
    this.interval = interval;
    this.previousLength = 0;
    this.startTime = 0;
    this.intervalId = null;
    this.stopped = false;
    this.lastData = null;
    this.logSuffix = null;
    this.statusBars = [
      {
        msg: 'Circomkit Log',
        handler(data) {
          this.appendBuffer(data.data.msg);
        },
      },
      {
        msg: 'Circom memory usage',
        handler(data) {
          const usage = data.data.memoryUsage * 100 / (maxMemGB * (1024 ** 2));
          this.setSuffix(`Circom Compiler Memory Usage: ${usage.toFixed(2)}% (${formatBytes(data.data.memoryUsage * 1024)})`);
        },
      },
      {
        msg: 'Memory Usage Update',
        handler(data) {
          const disk = data.data.disk.find(x => x.Mounted === '/tmp')
            // Docker mode won't have a specific /tmp mount
            || data.data.disk.find(x => x.Mounted === '/');
          const memUsage = data.data.memory.rss * 100 / (maxMemGB * (1024 ** 3));
          const diskUsage = Number(disk['Used']) * 100 / Number(disk['1K-blocks']);
          this.setSuffix(`Memory Usage: ${memUsage.toFixed(2)}% (${formatBytes(data.data.memory.rss)}), Disk Usage: ${diskUsage.toFixed(2)}% (${formatBytes(Number(disk['Used']) * (1024 ** 1))})`)
        },
      },
    ];
    this.start();
  }

  appendBuffer(msg) {
    this.logSuffix = null;
    console.log(msg + '\n');
  }

  setSuffix(msg) {
    if(this.logSuffix) {
      process.stdout.write(cursorUp(1) + cursorLeft);
    }
    this.logSuffix = msg;
    process.stdout.write('= ' + msg + '\n');
  }

  async fetchData() {
    const response = await fetch(this.url);
    if (!response.ok) {
      if (response.status === 404 || response.status === 403) {
        throw new NotFoundError;
      } else {
        console.log(response);
        throw new Error('Network response was not ok');
      }
    }
    const data = await response.json();
    this.lastData = data;
    return data;
  }

  async checkForUpdates() {
    try {
      const newData = await this.fetchData();

      if (newData.length > this.previousLength) {
        if(this.previousLength === 0) {
          this.startTime = newData[0].time;
        }
        const newItems = newData.slice(this.previousLength);
        for(let item of newItems) {
          const isStatusBarUpdate = this.statusBars.find(x => item.msg === x.msg);
          if(!isStatusBarUpdate) {
            this.appendBuffer(`> ${item.msg} ${item.time !== this.startTime ? `@ ${(item.time - this.startTime).toFixed(4)}s` : ''}`);
            // Circomkit logs come in the data property
            if(item.data && item.data.msg) {
              this.appendBuffer(item.data.msg);
            }
          } else {
            isStatusBarUpdate.handler.call(this, item);
          }
        }

        this.previousLength = newData.length;
      }
    } catch (error) {
      if(!(error instanceof NotFoundError)) {
        console.error('Error fetching data:', error);
        this.stopped = true;
      }
    }
    if (this.stopped && this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  start() {
    this.intervalId = setInterval(() => this.checkForUpdates(), this.interval);
    this.checkForUpdates(); // Run immediately
  }

  stop() {
    this.stopped = true; // Allow one more interval
  }
}

