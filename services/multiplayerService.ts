import { GameState, GameAction } from '../types';
import { database } from '../firebaseConfig';
import { ref, onValue, off } from 'firebase/database';


export async function createGame(hostName: string): Promise<{ gameId: string, playerId: number }> {
    const response = await fetch('/api/createGame', {
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
    const response = await fetch('/api/joinGame', {
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
    const gameRef = ref(database, `games/${gameId}`);

    const unsubscribe = onValue(gameRef, (snapshot) => {
        const state = snapshot.val() as GameState | null;
        callback(state);
    }, (error) => {
        console.error("Firebase subscription error:", error);
        callback(null);
    });

    return () => {
        off(gameRef, 'value', unsubscribe);
    };
}

export async function dispatchAction(gameId: string, action: GameAction): Promise<void> {
    const response = await fetch('/api/dispatchAction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, action })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to perform action');
    }
}