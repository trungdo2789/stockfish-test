import { useEffect, useState } from "react";
import stockfish from "../game/stockfish";

var engine = stockfish();
var evaler = stockfish();

export default function useEngineGame(game) {
  const [status, setStatus] = useState()
  const [clock, setClock] = useState({})

  var engineStatus = {};
  var displayScore = false;
  var time = { wtime: 300000, btime: 300000, winc: 2000, binc: 2000 };
  var playerColor = 'white';
  var clockTimeoutID = null;
  var isEngineRunning = false;

  function uciCmd(cmd, which) {
    console.log("UCI: " + cmd);

    (which || engine).postMessage(cmd);
  }

  useEffect(() => {
    uciCmd('uci');
  }, [])

  function displayStatus() {
    var status = 'Engine: ';
    if (!engineStatus.engineLoaded) {
      status += 'loading...';
    } else if (!engineStatus.engineReady) {
      status += 'loaded...';
    } else {
      status += 'ready.';
    }

    if (engineStatus.search) {
      status += '<br>' + engineStatus.search;
      if (engineStatus.score && displayScore) {
        status += (engineStatus.score.substr(0, 4) === "Mate" ? " " : ' Score: ') + engineStatus.score;
      }
    }
    setStatus(status);
  }

  function displayClock(color, t) {
    var isRunning = false;
    if (time.startTime > 0 && color == time.clockColor) {
      t = Math.max(0, t + time.startTime - Date.now());
      isRunning = true;
    }
    var id = color === playerColor ? '#time2' : '#time1';
    var sec = Math.ceil(t / 1000);
    var min = Math.floor(sec / 60);
    sec -= min * 60;
    var hours = Math.floor(min / 60);
    min -= hours * 60;
    var display = hours + ':' + ('0' + min).slice(-2) + ':' + ('0' + sec).slice(-2);
    if (isRunning) {
      display += sec & 1 ? ' <--' : ' <-';
    }
    setClock({ id, display });
  }

  function updateClock() {
    displayClock('white', time.wtime);
    displayClock('black', time.btime);
  }

  function clockTick() {
    updateClock();
    var t = (time.clockColor === 'white' ? time.wtime : time.btime) + time.startTime - Date.now();
    var timeToNextSecond = (t % 1000) + 1;
    clockTimeoutID = setTimeout(clockTick, timeToNextSecond);
  }

  function stopClock() {
    if (clockTimeoutID !== null) {
      clearTimeout(clockTimeoutID);
      clockTimeoutID = null;
    }
    if (time.startTime > 0) {
      var elapsed = Date.now() - time.startTime;
      time.startTime = null;
      if (time.clockColor === 'white') {
        time.wtime = Math.max(0, time.wtime - elapsed);
      } else {
        time.btime = Math.max(0, time.btime - elapsed);
      }
    }
  }

  function startClock() {
    if (game.turn() === 'w') {
      time.wtime += time.winc;
      time.clockColor = 'white';
    } else {
      time.btime += time.binc;
      time.clockColor = 'black';
    }
    time.startTime = Date.now();
    clockTick();
  }

  function get_moves() {
    var moves = '';
    var history = game.history({ verbose: true });

    for (var i = 0; i < history.length; ++i) {
      var move = history[i];
      moves += ' ' + move.from + move.to + (move.promotion ? move.promotion : '');
    }

    return moves;
  }

  function prepareMove() {
    stopClock();
    updateClock();
    var turn = game.turn() === 'w' ? 'white' : 'black';
    if (!game.game_over()) {
      if (turn !== playerColor) {
        uciCmd('position startpos moves' + get_moves());
        uciCmd('position startpos moves' + get_moves(), evaler);
        uciCmd("eval", evaler);

        if (time && time.wtime) {
          uciCmd("go " + (time.depth ? "depth " + time.depth : "") + " wtime " + time.wtime + " winc " + time.winc + " btime " + time.btime + " binc " + time.binc);
        } else {
          uciCmd("go " + (time.depth ? "depth " + time.depth : ""));
        }
        isEngineRunning = true;
      }
      if (game.history().length >= 2 && !time.depth && !time.nodes) {
        startClock();
      }
    }
  }

  evaler.onmessage = function (event) {
    var line;

    if (event && typeof event === "object") {
      line = event.data;
    } else {
      line = event;
    }

    console.log("evaler: " + line);

    /// Ignore some output.
    if (line === "uciok" || line === "readyok" || line.substr(0, 11) === "option name") {
      return;
    }
  }

  engine.onmessage = function (event) {
    var line;

    if (event && typeof event === "object") {
      line = event.data;
    } else {
      line = event;
    }
    console.log("Reply: " + line)
    if (line === 'uciok') {
      engineStatus.engineLoaded = true;
    } else if (line === 'readyok') {
      engineStatus.engineReady = true;
    } else {
      var match = line.match(/^bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?/);
      /// Did the AI move?
      if (match) {
        isEngineRunning = false;
        game.move({ from: match[1], to: match[2], promotion: match[3] });
        prepareMove();
        uciCmd("eval", evaler)
        //uciCmd("eval");
        /// Is it sending feedback?
      } else if (match = line.match(/^info .*\bdepth (\d+) .*\bnps (\d+)/)) {
        engineStatus.search = 'Depth: ' + match[1] + ' Nps: ' + match[2];
      }

      /// Is it sending feed back with a score?
      if (match = line.match(/^info .*\bscore (\w+) (-?\d+)/)) {
        var score = parseInt(match[2]) * (game.turn() == 'w' ? 1 : -1);
        /// Is it measuring in centipawns?
        if (match[1] === 'cp') {
          engineStatus.score = (score / 100.0).toFixed(2);
          /// Did it find a mate?
        } else if (match[1] === 'mate') {
          engineStatus.score = 'Mate in ' + Math.abs(score);
        }

        /// Is the score bounded?
        if (match = line.match(/\b(upper|lower)bound\b/)) {
          engineStatus.score = ((match[1] === 'upper') === (game.turn() === 'w') ? '<= ' : '>= ') + engineStatus.score
        }
      }
    }
    displayStatus();
  };

  const setSkillLevel = (skill) => {
    var max_err,
      err_prob,
      difficulty_slider;

    if (skill < 0) {
      skill = 0;
    }
    if (skill > 20) {
      skill = 20;
    }

    time.level = skill;

    /// Change thinking depth allowance.
    if (skill < 5) {
      time.depth = "1";
    } else if (skill < 10) {
      time.depth = "2";
    } else if (skill < 15) {
      time.depth = "3";
    } else {
      /// Let the engine decide.
      time.depth = "";
    }

    uciCmd('setoption name Skill Level value ' + skill);

    ///NOTE: Stockfish level 20 does not make errors (intentially), so these numbers have no effect on level 20.
    /// Level 0 starts at 1
    err_prob = Math.round((skill * 6.35) + 1);
    /// Level 0 starts at 10
    max_err = Math.round((skill * -0.5) + 10);

    uciCmd('setoption name Skill Level Maximum Error value ' + max_err);
    uciCmd('setoption name Skill Level Probability value ' + err_prob);
  }

  return {
    prepareMove,
    reset: function () {
      game.reset();
      uciCmd('setoption name Contempt value 0');
      //uciCmd('setoption name Skill Level value 20');
      setSkillLevel(0);
      uciCmd('setoption name King Safety value 0'); /// Agressive 100 (it's now symetric)
    },
    loadPgn: function (pgn) { game.load_pgn(pgn); },
    setPlayerColor: function (color) {
      playerColor = color;
      // board.orientation(playerColor);
    },
    setSkillLevel,
    setTime: function (baseTime, inc) {
      time = { wtime: baseTime * 1000, btime: baseTime * 1000, winc: inc * 1000, binc: inc * 1000 };
    },
    setDepth: function (depth) {
      time = { depth: depth };
    },
    setNodes: function (nodes) {
      time = { nodes: nodes };
    },
    setContempt: function (contempt) {
      uciCmd('setoption name Contempt value ' + contempt);
    },
    setAggressiveness: function (value) {
      uciCmd('setoption name Aggressiveness value ' + value);
    },
    setDisplayScore: function (flag) {
      displayScore = flag;
      displayStatus();
    },
    start: function () {
      uciCmd('ucinewgame');
      uciCmd('isready');
      engineStatus.engineReady = false;
      engineStatus.search = null;
      displayStatus();
      prepareMove();
    },
    undo: function () {
      if (isEngineRunning)
        return false;
      game.undo();
      game.undo();
      engineStatus.search = null;
      displayStatus();
      prepareMove();
      return true;
    }
  };
}