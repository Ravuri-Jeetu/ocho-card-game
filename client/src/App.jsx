import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './index.css';
import { motion, AnimatePresence } from 'framer-motion';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const socket = io(SOCKET_URL);

function App() {
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [gameState, setGameState] = useState(null);
  const [view, setView] = useState('landing'); // landing, lobby, game
  const [error, setError] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [pendingCardId, setPendingCardId] = useState(null);
  const [winner, setWinner] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const playSound = (type) => {
    const sounds = {
      play: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3',
      draw: 'https://assets.mixkit.co/active_storage/sfx/2021/2021-preview.mp3',
      win: 'https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3'
    };
    new Audio(sounds[type]).play().catch(e => console.log('Audio play failed:', e));
  };

  useEffect(() => {
    socket.on('roomCreated', (data) => {
      setGameState(data);
      setView('lobby');
    });

    socket.on('playerJoined', (data) => {
      setGameState(data);
      if (view === 'landing') setView('lobby');
    });

    socket.on('gameStarted', (data) => {
      setGameState(data);
      setView('game');
    });

    socket.on('gameUpdated', (data) => {
      setGameState(data);
      playSound('play');
    });

    socket.on('error', (msg) => {
      setError(msg);
      setTimeout(() => setError(''), 3000);
    });

    socket.on('gameOver', (data) => {
      setWinner(data.winner);
      playSound('win');
    });

    socket.on('ochoShouted', ({ username }) => {
      alert(`${username} shouted OCHO!`);
    });

    socket.on('ochoChallenged', ({ target, room }) => {
      alert(`${target} was caught not shouting OCHO! They drew 2 cards.`);
      setGameState(room);
    });

    socket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('Connection error:', err.message);
      setError(`Cannot connect to server at ${SOCKET_URL}. Is it running?`);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('roomCreated');
      socket.off('playerJoined');
      socket.off('gameStarted');
      socket.off('gameUpdated');
      socket.off('error');
    };
  }, []);

  const handleCreateRoom = () => {
    if (!username) return setError('Please enter a username');
    socket.emit('createRoom', { username });
  };

  const handleJoinRoom = () => {
    if (!username || !roomId) return setError('Please enter username and Room ID');
    socket.emit('joinRoom', { roomId, username });
  };

  const handleStartGame = () => {
    socket.emit('startGame', gameState.id);
  };

  const playCard = (cardId) => {
    const card = gameState.players.find(p => p.id === socket.id).hand.find(c => c.id === cardId);
    if (card.color === 'Wild') {
      setPendingCardId(cardId);
      setShowColorPicker(true);
      return;
    }
    socket.emit('playCard', { roomId: gameState.id, cardId, newColor: null });
  };

  const selectColor = (color) => {
    socket.emit('playCard', { roomId: gameState.id, cardId: pendingCardId, newColor: color });
    setShowColorPicker(false);
    setPendingCardId(null);
  };

  const handleShoutOcho = () => {
    socket.emit('shoutOcho', gameState.id);
  };

  const handleChallenge = () => {
    socket.emit('challengeOcho', gameState.id);
  };

  const drawCard = () => {
    socket.emit('drawCard', gameState.id);
    playSound('draw');
  };

  if (view === 'landing') {
    return (
      <div className="landing-container">
        <h1 className="title">OCHO</h1>
        {!isConnected && <div className="connection-warning">⚠️ Connecting to server at {SOCKET_URL}...</div>}
        <div className="input-group">
          {error && <div style={{ color: 'var(--primary)' }}>{error}</div>}
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button className="btn btn-primary" onClick={handleCreateRoom}>Create Room</button>
          <div style={{ margin: '1rem 0' }}>OR</div>
          <input
            type="text"
            placeholder="Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          <button className="btn btn-secondary" onClick={handleJoinRoom}>Join Room</button>
        </div>
      </div>
    );
  }

  if (view === 'lobby') {
    if (!gameState) return <div className="landing-container"><h1 className="title">Loading Lobby...</h1></div>;
    const isHost = gameState.players[0].id === socket.id;
    return (
      <div className="landing-container">
        <h1 className="title">Lobby: {gameState.id}</h1>
        <div className="input-group">
          <h3>Players:</h3>
          <ul>
            {gameState.players.map(p => (
              <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <img src={p.avatar} alt="avatar" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                <span>{p.username} {p.isHost && '(Host)'}</span>
              </li>
            ))}
          </ul>
          {isHost && gameState.players.length >= 2 && (
            <button className="btn btn-primary" onClick={handleStartGame}>Start Game</button>
          )}
          {!isHost && <p>Waiting for host to start...</p>}
          {gameState.players.length < 2 && <p>Need at least 2 players</p>}
        </div>
      </div>
    );
  }

  if (winner) {
    return (
      <div className="landing-container">
        <h1 className="title">GAME OVER!</h1>
        <h2>{winner} Wins!</h2>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Play Again</button>
      </div>
    );
  }

  if (!gameState || !gameState.players) {
    return <div className="landing-container"><h1 className="title">Loading Game Data...</h1></div>;
  }

  const currentPlayer = gameState.players.find(p => p.id === socket.id);
  const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.id === socket.id;

  if (!currentPlayer) {
    return <div className="landing-container"><h1 className="title">Waiting for player data...</h1></div>;
  }

  return (
    <div className="game-board">
      <div className="room-id-display">ROOM: {gameState.id}</div>

      <div className="players-list" style={{ position: 'absolute', right: '1rem', top: '1rem' }}>
        {gameState.players.map((p, i) => (
          <div key={p.id} style={{
            color: i === gameState.currentPlayerIndex ? 'var(--accent)' : 'white',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '4px',
            padding: '4px 8px',
            borderRadius: '8px',
            background: i === gameState.currentPlayerIndex ? 'rgba(255,255,255,0.1)' : 'transparent'
          }}>
            <img src={p.avatar} alt="avatar" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
            <span>{p.username} ({p.hand.length})</span>
          </div>
        ))}
      </div>

      <div className="center-pile">
        <div className="card back" onClick={drawCard} style={{ backgroundColor: '#4b4b4b' }}>
          DRAW
        </div>
        {gameState.lastPlayedCard && (
          <div className={`card ${gameState.currentColor.toLowerCase()}`}>
            {gameState.lastPlayedCard.value}
          </div>
        )}
      </div>

      {showColorPicker && (
        <div className="color-picker" style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          background: 'rgba(0,0,0,0.8)', padding: '2rem', borderRadius: '1rem', zIndex: 100,
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem'
        }}>
          {['Red', 'Blue', 'Green', 'Yellow'].map(color => (
            <button
              key={color}
              className={`btn card ${color.toLowerCase()}`}
              onClick={() => selectColor(color)}
              style={{ width: '80px', height: '80px' }}
            >
              {color}
            </button>
          ))}
        </div>
      )}

      <div className="controls" style={{ textAlign: 'center', marginBottom: '1rem', display: 'flex', justifyContent: 'center', gap: '1rem' }}>
        {currentPlayer.hand.length === 1 && !currentPlayer.hasShoutedOcho && (
          <button className="btn btn-primary" onClick={handleShoutOcho}>OCHO!</button>
        )}
        <button className="btn btn-secondary" onClick={handleChallenge}>CHALLENGE</button>
      </div>

      <div className="player-hand">
        {currentPlayer.hand.map((card, idx) => (
          <motion.div
            key={card.id}
            className={`card ${card.color.toLowerCase()}`}
            whileHover={{ y: -50, scale: 1.1 }}
            onClick={() => isMyTurn && playCard(card.id)}
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
          >
            {card.value}
          </motion.div>
        ))}
      </div>
      {isMyTurn && <div style={{ textAlign: 'center', marginBottom: '1rem', fontWeight: 'bold', fontSize: '1.5rem', color: 'var(--accent)' }}>YOUR TURN!</div>}
    </div>
  );
}

export default App;
