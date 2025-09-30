import React from 'react';
import { GameState, Player } from '../types.ts';

interface LobbyProps {
    gameState: GameState;
    localPlayerId: number;
    onStartGame: () => void;
    onLeave: () => void;
}

const PlayerLobbyCard: React.FC<{ player: Player, isHost: boolean }> = ({ player, isHost }) => (
    <div className="flex items-center space-x-4 p-3 bg-gray-200 rounded-lg">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${player.tokenColor} text-white shadow-inner`}>
            {player.tokenIcon}
        </div>
        <div className="flex-grow">
            <p className="font-bold text-lg text-gray-800">{player.name}</p>
        </div>
        {isHost && <span className="text-sm font-semibold text-yellow-600">HOST</span>}
    </div>
);

export const Lobby: React.FC<LobbyProps> = ({ gameState, localPlayerId, onStartGame, onLeave }) => {
    const isHost = gameState.hostId === localPlayerId;
    const canStart = gameState.players.length >= 2;

    const copyCodeToClipboard = () => {
        navigator.clipboard.writeText(gameState.id);
        alert("Game Code copied to clipboard!");
    }

    return (
        <div className="min-h-screen bg-gray-800 flex flex-col justify-center items-center p-4">
            <div className="w-full max-w-2xl bg-white p-8 rounded-xl shadow-2xl">
                <h1 className="text-4xl font-display font-extrabold text-gray-800 mb-4 text-center">Game Lobby</h1>
                <p className="text-center text-gray-500 mb-6">Share the code below with your friends to have them join.</p>
                
                <div className="text-center mb-8">
                    <label className="text-sm font-bold text-gray-600">GAME CODE</label>
                    <div 
                        className="text-5xl font-mono font-bold tracking-widest text-blue-600 bg-gray-100 p-4 mt-2 rounded-lg cursor-pointer hover:bg-gray-200 transition-colors"
                        onClick={copyCodeToClipboard}
                        title="Click to copy"
                    >
                        {gameState.id}
                    </div>
                </div>

                <h2 className="text-2xl font-bold mb-4">Players ({gameState.players.length}/6)</h2>
                <div className="space-y-3 mb-8">
                    {gameState.players.map(p => (
                        <PlayerLobbyCard key={p.id} player={p} isHost={p.id === gameState.hostId} />
                    ))}
                </div>

                <div className="flex flex-col md:flex-row space-y-3 md:space-y-0 md:space-x-4">
                    <button 
                        onClick={onLeave} 
                        className="w-full bg-red-600 text-white font-bold py-3 rounded-lg shadow-md hover:bg-red-700 transition-colors"
                    >
                        Leave Lobby
                    </button>
                    {isHost && (
                        <button 
                            onClick={onStartGame}
                            disabled={!canStart}
                            className="w-full bg-green-500 text-white font-bold py-3 rounded-lg shadow-md hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                        >
                            {canStart ? 'Start Game' : 'Waiting for more players...'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};