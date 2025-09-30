import { GameState, GameAction } from '@/types';
import { supabase } from '@/supabaseClient';
import { RealtimeChannel } from '@supabase/supabase-js';

export async function createGame(hostName: string): Promise<{ gameId: string, playerId: number }> {
    const response = await fetch('/.netlify/functions/createGame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: hostName })
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
    // Each subscription gets its own channel, making it self-contained and robust.
    const channel = supabase
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

    // The returned cleanup function unsubscribes from this specific channel.
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
