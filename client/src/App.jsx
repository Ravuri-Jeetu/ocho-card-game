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
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [showChat, setShowChat] = useState(false);

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

    socket.on('newMessage', (msg) => {
      setMessages(prev => [...prev.slice(-49), msg]);
      if (!showChat) playSound('draw'); // Notification sound
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

  const sendChatMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit('sendMessage', { roomId: gameState.id, message: chatInput });
    setChatInput('');
  };

  if (view === 'landing') {
    return (
      <div className="landing-container">
        <motion.h1
          className="title"
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          OCHO
        </motion.h1>
        {!isConnected && <div className="connection-warning">⚠️ Connecting to server at {SOCKET_URL}...</div>}
        <motion.div
          className="input-group glass"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          {error && <div style={{ color: 'var(--primary)', marginBottom: '1rem' }}>{error}</div>}
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button className="btn btn-primary" onClick={handleCreateRoom}>Create Room</button>
          <div style={{ margin: '1rem 0', textAlign: 'center', opacity: 0.6 }}>OR</div>
          <input
            type="text"
            placeholder="Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          <button className="btn btn-secondary" onClick={handleJoinRoom}>Join Room</button>
        </motion.div>
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
      <div className="room-id-display glass" style={{ padding: '0.5rem 1rem', borderRadius: '1rem' }}>
        ROOM: {gameState.id}
      </div>

      <div className="players-list" style={{ position: 'absolute', right: '1rem', top: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {gameState.players.map((p, i) => (
          <div key={p.id} className="glass" style={{
            padding: '1rem',
            borderRadius: '1.5rem',
            border: i === gameState.currentPlayerIndex ? '2px solid var(--accent)' : '1px solid var(--glass-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img src={p.avatar} alt="avatar" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
              <div>
                <div style={{ fontWeight: 'bold' }}>{p.username}</div>
                <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{p.hand.length} cards</div>
              </div>
            </div>
            {p.id !== socket.id && (
              <div className="opponent-hand">
                {Array.from({ length: Math.min(p.hand.length, 7) }).map((_, idx) => (
                  <div key={idx} className="mini-card-back" />
                ))}
                {p.hand.length > 7 && <span style={{ fontSize: '0.8rem' }}>+{p.hand.length - 7}</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="center-pile">
        <motion.div
          className="card back"
          onClick={drawCard}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          DRAW
        </motion.div>
        <AnimatePresence mode="wait">
          {gameState.lastPlayedCard && (
            <motion.div
              key={gameState.lastPlayedCard.id}
              className={`card ${gameState.currentColor.toLowerCase()}`}
              initial={{ scale: 0, rotate: -180, x: -200 }}
              animate={{ scale: 1, rotate: 0, x: 0 }}
              transition={{ type: 'spring', damping: 15 }}
            >
              {gameState.lastPlayedCard.value}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showColorPicker && (
        <div className="color-picker glass">
          {['Red', 'Blue', 'Green', 'Yellow'].map(color => (
            <button
              key={color}
              className={`btn card ${color.toLowerCase()}`}
              onClick={() => selectColor(color)}
            >
              {color}
            </button>
          ))}
        </div>
      )}

      {/* Chat UI */}
      <div className={`chat-container glass ${showChat ? 'open' : ''}`} style={{ transform: showChat ? 'none' : 'translateY(350px)' }}>
        <div onClick={() => setShowChat(!showChat)} style={{ padding: '0.8rem', textAlign: 'center', cursor: 'pointer', borderBottom: '1px solid var(--glass-border)', fontWeight: 'bold' }}>
          {showChat ? '👇 Close Chat' : '💬 Open Chat'}
        </div>
        <div className="chat-messages">
          {messages.map((m, i) => (
            <div key={i} className="chat-message">
              <img src={m.avatar} style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
              <div className="chat-bubble">
                <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>{m.username} • {m.timestamp}</div>
                {m.message}
              </div>
            </div>
          ))}
        </div>
        <form className="chat-input-area" onSubmit={sendChatMessage}>
          <input
            className="chat-input"
            placeholder="Type a message..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem 1rem' }}>Send</button>
        </form>
      </div>

      <div className="controls">
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
            whileHover={{ y: -60, scale: 1.1, zIndex: 100 }}
            onClick={() => isMyTurn && playCard(card.id)}
            initial={{ opacity: 0, y: 100, x: idx * 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            layout
          >
            {card.value}
          </motion.div>
        ))}
      </div>
      {isMyTurn && <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{ position: 'fixed', bottom: '180px', left: '50%', transform: 'translateX(-50%)', fontWeight: 'bold', fontSize: '2rem', color: 'var(--accent)', textShadow: '0 0 20px rgba(0,210,255,0.5)' }}
      >
        YOUR TURN!
      </motion.div>}
    </div>
  );
}

export default App;
