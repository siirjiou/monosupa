import type { Handler } from '@netlify/functions';
import { supabase } from './utils/supabase';
import { GameState, GamePhase, Player } from '../../src/types';
import { initialBoard, INITIAL_MONEY, PLAYER_TOKENS } from './utils/constants';

function generateGameId(): string {
    let id = '';
    const chars = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789';
    for (let i = 0; i < 5; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { name } = JSON.parse(event.body || '{}');
        if (!name) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Player name is required.' }) };
        }

        const gameId = generateGameId();
        const hostPlayer: Player = {
            id: 0,
            name,
            money: INITIAL_MONEY,
            position: 0,
            properties: [],
            isJailed: false,
            jailTurns: 0,
            getOutOfJailFreeCards: 0,
            isBankrupt: false,
            tokenColor: PLAYER_TOKENS[0].color,
            tokenIcon: PLAYER_TOKENS[0].icon,
            tokenHex: PLAYER_TOKENS[0].hex,
            lastGained: 0,
            lastPaid: 0,
            tradeCount: 0,
        };

        const initialState: GameState = {
            id: gameId,
            hostId: 0,
            phase: GamePhase.LOBBY,
            players: [hostPlayer],
            board: JSON.parse(JSON.stringify(initialBoard)), // Deep copy
            currentPlayerIndex: 0,
            dice: [0, 0],
            gameLog: ['Lobby created. Waiting for players...'],
            doublesCount: 0,
            hasRolled: false,
            pendingAction: null,
        };

        const { error } = await supabase
            .from('games')
            .insert({ id: gameId, game_state: initialState });

        if (error) throw error;

        return {
            statusCode: 200,
            body: JSON.stringify({ gameId, playerId: 0 }),
        };
    } catch (error: any) {
        console.error("Error creating game:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Failed to create game.', error: error.message }),
        };
    }
};
