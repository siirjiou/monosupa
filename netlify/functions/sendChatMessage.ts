import type { Handler } from '@netlify/functions';
import { supabase } from './utils/supabase';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { gameId, playerId, playerName, message } = JSON.parse(event.body || '{}');

        if (!gameId || playerId === undefined || !playerName || !message) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Missing required chat data.' }) };
        }
        
        if (message.trim().length === 0 || message.length > 100) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Invalid message.' }) };
        }

        const chatMessage = {
            game_id: gameId,
            player_id: playerId,
            player_name: playerName,
            message: message.trim(),
        };

        const { error } = await supabase.from('chat_messages').insert(chatMessage);

        if (error) {
            throw error;
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true }),
        };
    } catch (error: any) {
        console.error('Error in sendChatMessage:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Failed to send message.', error: error.message }),
        };
    }
};