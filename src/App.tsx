import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { GameBoard } from './components/GameBoard.tsx';
import { PlayerInfo } from './components/PlayerInfo.tsx';
import { Modal } from '../components/Modal.tsx';
import { Dice } from '../components/Dice.tsx';
import { PropertyCard } from './components/PropertyCard.tsx';
import { TradeModal } from './components/TradeModal.tsx';
import { ManagePropertiesModal } from './components/ManagePropertiesModal.tsx';
import { Lobby } from './components/Lobby.tsx';
import { ChatBox } from './components/ChatBox.tsx';
import {
  GameState,
  GamePhase,
  Player,
  Property,
  Space,
  TradeOffer,
  PendingActionType,
  GameAction,
  PendingAction,
  GameMode,
  GameActionPayload,
  ChatMessage,
} from './types.ts';
import { 
    createGame, 
    dispatchAction, 
    joinGame, 
    sendChatMessage, 
    subscribeToChat, 
    subscribeToGame 
} from '../services/multiplayerService.ts';
import { playSound, SoundEvent } from './services/soundService.ts';

// --- Custom Hook to get previous value ---
function usePrevious<T>(value: T): T | undefined {
  // FIX: Provide an initial value to `useRef` to fix "Expected 1 arguments, but got 0" error.
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

// --- Timer Display Component ---
const Timer: React.FC<{ gameState: GameState }> = ({ gameState }) => {
    const { timer, turnTimerExpiresAt, currentPlayerIndex, players } = gameState;
    const [remaining, setRemaining] = useState(0);
    const [duration, setDuration] = useState(60);

    const activeTimer = timer || (turnTimerExpiresAt ? { expiresAt: turnTimerExpiresAt, duration: 60, type: 'TURN', playerId: players[currentPlayerIndex].id } : null);

    useEffect(() => {
        if (!activeTimer) return;

        setDuration(activeTimer.duration);

        const interval = setInterval(() => {
            const timeLeft = Math.max(0, Math.ceil((activeTimer.expiresAt - Date.now()) / 1000));
            setRemaining(timeLeft);
        }, 500);

        return () => clearInterval(interval);
    }, [activeTimer]);

    if (!activeTimer) return null;

    const percentage = duration > 0 ? (remaining / duration) * 100 : 0;
    const player = players.find(p => p.id === activeTimer.playerId);
    let timerText = "Time Remaining";

    switch(activeTimer.type) {
        case 'PURCHASE': timerText = `${player?.name}, buy or decline?`; break;
        case 'TRADE_RESPONSE': timerText = `${player?.name}, respond to trade`; break;
        case 'JAIL_DECISION': timerText = `${player?.name}, you're in jail`; break;
        case 'TURN': timerText = `${player?.name}'s Turn`; break;
    }

    return (
         <div className="w-full md:w-1/2 lg:w-1/3 fixed top-0 left-1/2 -translate-x-1/2 z-50 bg-black/50 p-2 rounded-b-xl shadow-lg backdrop-blur-sm">
            <div className="text-center">
                <p className="text-white text-sm font-semibold">{timerText}</p>
                <div className="flex items-center space-x-2">
                    <div className="w-full bg-gray-600 rounded-full h-2.5">
                        <div 
                            className={`h-2.5 rounded-full transition-all duration-500 ${percentage > 50 ? 'bg-green-500' : percentage > 20 ? 'bg-yellow-500' : 'bg-red-600'}`} 
                            style={{ width: `${percentage}%` }}
                        ></div>
                    </div>
                    <span className="text-lg font-bold text-white w-8">{remaining}</span>
                </div>
            </div>
        </div>
    );
};

// --- Trade Display Components ---
const TradePropertyItem: React.FC<{ property: Property }> = ({ property }) => (
    <div className="flex items-center space-x-2 p-1 rounded bg-gray-100 border">
        <div className={`w-2 h-5 rounded-l ${property.color}`}></div>
        <span className="text-sm">{property.name}</span>
    </div>
);

interface TradeOfferDetailsProps {
    tradeOffer: TradeOffer;
    board: (Space | Property)[];
    players: Player[];
    perspectivePlayerId: number;
}

const TradeOfferDetails: React.FC<TradeOfferDetailsProps> = ({ tradeOffer, board, players, perspectivePlayerId }) => {
    const fromPlayer = players.find(p => p.id === tradeOffer.fromPlayerId)!;
    const toPlayer = players.find(p => p.id === tradeOffer.toPlayerId)!;

    const youAreProposer = perspectivePlayerId === fromPlayer.id;
    const yourOffer = youAreProposer ? tradeOffer.offer : tradeOffer.request;
    const theirOffer = youAreProposer ? tradeOffer.request : tradeOffer.offer;
    const otherPlayer = youAreProposer ? toPlayer : fromPlayer;

    const getProperties = (propIds: number[]): Property[] => {
        return propIds.map(id => board[id] as Property).filter(Boolean);
    };

    const yourProperties = getProperties(yourOffer.properties);
    const theirProperties = getProperties(theirOffer.properties);

    return (
        <div className="space-y-4">
            <p className="text-center text-sm text-gray-600">This is a trade with <span className="font-bold">{otherPlayer.name}</span>.</p>
            <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                    <h4 className="font-bold text-lg mb-2 border-b pb-1">You Give</h4>
                    <div className="space-y-2 min-h-[50px]">
                        {yourOffer.money > 0 && <p className="text-lg font-semibold text-green-600">${yourOffer.money.toLocaleString()}</p>}
                        {yourProperties.map(p => <TradePropertyItem key={p.id} property={p} />)}
                        {yourOffer.money === 0 && yourProperties.length === 0 && <p className="text-sm text-gray-500 italic">Nothing</p>}
                    </div>
                </div>
                <div>
                    <h4 className="font-bold text-lg mb-2 border-b pb-1">You Get</h4>
                    <div className="space-y-2 min-h-[50px]">
                        {theirOffer.money > 0 && <p className="text-lg font-semibold text-green-600">${theirOffer.money.toLocaleString()}</p>}
                        {theirProperties.map(p => <TradePropertyItem key={p.id} property={p} />)}
                        {theirOffer.money === 0 && theirProperties.length === 0 && <p className="text-sm text-gray-500 italic">Nothing</p>}
                    </div>
                </div>
            </div>
        </div>
    );
};

const TradeOfferSpectatorView: React.FC<{tradeOffer: TradeOffer, board: (Space | Property)[], players: Player[]}> = ({ tradeOffer, board, players }) => {
    const fromPlayer = players.find(p => p.id === tradeOffer.fromPlayerId)!;
    const toPlayer = players.find(p => p.id === tradeOffer.toPlayerId)!;

    const getProperties = (propIds: number[]): Property[] => {
        return propIds.map(id => board[id] as Property).filter(Boolean);
    };
    
    const fromOfferProperties = getProperties(tradeOffer.offer.properties);
    const toOfferProperties = getProperties(tradeOffer.request.properties);

    return (
         <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                    <h4 className="font-bold text-lg mb-2 border-b pb-1">{fromPlayer.name} Gives</h4>
                    <div className="space-y-2 min-h-[50px]">
                        {tradeOffer.offer.money > 0 && <p className="text-lg font-semibold text-green-600">${tradeOffer.offer.money.toLocaleString()}</p>}
                        {fromOfferProperties.map(p => <TradePropertyItem key={p.id} property={p} />)}
                        {tradeOffer.offer.money === 0 && fromOfferProperties.length === 0 && <p className="text-sm text-gray-500 italic">Nothing</p>}
                    </div>
                </div>
                <div>
                    <h4 className="font-bold text-lg mb-2 border-b pb-1">{toPlayer.name} Gives</h4>
                     <div className="space-y-2 min-h-[50px]">
                        {tradeOffer.request.money > 0 && <p className="text-lg font-semibold text-green-600">${tradeOffer.request.money.toLocaleString()}</p>}
                        {toOfferProperties.map(p => <TradePropertyItem key={p.id} property={p} />)}
                        {tradeOffer.request.money === 0 && toOfferProperties.length === 0 && <p className="text-sm text-gray-500 italic">Nothing</p>}
                    </div>
                </div>
            </div>
        </div>
    )
}

// --- Main App Component ---
const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameId, setGameId] = useState<string | null>(sessionStorage.getItem('monopolyGameId'));
  const [localPlayerId, setLocalPlayerId] = useState<number | null>(() => {
    const storedId = sessionStorage.getItem('monopolyPlayerId');
    return storedId ? parseInt(storedId, 10) : null;
  });

  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    content: React.ReactNode;
    onClose?: () => void;
  }>({ isOpen: false, title: '', content: null });

  const [tradeState, setTradeState] = useState<{ isOpen: boolean, targetPlayer: Player | null, isCounter: boolean }>({ isOpen: false, targetPlayer: null, isCounter: false });
  const [assetViewState, setAssetViewState] = useState<{isOpen: boolean, player: Player | null}>({isOpen: false, player: null});
  const [isProcessing, setIsProcessing] = useState(false);
  const [handledAction, setHandledAction] = useState<PendingAction | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const prevState = usePrevious(gameState);

  // Sound Effect Handler
  useEffect(() => {
    if (!gameState || !prevState || isMuted) return;

    // Player joins in lobby
    if (prevState.phase === GamePhase.LOBBY && gameState.phase === GamePhase.LOBBY && prevState.players.length < gameState.players.length) {
        playSound(SoundEvent.PLAYER_JOIN);
    }
    // Turn change
    if (prevState.currentPlayerIndex !== gameState.currentPlayerIndex) {
        playSound(SoundEvent.NEXT_TURN);
    }
    // Dice roll
    if (!prevState.hasRolled && gameState.hasRolled) {
        playSound(SoundEvent.DICE_ROLL);
    }
    // Go to Jail
    const localPlayer = gameState.players.find(p => p.id === localPlayerId);
    const prevLocalPlayer = prevState.players.find(p => p.id === localPlayerId);
    if (localPlayer && prevLocalPlayer && !prevLocalPlayer.isJailed && localPlayer.isJailed) {
        playSound(SoundEvent.GO_TO_JAIL);
    }
    // Property purchase
    if (prevState.pendingAction?.type === PendingActionType.AWAIT_PURCHASE && !gameState.pendingAction) {
        const prevPropId = prevState.pendingAction.propertyId;
        const newProp = gameState.board[prevPropId] as Property;
        if (newProp.ownerId === localPlayerId) {
            playSound(SoundEvent.BUY_PROPERTY);
        }
    }
    // Pass Go & Pay Rent (money changes)
    if (localPlayer && prevLocalPlayer) {
        if (localPlayer.money > prevLocalPlayer.money && localPlayer.lastGained === 200) {
            playSound(SoundEvent.PASS_GO);
        }
        if (localPlayer.money < prevLocalPlayer.money && localPlayer.lastPaid > 0) {
             const creditor = gameState.players.find(p => p.lastGained === localPlayer.lastPaid);
             if(creditor) playSound(SoundEvent.PAY_RENT);
        }
    }

  }, [gameState, prevState, isMuted, localPlayerId]);
  
   // Chat subscription
  useEffect(() => {
    if (gameId) {
      const unsubscribe = subscribeToChat(gameId, (newMessages) => {
        if (newMessages.length > chatMessages.length) {
            playSound(SoundEvent.CHAT_MESSAGE);
        }
        setChatMessages(newMessages);
      });
      return () => unsubscribe();
    }
  }, [gameId, chatMessages.length]); // Re-subscribe if gameId changes


  useEffect(() => {
    if (gameId) {
      const unsubscribe = subscribeToGame(gameId, (newState) => {
        setGameState(newState);
        if (!newState) {
            sessionStorage.removeItem('monopolyGameId');
            sessionStorage.removeItem('monopolyPlayerId');
            setGameId(null);
            setLocalPlayerId(null);
        }
      });
      return () => unsubscribe();
    }
  }, [gameId]);

  const currentPlayer = useMemo(() => {
    if (!gameState || gameState.phase !== GamePhase.PLAYER_TURN) return null;
    const player = gameState.players[gameState.currentPlayerIndex];
    return player && !player.isBankrupt ? player : null;
  }, [gameState]);

  const localPlayer = useMemo(() => {
      if (!gameState || localPlayerId === null) return null;
      return gameState.players.find(p => p.id === localPlayerId) || null;
  }, [gameState, localPlayerId]);

  const closeModal = useCallback(() => setModal(prev => ({ ...prev, isOpen: false, onClose: undefined })), []);

    const handleDispatchAction = useCallback((action: GameActionPayload): void => {
        (async () => {
            if (!gameId || localPlayerId === null) return;
            setIsProcessing(true);
            try {
                await dispatchAction(gameId, { ...action, playerId: localPlayerId! } as GameAction);
            } catch (error: any) {
                console.error("Action failed:", error);
                alert(`Action failed: ${error.toString()}`);
            } finally {
                setIsProcessing(false);
            }
        })();
    }, [gameId, localPlayerId]);


  const handleHostGame = async (name: string, gameMode: GameMode) => {
    try {
        const { gameId: newGameId, playerId } = await createGame(name, gameMode);
        sessionStorage.setItem('monopolyGameId', newGameId);
        sessionStorage.setItem('monopolyPlayerId', playerId.toString());
        setGameId(newGameId);
        setLocalPlayerId(playerId);
    } catch (error) {
        console.error("Failed to host game:", error);
    }
  };

  const handleJoinGame = async (code: string, name: string) => {
      try {
        const { gameId: joinedGameId, playerId } = await joinGame(code, name);
        sessionStorage.setItem('monopolyGameId', joinedGameId);
        sessionStorage.setItem('monopolyPlayerId', playerId.toString());
        setGameId(joinedGameId);
        setLocalPlayerId(playerId);
    } catch (error) {
        console.error("Failed to join game:", error);
        alert(error);
    }
  };
  
  const resetGame = () => {
    sessionStorage.removeItem('monopolyGameId');
    sessionStorage.removeItem('monopolyPlayerId');
    setGameState(null);
    setGameId(null);
    setLocalPlayerId(null);
    closeModal();
  };

  const handleLeaveGame = () => {
    setModal({
      isOpen: true,
      title: 'Leave Game?',
      content: (
        <div className="text-center">
          <p className="mb-6">Are you sure you want to leave the game? Your properties will be returned to the bank.</p>
          <div className="flex justify-around">
            <button
              onClick={async () => {
                  try {
                    await dispatchAction(gameId!, { type: 'LEAVE_GAME', playerId: localPlayerId! });
                    resetGame();
                  } catch (error) {
                    console.error("Failed to leave game:", error);
                    alert("Could not leave the game. Please try again.");
                    closeModal();
                  }
              }}
              className="bg-red-600 text-white font-bold px-6 py-2 rounded-lg"
            >
              Leave
            </button>
            <button
              onClick={closeModal}
              className="bg-gray-400 text-white font-bold px-6 py-2 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      ),
      onClose: closeModal,
    });
  };

  // Effect for HOST to manage game timers
  useEffect(() => {
      if (!gameState || localPlayerId !== gameState.hostId) return;

      const { timer, turnTimerExpiresAt } = gameState;
      const activeTimer = timer || (turnTimerExpiresAt ? { expiresAt: turnTimerExpiresAt } : null);

      if (!activeTimer) return;

      const now = Date.now();
      const delay = activeTimer.expiresAt - now;

      const timeoutId = setTimeout(() => {
          console.log("Host is dispatching TIMER_EXPIRED");
          handleDispatchAction({ type: 'TIMER_EXPIRED' });
      }, delay > 0 ? delay : 50); // Dispatch almost immediately if overdue

      return () => clearTimeout(timeoutId);

  }, [gameState, localPlayerId, handleDispatchAction]);

  // Effect to close action modals if turn changes
  useEffect(() => {
    if (!gameState || !localPlayer || gameState.phase !== GamePhase.PLAYER_TURN) return;
    const isMyTurnNow = gameState.players[gameState.currentPlayerIndex].id === localPlayer.id;

    if (!isMyTurnNow) {
        // If it's not my turn, close the modal for proposing a *new* trade.
        // The counter-offer modal is allowed to stay open for the non-current player.
        if (tradeState.isOpen && !tradeState.isCounter) {
            setTradeState({ isOpen: false, targetPlayer: null, isCounter: false });
        }
        // Check if the asset modal is open for the local player in a non-readonly state
        if (assetViewState.isOpen && assetViewState.player?.id === localPlayer.id) {
            const isReadOnly = assetViewState.player.id !== localPlayerId;
            if (!isReadOnly) {
              setAssetViewState({ isOpen: false, player: null });
            }
        }
    }
  }, [gameState?.currentPlayerIndex, localPlayer, tradeState.isOpen, tradeState.isCounter, assetViewState.isOpen, localPlayerId]);

  // Effect for client-side counter-offer timer
  useEffect(() => {
    if (tradeState.isOpen && tradeState.isCounter) {
        const timerId = setTimeout(() => {
            console.log("Counter-offer timer expired. Closing trade window.");
            alert("Your 15 seconds to make a counter-offer have expired.");
            setTradeState({ isOpen: false, targetPlayer: null, isCounter: false });
        }, 15000); // 15-second timer

        return () => clearTimeout(timerId);
    }
  }, [tradeState.isOpen, tradeState.isCounter]);


  // Effect to handle pending actions targeted at the local player
  useEffect(() => {
    if (!gameState || !localPlayer) {
        return;
    }
    
    const { pendingAction } = gameState;

    // If there's no pending action, ensure any related modal is closed.
    if (!pendingAction) {
        if (modal.isOpen) {
            closeModal();
            setHandledAction(null);
        }
        return;
    }

    // Do not re-process the same action
    if (JSON.stringify(pendingAction) === JSON.stringify(handledAction)) return;
    
    // Set the current pending action as handled to prevent re-renders
    setHandledAction(pendingAction);

    switch(pendingAction.type) {
        case PendingActionType.AWAIT_PURCHASE: {
            if(pendingAction.playerId !== localPlayer.id) return;
            const prop = gameState.board[pendingAction.propertyId] as Property;
            setModal({
                isOpen: true,
                title: `Buy ${prop.name}?`,
                onClose: () => handleDispatchAction({ type: 'DECLINE_PROPERTY' }),
                content: (
                    <div>
                        <PropertyCard property={prop} />
                        <p className="text-xl my-4 text-center">Would you like to buy it for ${prop.price.toLocaleString()}?</p>
                        <div className="flex justify-around">
                            <button className="bg-green-500 text-white px-6 py-2 rounded-lg font-bold" onClick={() => { handleDispatchAction({ type: 'BUY_PROPERTY' }); closeModal(); }}>Buy</button>
                            <button className="bg-gray-400 text-white px-6 py-2 rounded-lg font-bold" onClick={() => { handleDispatchAction({ type: 'DECLINE_PROPERTY' }); closeModal(); }}>Decline</button>
                        </div>
                    </div>
                )
            });
            break;
        }
        case PendingActionType.AWAIT_CARD_ACKNOWLEDGEMENT: {
            if(pendingAction.playerId !== localPlayer.id) return;
            const { card } = pendingAction;

            const handleAck = () => {
                closeModal();
                handleDispatchAction({ type: 'ACKNOWLEDGE_CARD' });
            };

            const timeoutId = setTimeout(handleAck, 10000);

            setModal({
                isOpen: true,
                title: `You drew a card!`,
                onClose: undefined, // Cannot be closed
                content: (
                    <div className="text-center">
                        <p className="text-lg mb-6 p-4 bg-yellow-100 border border-yellow-300 rounded-lg">{card.text}</p>
                        <button className="bg-blue-500 text-white px-6 py-2 rounded-lg font-bold" onClick={() => { 
                            clearTimeout(timeoutId);
                            handleAck();
                        }}>OK</button>
                    </div>
                )
            });
            break;
        }
         case PendingActionType.AWAIT_TRADE_RESPONSE: {
            const { tradeOffer } = pendingAction;
            const fromPlayer = gameState.players.find(p => p.id === tradeOffer.fromPlayerId);
            const toPlayer = gameState.players.find(p => p.id === tradeOffer.toPlayerId);

            if (localPlayer.id === pendingAction.playerId) {
                const handleCounterOffer = () => {
                    handleDispatchAction({ type: 'RESPOND_TO_TRADE', tradeOffer, accepted: false });
                    closeModal();
                    setTradeState({ isOpen: true, targetPlayer: fromPlayer!, isCounter: true });
                };

                setModal({
                    isOpen: true,
                    title: `Trade Offer from ${fromPlayer?.name}`,
                    onClose: () => handleDispatchAction({ type: 'RESPOND_TO_TRADE', tradeOffer, accepted: false }),
                    content: (
                        <div>
                            <TradeOfferDetails 
                                tradeOffer={tradeOffer} 
                                board={gameState.board} 
                                players={gameState.players}
                                perspectivePlayerId={localPlayer.id}
                            />
                            <div className="flex justify-around mt-6">
                                <button className="bg-green-500 text-white px-4 py-2 rounded-lg font-bold" onClick={() => { handleDispatchAction({ type: 'RESPOND_TO_TRADE', tradeOffer, accepted: true }); closeModal(); }}>Accept</button>
                                <button className="bg-yellow-500 text-white px-4 py-2 rounded-lg font-bold" onClick={handleCounterOffer}>Counter (15s)</button>
                                <button className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold" onClick={() => { handleDispatchAction({ type: 'RESPOND_TO_TRADE', tradeOffer, accepted: false }); closeModal(); }}>Decline</button>
                            </div>
                        </div>
                    )
                });
            } else if (localPlayer.id !== fromPlayer?.id) {
                 setModal({
                    isOpen: true,
                    title: `Trade: ${fromPlayer?.name} & ${toPlayer?.name}`,
                    onClose: closeModal,
                    content: (
                        <div>
                            <TradeOfferSpectatorView
                                 tradeOffer={tradeOffer} 
                                 board={gameState.board} 
                                 players={gameState.players}
                            />
                            <p className="text-center mt-4 text-gray-500">Waiting for {toPlayer?.name} to respond...</p>
                        </div>
                    )
                });
            }
            break;
        }
        case PendingActionType.AWAIT_JAIL_DECISION: {
            if (pendingAction.playerId !== localPlayer.id) return;
            
            const handleJailAction = (actionType: 'ATTEMPT_JAIL_ROLL' | 'PAY_JAIL_FINE' | 'USE_JAIL_CARD') => {
                closeModal();
                handleDispatchAction({ type: actionType });
            };

            setModal({
                isOpen: true,
                title: "You are in Jail",
                onClose: undefined,
                content: (
                    <div className="text-center">
                        <p className="mb-4">What would you like to do?</p>
                        <div className="flex flex-col space-y-2">
                             <button 
                                onClick={() => handleJailAction('ATTEMPT_JAIL_ROLL')} 
                                disabled={localPlayer.jailTurns >= 3}
                                className="bg-blue-500 text-white px-4 py-2 rounded-lg font-bold disabled:bg-gray-400">
                                Try to Roll Doubles
                             </button>
                             <button 
                                onClick={() => handleJailAction('PAY_JAIL_FINE')} 
                                disabled={localPlayer.money < 50} 
                                className="bg-green-500 text-white px-4 py-2 rounded-lg font-bold disabled:bg-gray-400">
                                Pay $50 Fine
                             </button>
                             <button 
                                onClick={() => handleJailAction('USE_JAIL_CARD')}
                                disabled={localPlayer.getOutOfJailFreeCards <= 0} 
                                className="bg-yellow-500 text-white px-4 py-2 rounded-lg font-bold disabled:bg-gray-400">
                                Use 'Get Out of Jail Free' Card
                             </button>
                        </div>
                    </div>
                )
            });
            break;
        }
        case PendingActionType.AWAIT_DEBT_RESOLUTION: {
             if (pendingAction.playerId !== localPlayer.id) return;
             const creditor = pendingAction.owedToPlayerId === 'bank' ? 'the Bank' : gameState.players.find(p => p.id === pendingAction.owedToPlayerId)?.name;
             const canPay = localPlayer.money >= pendingAction.amountOwed;
             setModal({
                 isOpen: true,
                 title: "Debt Collection",
                 onClose: undefined,
                 content: (
                     <div className="text-center">
                         <p className="mb-4 text-lg">You owe <span className="font-bold">{creditor}</span> <span className="font-bold text-red-600">${pendingAction.amountOwed.toLocaleString()}</span>.</p>
                         <p className="mb-4">You must raise funds by mortgaging properties or selling houses.</p>
                         <p className="mb-6 font-semibold">Your current cash: ${localPlayer.money.toLocaleString()}</p>

                         <div className="flex flex-col space-y-3">
                             <button onClick={() => setAssetViewState({ isOpen: true, player: localPlayer })} className="w-full bg-blue-500 text-white px-4 py-2 rounded-lg font-bold">Manage Assets</button>
                             <button onClick={() => { handleDispatchAction({ type: 'RESOLVE_DEBT' }); closeModal(); }} disabled={!canPay} className="w-full bg-green-500 text-white px-4 py-2 rounded-lg font-bold disabled:bg-gray-400">Pay Debt</button>
                              <button onClick={() => { handleDispatchAction({ type: 'DECLARE_BANKRUPTCY' }); closeModal(); }} className="w-full bg-red-700 text-white px-4 py-2 rounded-lg font-bold">Declare Bankruptcy</button>
                         </div>
                     </div>
                 )
             });
            break;
        }
    }
  }, [gameState, localPlayer, handleDispatchAction, closeModal, handledAction]);
  
  const handleSendMessage = useCallback((message: string) => {
    if (!gameId || !localPlayer || !message.trim()) return;
    sendChatMessage(gameId, localPlayer.id, localPlayer.name, message.trim());
  }, [gameId, localPlayer]);

  if (!gameId || !gameState) {
    return (
      <div className="min-h-screen bg-gray-800 flex flex-col justify-center items-center p-4">
        <div className="text-center bg-white p-10 rounded-xl shadow-2xl">
          <h1 className="text-6xl font-display font-extrabold text-red-600 mb-2">Gemini Monopoly</h1>
          <p className="text-xl text-gray-600 mb-8">Online Multiplayer</p>
          <SetupScreen onHost={handleHostGame} onJoin={handleJoinGame} />
        </div>
      </div>
    );
  }

  if (gameState.phase === GamePhase.LOBBY) {
      return <Lobby 
                gameState={gameState} 
                localPlayerId={localPlayerId!} 
                localPlayer={localPlayer}
                onStartGame={() => handleDispatchAction({ type: 'START_GAME' })} 
                onLeave={resetGame}
                chatMessages={chatMessages}
                onSendMessage={handleSendMessage}
              />;
  }

  if (gameState.phase === GamePhase.GAME_OVER) {
    const winner = gameState.players.find(p => !p.isBankrupt);
    return (
       <div className="min-h-screen bg-gray-800 flex flex-col justify-center items-center p-4">
        <div className="text-center bg-white p-10 rounded-xl shadow-2xl">
          <h1 className="text-5xl font-display font-extrabold text-green-600 mb-4">Congratulations!</h1>
          <p className="text-2xl text-gray-700 mb-8"><span className="font-bold">{winner?.name}</span> has won the game!</p>
          <button onClick={resetGame} className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold text-lg hover:bg-blue-700 transition-colors">Main Menu</button>
        </div>
      </div>
    )
  }

  const isMyTurn = currentPlayer?.id === localPlayerId;
  const playerPanelClass = gameState.players.length > 4 
    ? "w-full md:w-1/3 grid grid-cols-2 gap-x-4 gap-y-2" 
    : "w-full md:w-1/4 lg:w-1/5 flex flex-col gap-4";


  return (
    <div className="min-h-screen bg-gray-800 flex flex-col md:flex-row p-2 md:p-4 gap-4 pt-16 md:pt-4">
      {gameState.phase === GamePhase.PLAYER_TURN && <Timer gameState={gameState} />}
      <Modal isOpen={modal.isOpen} title={modal.title} onClose={modal.onClose}>
        {modal.content}
      </Modal>
      {tradeState.isOpen && localPlayer && tradeState.targetPlayer && (
        <Modal isOpen={tradeState.isOpen} title={`${tradeState.isCounter ? 'Counter-Offer to' : 'Trade with'} ${tradeState.targetPlayer.name}`} onClose={() => setTradeState({isOpen: false, targetPlayer: null, isCounter: false})}>
            <TradeModal 
                currentPlayer={localPlayer}
                targetPlayer={tradeState.targetPlayer}
                board={gameState.board}
                isCounterOffer={tradeState.isCounter}
                onClose={() => setTradeState({isOpen: false, targetPlayer: null, isCounter: false})}
                onPropose={(tradeDetails) => {
                    handleDispatchAction({type: 'PROPOSE_TRADE', tradeOffer: tradeDetails });
                    setTradeState({isOpen: false, targetPlayer: null, isCounter: false});
                }}
            />
        </Modal>
      )}
      {assetViewState.isOpen && assetViewState.player && (
        <ManagePropertiesModal
            player={assetViewState.player}
            isReadOnly={assetViewState.player.id !== localPlayerId}
            board={gameState.board}
            onClose={() => setAssetViewState({isOpen: false, player: null})}
            onMortgage={(propertyId) => handleDispatchAction({ type: 'MORTGAGE_PROPERTY', propertyId })}
            onUnmortgage={(propertyId) => handleDispatchAction({ type: 'UNMORTGAGE_PROPERTY', propertyId })}
            onBuyHouse={(propertyId) => handleDispatchAction({ type: 'BUY_HOUSE', propertyId })}
            onSellHouse={(propertyId) => handleDispatchAction({ type: 'SELL_HOUSE', propertyId })}
        />
      )}

      <div className={playerPanelClass}>
        {gameState.players.map(p => (
          <PlayerInfo 
            key={p.id} 
            player={p} 
            isCurrentPlayer={p.id === currentPlayer?.id}
            isLocalPlayer={p.id === localPlayerId}
            isMyTurn={isMyTurn}
            board={gameState.board}
            onViewProperties={(player) => setAssetViewState({ isOpen: true, player })}
            onProposeTrade={(targetPlayer) => setTradeState({ isOpen: true, targetPlayer, isCounter: false })}
            />
        ))}
      </div>

      <main className="flex-grow flex justify-center items-center">
        <GameBoard board={gameState.board} players={gameState.players} />
      </main>

      <aside className="w-full md:w-1/4 lg:w-1/5 bg-gray-100 p-4 rounded-lg shadow-lg flex flex-col">
        <div className="flex justify-between items-center border-b pb-2 mb-4">
            <h2 className="text-2xl font-display font-bold">Controls</h2>
            <button onClick={() => setIsMuted(!isMuted)} title={isMuted ? "Unmute Sounds" : "Mute Sounds"} className="p-2 rounded-full hover:bg-gray-200">
                {isMuted ? '🔇' : '🔊'}
            </button>
        </div>
        
        {currentPlayer && (
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">{currentPlayer.name}'s Turn {isMyTurn ? "(You)" : ""}</h3>
            <Dice die1={gameState.dice[0]} die2={gameState.dice[1]} isRolling={isProcessing && gameState.hasRolled === false} />
            <button
              onClick={() => handleDispatchAction({ type: 'ROLL_DICE' })}
              disabled={!isMyTurn || gameState.hasRolled || isProcessing || !!gameState.pendingAction}
              className="w-full bg-red-600 text-white font-bold py-3 rounded-lg shadow-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isProcessing ? 'Processing...' : 'Roll Dice'}
            </button>
            {isMyTurn && gameState.hasRolled && (
                 <button 
                    onClick={() => handleDispatchAction({ type: 'END_TURN' })}
                    disabled={gameState.dice[0] === gameState.dice[1] || isProcessing || !!gameState.pendingAction}
                    className="w-full mt-2 bg-gray-500 text-white font-bold py-2 rounded-lg shadow-md hover:bg-gray-600 disabled:bg-gray-300 transition-colors"
                 >
                     End Turn
                 </button>
            )}
          </div>
        )}
        <div className="flex-grow mt-4 pt-4 border-t overflow-y-auto flex flex-col">
             <h3 className="text-lg font-bold mb-2">Game Log</h3>
             <div className="text-xs text-gray-600 space-y-1 overflow-y-auto h-48 pr-2 flex-shrink-0">
                {gameState.gameLog.map((msg, i) => <p key={i}>{msg}</p>)}
             </div>
              <div className="mt-4 border-t pt-2 flex-grow flex flex-col">
                 <ChatBox messages={chatMessages} onSendMessage={handleSendMessage} localPlayer={localPlayer} />
             </div>
        </div>
         <button onClick={handleLeaveGame} className="w-full mt-auto bg-red-700 text-white font-bold py-2 rounded-lg flex-shrink-0">Leave Game</button>
      </aside>
    </div>
  );
};


const SetupScreen: React.FC<{onHost: (name: string, gameMode: GameMode) => void, onJoin: (code: string, name: string) => void}> = ({ onHost, onJoin }) => {
    const [mode, setMode] = useState<'host' | 'join' | null>(null);
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [showModeSelect, setShowModeSelect] = useState(false);

    const handleProceedToHost = () => {
        if (name.trim()) {
            setShowModeSelect(true);
        }
    }

    const handleJoin = () => {
        if (name.trim() && code.trim()) onJoin(code.trim().toUpperCase(), name.trim());
    }

    if (mode === 'host') {
        if (showModeSelect) {
            return (
                <div className="flex flex-col items-center space-y-4 w-64">
                    <h3 className="text-xl font-semibold">Choose Game Mode</h3>
                    <p className="text-sm text-gray-600 text-center pb-2"><b>Quick Game:</b> Start with 3 random properties per player!</p>
                    <button onClick={() => onHost(name.trim(), 'quick')} className="w-full bg-purple-500 text-white font-bold py-3 rounded-lg hover:bg-purple-600 transition-colors">Quick Game</button>
                    <button onClick={() => onHost(name.trim(), 'classic')} className="w-full bg-green-500 text-white font-bold py-3 rounded-lg hover:bg-green-600 transition-colors">Classic Game</button>
                    <button onClick={() => setShowModeSelect(false)} className="text-sm text-gray-500 mt-2">Back</button>
                </div>
            )
        }
        return (
            <div className="flex flex-col items-center space-y-4">
                <input type="text" placeholder="Enter your name" value={name} onChange={e => setName(e.target.value)} className="text-center text-lg p-2 border rounded-md w-full" />
                <button onClick={handleProceedToHost} className="w-full bg-green-500 text-white font-bold py-3 rounded-lg">Choose Game Mode</button>
                <button onClick={() => setMode(null)} className="text-sm text-gray-500">Back</button>
            </div>
        );
    }
    
    if (mode === 'join') {
        return (
            <div className="flex flex-col items-center space-y-4">
                <input type="text" placeholder="Enter your name" value={name} onChange={e => setName(e.target.value)} className="text-center text-lg p-2 border rounded-md w-full" />
                <input type="text" placeholder="Enter Game Code" value={code} onChange={e => setCode(e.target.value)} className="text-center text-lg p-2 border rounded-md w-full uppercase" maxLength={5} />
                <button onClick={handleJoin} className="w-full bg-blue-500 text-white font-bold py-3 rounded-lg">Join Game</button>
                <button onClick={() => setMode(null)} className="text-sm text-gray-500">Back</button>
            </div>
        );
    }

    return (
        <div className="flex justify-center space-x-4">
            <button onClick={() => setMode('host')} className="w-48 h-20 text-xl font-bold bg-green-500 text-white rounded-lg shadow-lg hover:bg-green-600 transition-all">
                Host Game
            </button>
            <button onClick={() => setMode('join')} className="w-48 h-20 text-xl font-bold bg-blue-500 text-white rounded-lg shadow-lg hover:bg-blue-600 transition-all">
                Join Game
            </button>
        </div>
    );
};


export default App;