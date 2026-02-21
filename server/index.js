const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const clientUrl = process.env.CLIENT_URL || '*';
app.use(cors({
    origin: clientUrl,
    methods: ['GET', 'POST']
}));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: clientUrl,
        methods: ['GET', 'POST']
    }
});

const rooms = new Map();

// --- Game Constants ---
const COLORS = ['Red', 'Blue', 'Green', 'Yellow'];
const VALUES = ['0', '1', '1', '2', '2', '3', '3', '4', '4', '5', '5', '6', '6', '7', '7', '8', '8', '9', '9', 'Skip', 'Skip', 'Reverse', 'Reverse', 'Draw2', 'Draw2'];
const WILD_CARDS = ['Wild', 'Wild', 'Wild', 'Wild', 'Wild4', 'Wild4', 'Wild4', 'Wild4'];

function generateDeck() {
    let deck = [];
    for (const color of COLORS) {
        for (const value of VALUES) {
            deck.push({ color, value, id: Math.random().toString(36).substr(2, 9) });
        }
    }
    for (const value of WILD_CARDS) {
        deck.push({ color: 'Wild', value, id: Math.random().toString(36).substr(2, 9) });
    }
    return deck;
}

function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// --- Socket Handlers ---
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('createRoom', ({ username }) => {
        const roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
        const roomData = {
            id: roomId,
            players: [{
                id: socket.id,
                username,
                avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
                hand: [],
                isHost: true
            }],
            gameStarted: false,
            deck: [],
            discardPile: [],
            currentPlayerIndex: 0,
            direction: 1, // 1 for clockwise, -1 for counter-clockwise
            lastPlayedCard: null,
            currentColor: null
        };
        rooms.set(roomId, roomData);
        socket.join(roomId);
        socket.emit('roomCreated', roomData);
    });

    socket.on('joinRoom', ({ roomId, username }) => {
        const room = rooms.get(roomId);
        if (room && !room.gameStarted) {
            room.players.push({
                id: socket.id,
                username,
                avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
                hand: [],
                isHost: false
            });
            socket.join(roomId);
            io.to(roomId).emit('playerJoined', room);
        } else {
            socket.emit('error', 'Room not found or game already started');
        }
    });

    socket.on('startGame', (roomId) => {
        const room = rooms.get(roomId);
        if (room && room.players[0].id === socket.id) {
            room.gameStarted = true;
            room.deck = shuffle(generateDeck());

            // Deal cards
            room.players.forEach(player => {
                player.hand = room.deck.splice(0, 7);
            });

            // Initial card
            let initialCard = room.deck.pop();
            while (initialCard.color === 'Wild') {
                room.deck.unshift(initialCard);
                initialCard = room.deck.pop();
            }
            room.discardPile.push(initialCard);
            room.lastPlayedCard = initialCard;
            room.currentColor = initialCard.color;

            io.to(roomId).emit('gameStarted', room);
        }
    });

    socket.on('playCard', ({ roomId, cardId, newColor }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameStarted) return;

        const player = room.players[room.currentPlayerIndex];
        if (player.id !== socket.id) return;

        const cardIndex = player.hand.findIndex(c => c.id === cardId);
        if (cardIndex === -1) return;

        const card = player.hand[cardIndex];

        // Validation
        const isColorMatch = card.color === room.currentColor || card.color === 'Wild';
        const isValueMatch = card.value === room.lastPlayedCard.value;

        if (!isColorMatch && !isValueMatch) {
            socket.emit('error', 'Invalid move');
            return;
        }

        // Play the card
        player.hand.splice(cardIndex, 1);
        room.discardPile.push(card);
        room.lastPlayedCard = card;
        room.currentColor = (card.color === 'Wild') ? newColor : card.color;

        // Handle effects
        let skipNext = false;
        let cardsToDraw = 0;

        if (card.value === 'Skip') {
            skipNext = true;
        } else if (card.value === 'Reverse') {
            if (room.players.length === 2) {
                skipNext = true;
            } else {
                room.direction *= -1;
            }
        } else if (card.value === 'Draw2') {
            cardsToDraw = 2;
            skipNext = true;
        } else if (card.value === 'Wild4') {
            cardsToDraw = 4;
            skipNext = true;
        }

        // Move turn
        const nextPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;

        if (cardsToDraw > 0) {
            const targetPlayer = room.players[nextPlayerIndex];
            for (let i = 0; i < cardsToDraw; i++) {
                if (room.deck.length === 0) {
                    room.deck = shuffle(room.discardPile.splice(0, room.discardPile.length - 1));
                }
                targetPlayer.hand.push(room.deck.pop());
            }
        }

        room.currentPlayerIndex = (room.currentPlayerIndex + (skipNext ? 2 : 1) * room.direction + room.players.length * 2) % room.players.length;

        io.to(roomId).emit('gameUpdated', room);

        if (player.hand.length === 0) {
            io.to(roomId).emit('gameOver', { winner: player.username });
        }
    });

    socket.on('shoutOcho', (roomId) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameStarted) return;

        const player = room.players.find(p => p.id === socket.id);
        if (player && player.hand.length === 1) {
            player.hasShoutedOcho = true;
            io.to(roomId).emit('ochoShouted', { username: player.username });
        }
    });

    socket.on('challengeOcho', (roomId) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameStarted) return;

        // Find any player with 1 card who hasn't shouted
        const target = room.players.find(p => p.hand.length === 1 && !p.hasShoutedOcho);
        if (target) {
            // Penalty: Draw 2 cards
            for (let i = 0; i < 2; i++) {
                if (room.deck.length === 0) {
                    room.deck = shuffle(room.discardPile.splice(0, room.discardPile.length - 1));
                }
                target.hand.push(room.deck.pop());
            }
            io.to(roomId).emit('ochoChallenged', { challenger: socket.id, target: target.username, room });
        }
    });

    socket.on('drawCard', (roomId) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameStarted) return;

        const player = room.players[room.currentPlayerIndex];
        if (player.id !== socket.id) return;

        if (room.deck.length === 0) {
            room.deck = shuffle(room.discardPile.splice(0, room.discardPile.length - 1));
        }

        const card = room.deck.pop();
        player.hand.push(card);

        // After drawing, turn moves to next player unless they can play the drawn card (optional: usually UNO rules move turn)
        room.currentPlayerIndex = (room.currentPlayerIndex + room.direction + room.players.length) % room.players.length;

        io.to(roomId).emit('gameUpdated', room);
    });

    socket.on('sendMessage', ({ roomId, message }) => {
        const room = rooms.get(roomId);
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        io.to(roomId).emit('newMessage', {
            username: player.username,
            avatar: player.avatar,
            message,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Handle disconnection logic (remove player from room, etc.)
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
