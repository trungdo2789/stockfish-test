import Chess from "chess.js";
import React, { useEffect } from "react";
import useChessBoard from "../hook/useChessBoard";
import useEngineGame from "../hook/useEnginegame";

const game = new Chess();

export default function ChessBoard({ ...rest }) {
  const { prepareMove, start, setSkillLevel, reset } = useEngineGame(game);
  const {
    board, fen, pgn, status, whosTurn, initBoard
  } = useChessBoard({
    game, _onDrag: () => {
      prepareMove();
    }
  });

  useEffect(() => {
    initBoard('board1');
    start();
    setSkillLevel(0)
  }, []);
  return <>
    <div style={{
      width: 400
    }} {...rest} id="board1"></div>
    <button onClick={() => { 
      reset();
    }}>reset</button>
    <label>Status:</label>
    <div id="gameStatus">{status}</div>
    <label>FEN:</label>
    <div id="gameFEN">{fen}</div>
    <label>PGN:</label>
    <div id="gamePGN">{pgn}</div>
  </>
}