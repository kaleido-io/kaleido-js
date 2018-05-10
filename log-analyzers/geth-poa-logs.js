'use strict';

const fs = require('fs');
const argv = require('yargs').argv;
const { Writable } = require('stream');
const Plotly  = require('plotly');

const INTERVAL = (argv.interval || 30) * 1000;


let plotly;
if (process.env.PLOT_USER && process.env.PLOT_PWD) {
  plotly = Plotly(process.env.PLOT_USER, process.env.PLOT_PWD);
}

const input = argv.input;
if (!input) {
  console.error('Input log file required. Use "--input" to tell the program which file to process.');
  process.exit(1);
}

const src = fs.createReadStream(input);

let pooltimes = [], executables = [], nonexecutables = [], stales = [], txtimes = [], txs = [];
const outStream = new Writable({
  write(chunk, encoding, callback) {
    let lines = chunk.toString();
    let matches = lines.match(/\[([0-9]{2}-[0-9]{2}\|[0-9]{2}:[0-9]{2}:[0-9]{2})\]\s+Transaction pool status report\s+executable=(\d+)\s+queued=(\d+)\s+stales=(\d+)/g);
    if (matches) {
      // there should be more than one matches, now parse each match to get the details
      for (let i=0; i<matches.length; i++) {
        let one = matches[i].match(/\[([0-9]{2}-[0-9]{2}\|[0-9]{2}:[0-9]{2}:[0-9]{2})\]\s+Transaction pool status report\s+executable=(\d+)\s+queued=(\d+)\s+stales=(\d+)/);
        pooltimes.push(one[1]);
        executables.push(parseInt(one[2]));
        nonexecutables.push(parseInt(one[3]));
        stales.push(parseInt(one[4]));
        console.log('Pool at %s: executable - %s, \tnon-executable - %s, \tstale - %s', one[1], one[2], one[3], one[4]);
      }
    }

    matches = lines.match(/\[([0-9]{2}-[0-9]{2}\|[0-9]{2}:[0-9]{2}:[0-9]{2})\]\s+(Inserted new block|Commit new mining work).+txs=(\d+)/g);
    if (matches) {
      for (let i=0; i<matches.length; i++) {
        let one = matches[i].match(/\[([0-9]{2}-[0-9]{2}\|[0-9]{2}:[0-9]{2}:[0-9]{2})\]\s+(Inserted new block|Commit new mining work).+txs=(\d+)/);
        txtimes.push(one[1]);
        txs.push(parseInt(one[3]));
        console.log('Txs at %s: %s', one[1], one[3]);
      }
    }

    callback();
  }
});

src.pipe(outStream)
.on('finish', () => {
  let exec = {
    x: pooltimes,
    y: executables,
    name: 'txpool - executables',
    type: 'scatter'
  };

  let nonexec = {
    x: pooltimes,
    y: nonexecutables,
    name: 'txpool - non-executables',
    type: 'scatter'
  };

  let stale = {
    x: pooltimes,
    y: stales,
    name: 'txpool - stales',
    type: 'scatter'
  };

  let averageTimestamps = [], averageTimes = [], averageTxs = [];
  for (let i=0; i<txtimes.length; i++) {
    // timestamp format is mm-dd|hh:mm:ss
    let matches = txtimes[i].match(/([0-9]{2})-([0-9]{2})\|([0-9]{2}):([0-9]{2}):([0-9]{2})/);
    let ts = new Date();
    ts.setMonth(parseInt(matches[1]-1));
    ts.setDate(parseInt(matches[2]));
    ts.setHours(parseInt(matches[3]));
    ts.setMinutes(parseInt(matches[4]));
    ts.setSeconds(parseInt(matches[5]));
    ts = ts.getTime();
    if (averageTimes.length == 0) {
      averageTimes.push(ts);
      averageTimestamps.push(txtimes[i]);
      averageTxs.push(txs[0]);
    } else {
      // if within the interval gap, just increase the count
      if (ts - averageTimes[averageTimes.length - 1] <= INTERVAL) {
        averageTxs[averageTxs.length - 1] = averageTxs[averageTxs.length - 1] + txs[i];
      } else {
        averageTimes.push(ts);
        averageTimestamps.push(txtimes[i]);
        averageTxs.push(txs[i]);
      }
    }
  }

  let tx = {
    x: txtimes,
    y: txs,
    name: 'Tx per block',
    type: 'scatter'
  };

  let averageTx = {
    x: averageTimestamps,
    y: averageTxs,
    name: `Aggregate Tx per ${INTERVAL/1000} seconds`,
    type: 'scatter'
  };

  plotly.plot([tx, averageTx], {filename: "geth-logs-txrate"}, function (err, msg) {
    if (err) return reject(err);

    console.log('Chart available at: %s', msg.url);
  });

  plotly.plot([exec, nonexec, stale], {filename: "geth-logs-txpool"}, function (err, msg) {
    if (err) return reject(err);

    console.log('Chart available at: %s', msg.url);
  });
});;


