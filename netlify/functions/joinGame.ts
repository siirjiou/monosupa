import type { Handler } from '@netlify/functions';
import { supabase } from './utils/supabase';
import { GameState, Player } from '../../src/types';
import { INITIAL_MONEY, PLAYER_TOKENS } from './utils/constants';
import { GamePhase } from '../../src/types';


export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    
    try {
        const { gameId, name } = JSON.parse(event.body || '{}');
        const gameIdUpper = gameId.toUpperCase();

        if (!gameIdUpper || !name) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Game ID and player name are required.' }) };
        }

        const { data, error: fetchError } = await supabase
            .from('games')
            .select('game_state')
            .eq('id', gameIdUpper)
            .single();

        if (fetchError || !data) {
             return { statusCode: 404, body: JSON.stringify({ message: 'Game not found.' }) };
        }

        const gameState: GameState = data.game_state as GameState;

        if (gameState.phase !== GamePhase.LOBBY) {
            return { statusCode: 403, body: JSON.stringify({ message: 'Game has already started.' }) };
        }
        if (gameState.players.length >= 6) {
            return { statusCode: 403, body: JSON.stringify({ message: 'Game is full.' }) };
        }

        const newPlayerId = gameState.players.length;
        const newPlayer: Player = {
            id: newPlayerId,
            name,
            money: INITIAL_MONEY,
            position: 0,
            properties: [],
            isJailed: false,
            jailTurns: 0,
            getOutOfJailFreeCards: 0,
            isBankrupt: false,
            tokenColor: PLAYER_TOKENS[newPlayerId].color,
            tokenIcon: PLAYER_TOKENS[newPlayerId].icon,
            tokenHex: PLAYER_TOKENS[newPlayerId].hex,
            lastGained: 0,
            lastPaid: 0,
            tradeCount: 0,
        };

        const updatedState = { ...gameState };
        updatedState.players.push(newPlayer);
        updatedState.gameLog = [`[${new Date().toLocaleTimeString()}] ${name} has joined the lobby.`, ...gameState.gameLog.slice(0, 49)];

        const { error: updateError } = await supabase
            .from('games')
            .update({ game_state: updatedState })
            .eq('id', gameIdUpper);
        
        if (updateError) throw updateError;

        return {
            statusCode: 200,
            body: JSON.stringify({ gameId: gameIdUpper, playerId: newPlayerId }),
        };

    } catch (error: any) {
        console.error("Error joining game:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Failed to join game.', error: error.message }),
        };
    }
};
