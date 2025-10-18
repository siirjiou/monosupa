import { GameState, GameAction, GameMode, ChatMessage } from '@/types.ts';
import { supabase } from '@/supabaseClient.ts';
import { RealtimeChannel } from '@supabase/supabase-js';

export async function createGame(hostName: string, gameMode: GameMode): Promise<{ gameId: string, playerId: number }> {
    const response = await fetch('/.netlify/functions/createGame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: hostName, gameMode })
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create game');
    }
    return response.json();
}

export async function joinGame(gameId: string, playerName: string): Promise<{ gameId: string, playerId: number }> {
    const response = await fetch('/.netlify/functions/joinGame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, name: playerName })
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to join game');
    }
    return response.json();
}

export function subscribeToGame(gameId: string, callback: (gameState: GameState | null) => void): () => void {
    const channel: RealtimeChannel = supabase
        .channel(`game-${gameId}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'games',
                filter: `id=eq.${gameId}`,
            },
            (payload) => {
                const newState = payload.new as { game_state: GameState };
                callback(newState.game_state);
            }
        )
        .subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
                console.log(`Subscribed to game ${gameId}`);
                // Fetch the complete initial state once the subscription is live.
                const fetchInitialState = async () => {
                    const { data, error } = await supabase
                        .from('games')
                        .select('game_state')
                        .eq('id', gameId)
                        .single();

                    if (error) {
                        console.error("Error fetching initial game state:", error);
                        callback(null);
                    } else if (data) {
                        callback(data.game_state as GameState | null);
                    }
                };
                fetchInitialState();
            } else if (err) {
                console.error(`Failed to subscribe to game ${gameId}:`, err);
                callback(null);
            }
        });

    return () => {
        supabase.removeChannel(channel);
    };
}

export async function dispatchAction(gameId: string, action: GameAction): Promise<void> {
    const response = await fetch('/.netlify/functions/dispatchAction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, action })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to perform action');
    }
}

export async function sendChatMessage(gameId: string, playerId: number, playerName: string, message: string): Promise<void> {
    const response = await fetch('/.netlify/functions/sendChatMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, playerId, playerName, message })
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send message');
    }
}

export function subscribeToChat(gameId: string, callback: (messages: ChatMessage[]) => void): () => void {
     const channel: RealtimeChannel = supabase
        .channel(`chat-${gameId}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_messages',
                filter: `game_id=eq.${gameId}`,
            },
            () => {
                // When a new message arrives, refetch all messages to stay in sync
                 const fetchMessages = async () => {
                    const { data, error } = await supabase
                        .from('chat_messages')
                        .select('*')
                        .eq('game_id', gameId)
                        .order('created_at', { ascending: true });
                    
                    if (error) {
                        console.error("Error fetching chat messages:", error);
                    } else {
                        callback(data as ChatMessage[]);
                    }
                };
                fetchMessages();
            }
        )
        .subscribe((status, err) => {
             if (status === 'SUBSCRIBED') {
                console.log(`Subscribed to chat for game ${gameId}`);
                 const fetchInitialMessages = async () => {
                    const { data, error } = await supabase
                        .from('chat_messages')
                        .select('*')
                        .eq('game_id', gameId)
                        .order('created_at', { ascending: true });

                    if (error) {
                        console.error("Error fetching initial chat messages:", error);
                    } else {
                        callback(data as ChatMessage[]);
                    }
                };
                fetchInitialMessages();
            } else if (err) {
                 console.error(`Failed to subscribe to chat for game ${gameId}:`, err);
            }
        });

    return () => {
        supabase.removeChannel(channel);
    }
}