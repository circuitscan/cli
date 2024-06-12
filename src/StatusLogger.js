import https from 'https';

export class StatusLogger {
  constructor(url, interval) {
    this.url = url;
    this.interval = interval;
    this.previousLength = 0;
    this.startTime = 0;
    this.intervalId = null;
    this.stopped = false;
    this.lastData = null;
    this.start();
  }

  fetchData() {
    return new Promise((resolve, reject) => {
      https.get(this.url, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if(data.indexOf('<Code>NoSuchKey</Code>') !== -1) {
            reject(new Error('not_found'));
            return;
          }
          try {
            const json = JSON.parse(data);
            this.lastData = json;
            resolve(json);
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', (err) => {
        reject(err);
      });
    });
  }

  async checkForUpdates() {
    try {
      const newData = await this.fetchData();

      if (newData.length > this.previousLength) {
        if(this.previousLength === 0) {
          this.startTime = newData[0].time;
        }
        const newItems = newData.slice(this.previousLength);
        // TODO display memory usage as graphs
        console.log(newItems.map(item => `> ${item.msg} ${item.time !== this.startTime ? `@ ${(item.time - this.startTime).toFixed(4)}s` : ''}`).join('\n'));
        this.previousLength = newData.length;
      }
    } catch (error) {
      if(!error.message.startsWith('Unexpected token')) {
        console.error('Error fetching data:', error);
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
