import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, Player } from '../types.ts';

interface ChatBoxProps {
    messages: ChatMessage[];
    onSendMessage: (message: string) => void;
    localPlayer: Player | null;
}

export const ChatBox: React.FC<ChatBoxProps> = ({ messages, onSendMessage, localPlayer }) => {
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (newMessage.trim()) {
            onSendMessage(newMessage);
            setNewMessage('');
        }
    };

    return (
        <div className="h-full flex flex-col">
            <h3 className="text-lg font-bold mb-2 flex-shrink-0">Chat</h3>
            <div className="flex-grow bg-gray-200 rounded p-2 overflow-y-auto h-32">
                {messages.length > 0 ? (
                    messages.map(msg => (
                        <div key={msg.id} className={`text-sm mb-1 ${msg.player_id === localPlayer?.id ? 'text-right' : ''}`}>
                            <span className="font-bold" style={{ color: localPlayer?.id === msg.player_id ? localPlayer?.tokenHex : undefined }}>
                                {msg.player_id === localPlayer?.id ? 'You' : msg.player_name}:
                            </span>
                            <span className="ml-1 break-words">{msg.message}</span>
                        </div>
                    ))
                ) : (
                    <p className="text-xs text-gray-500 italic text-center">No messages yet.</p>
                )}
                <div ref={messagesEndRef} />
            </div>
            <form onSubmit={handleSubmit} className="mt-2 flex space-x-2 flex-shrink-0">
                <input
                    type="text"
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-grow p-2 border rounded-lg text-sm"
                    maxLength={100}
                />
                <button type="submit" className="bg-blue-500 text-white px-4 rounded-lg font-bold text-sm">Send</button>
            </form>
        </div>
    );
};