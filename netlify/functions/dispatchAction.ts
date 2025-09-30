import type { Handler } from '@netlify/functions';
import { supabase } from './utils/supabase';
import { processAction } from './utils/gameLogic';
import type { GameAction, GameState } from '../../src/types';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { gameId, action } = JSON.parse(event.body || '{}') as { gameId: string; action: GameAction };
        if (!gameId || !action) {
             return { statusCode: 400, body: JSON.stringify({ message: 'Game ID and action are required.' }) };
        }
        
        // 1. Fetch current state
        const { data: currentData, error: fetchError } = await supabase
            .from('games')
            .select('game_state')
            .eq('id', gameId)
            .single();

        if (fetchError || !currentData) {
            throw new Error('Game not found or failed to fetch.');
        }

        const currentState: GameState = currentData.game_state as GameState;

        // 2. Process action to get the new state
        // This is a "read-modify-write" pattern. For a turn-based game, this is generally safe.
        // For games requiring high-concurrency safety, a database function (RPC) would be better.
        const nextState = await processAction(currentState, action);

        // 3. Write the new state back to the database
        const { error: updateError } = await supabase
            .from('games')
            .update({ game_state: nextState })
            .eq('id', gameId);

        if (updateError) {
            throw new Error(`Failed to update game state: ${updateError.message}`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true }),
        };

    } catch (error: any) {
        console.error('Error in dispatchAction:', error);
        return {
            statusCode: 400, // Use 400 for client-side errors like invalid moves
            body: JSON.stringify({ message: error.message || 'An internal server error occurred.' }),
        };
    }
};
