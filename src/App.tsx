import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { GameBoard } from '@/components/GameBoard.tsx';
import { PlayerInfo } from '@/components/PlayerInfo.tsx';
import { Modal } from '../components/Modal.tsx';
import { Dice } from '../components/Dice.tsx';
import { PropertyCard } from '@/components/PropertyCard.tsx';
import { TradeModal } from '@/components/TradeModal.tsx';
import { ManagePropertiesModal } from '@/components/ManagePropertiesModal.tsx';
import { Lobby } from '@/components/Lobby.tsx';
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
} from '@/types.ts';
import * as multiplayerService from '@/services/multiplayerService.ts';

// --- tiny WebAudio beeps (no files needed) ---
function useBeeps() {
  const ctxRef = useRef<AudioContext | null>(null);

  const ensureCtx = () => {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return ctxRef.current;
  };

  const beep = useCallback((freq = 800, durMs = 120, type: OscillatorType = 'sine', gain = 0.03) => {
    try {
      const ctx = ensureCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      setTimeout(() => {
        o.stop();
        o.disconnect();
        g.disconnect();
      }, durMs);
    } catch {}
  }, []);

  const sound = useCallback((name: 'tick' | 'timeout' | 'roll' | 'trade') => {
    switch (name) {
      case 'tick':    beep(900, 70, 'square', 0.02); break;
      case 'timeout': beep(200, 220, 'sawtooth', 0.05); beep(160, 300, 'sawtooth', 0.05); break;
      case 'roll':    beep(500, 60, 'triangle', 0.04); beep(650, 60, 'triangle', 0.04); break;
      case 'trade':   beep(700, 120, 'sine', 0.04); break;
    }
  }, [beep]);

  return sound;
}

// --- Trade Display Components (local) ---
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
      <p className="text-center text-sm text-gray-600">
        This is a trade with <span className="font-bold">{otherPlayer.name}</span>.
      </p>
      <div className="grid grid-cols-2 gap-4 text-center">
        <div>
          <h4 className="font-bold text-lg mb-2 border-b pb-1">You Give</h4>
          <div className="space-y-2 min-h-[50px]">
            {yourOffer.money > 0 && (
              <p className="text-lg font-semibold text-green-600">${yourOffer.money.toLocaleString()}</p>
            )}
            {yourProperties.map(p => <TradePropertyItem key={p.id} property={p} />)}
            {yourOffer.money === 0 && yourProperties.length === 0 && (
              <p className="text-sm text-gray-500 italic">Nothing</p>
            )}
          </div>
        </div>
        <div>
          <h4 className="font-bold text-lg mb-2 border-b pb-1">You Get</h4>
          <div className="space-y-2 min-h-[50px]">
            {theirOffer.money > 0 && (
              <p className="text-lg font-semibold text-green-600">${theirOffer.money.toLocaleString()}</p>
            )}
            {theirProperties.map(p => <TradePropertyItem key={p.id} property={p} />)}
            {theirOffer.money === 0 && theirProperties.length === 0 && (
              <p className="text-sm text-gray-500 italic">Nothing</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const TradeOfferSpectatorView: React.FC<{
  tradeOffer: TradeOffer;
  board: (Space | Property)[];
  players: Player[];
}> = ({ tradeOffer, board, players }) => {
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
            {tradeOffer.offer.money > 0 && (
              <p className="text-lg font-semibold text-green-600">${tradeOffer.offer.money.toLocaleString()}</p>
            )}
            {fromOfferProperties.map(p => <TradePropertyItem key={p.id} property={p} />)}
            {tradeOffer.offer.money === 0 && fromOfferProperties.length === 0 && (
              <p className="text-sm text-gray-500 italic">Nothing</p>
            )}
          </div>
        </div>
        <div>
          <h4 className="font-bold text-lg mb-2 border-b pb-1">{toPlayer.name} Gives</h4>
          <div className="space-y-2 min-h-[50px]">
            {tradeOffer.request.money > 0 && (
              <p className="text-lg font-semibold text-green-600">${tradeOffer.request.money.toLocaleString()}</p>
            )}
            {toOfferProperties.map(p => <TradePropertyItem key={p.id} property={p} />)}
            {tradeOffer.request.money === 0 && toOfferProperties.length === 0 && (
              <p className="text-sm text-gray-500 italic">Nothing</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Main App Component ---
const App: React.FC = () => {
  const sound = useBeeps();

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

  const [tradeState, setTradeState] = useState<{
    isOpen: boolean;
    targetPlayer: Player | null;
    isCounter: boolean;
  }>({ isOpen: false, targetPlayer: null, isCounter: false });

  const [assetViewState, setAssetViewState] = useState<{ isOpen: boolean; player: Player | null }>({
    isOpen: false,
    player: null,
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [handledAction, setHandledAction] = useState<PendingAction | null>(null);

  // --- Turn (Auto-Roll) Timer ---
  const [rollTimeLeft, setRollTimeLeft] = useState<number | null>(null);
  const rollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clearRollInterval = useCallback(() => {
    if (rollIntervalRef.current) {
      clearInterval(rollIntervalRef.current);
      rollIntervalRef.current = null;
    }
  }, []);

  // --- Purchase Decision Timer (30s) ---
  const [purchaseTimeLeft, setPurchaseTimeLeft] = useState<number | null>(null);
  const purchaseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const purchaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPurchaseTimers = useCallback(() => {
    if (purchaseIntervalRef.current) {
      clearInterval(purchaseIntervalRef.current);
      purchaseIntervalRef.current = null;
    }
    if (purchaseTimeoutRef.current) {
      clearTimeout(purchaseTimeoutRef.current);
      purchaseTimeoutRef.current = null;
    }
    setPurchaseTimeLeft(null);
  }, []);

  // --- Trade Decision Timer (60s) ---
  const [tradeDecisionTimeLeft, setTradeDecisionTimeLeft] = useState<number | null>(null);
  const tradeDecisionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tradeDecisionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTradeDecisionTimers = useCallback(() => {
    if (tradeDecisionIntervalRef.current) {
      clearInterval(tradeDecisionIntervalRef.current);
      tradeDecisionIntervalRef.current = null;
    }
    if (tradeDecisionTimeoutRef.current) {
      clearTimeout(tradeDecisionTimeoutRef.current);
      tradeDecisionTimeoutRef.current = null;
    }
    setTradeDecisionTimeLeft(null);
  }, []);

  // --- Counter composing (60s) ---
  const [counterTimeLeft, setCounterTimeLeft] = useState<number | null>(null);
  const counterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const counterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearCounterTimers = useCallback(() => {
    if (counterIntervalRef.current) {
      clearInterval(counterIntervalRef.current);
      counterIntervalRef.current = null;
    }
    if (counterTimeoutRef.current) {
      clearTimeout(counterTimeoutRef.current);
      counterTimeoutRef.current = null;
    }
    setCounterTimeLeft(null);
  }, []);

  useEffect(() => {
    if (gameId) {
      const unsubscribe = multiplayerService.subscribeToGame(gameId, (newState) => {
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

  const isMyTurn = currentPlayer?.id === localPlayerId;

  const localPlayer = useMemo(() => {
    if (!gameState || localPlayerId === null) return null;
    return gameState.players.find(p => p.id === localPlayerId) || null;
  }, [gameState, localPlayerId]);

  const closeModal = useCallback(() => setModal(prev => ({ ...prev, isOpen: false, onClose: undefined })), []);

  const dispatchAction = useCallback(function <T extends Omit<GameAction, 'playerId'>>(action: T): void {
    (async () => {
      if (!gameId || localPlayerId === null) return;
      setIsProcessing(true);
      try {
        await multiplayerService.dispatchAction(gameId, { ...action, playerId: localPlayerId! } as GameAction);
      } catch (error: any) {
        console.error('Action failed:', error);
        alert(`Action failed: ${error.toString()}`);
      } finally {
        setIsProcessing(false);
      }
    })();
  }, [gameId, localPlayerId]);

  const handleHostGame = async (name: string) => {
    try {
      const { gameId: newGameId, playerId } = await multiplayerService.createGame(name);
      sessionStorage.setItem('monopolyGameId', newGameId);
      sessionStorage.setItem('monopolyPlayerId', playerId.toString());
      setGameId(newGameId);
      setLocalPlayerId(playerId);
    } catch (error) {
      console.error('Failed to host game:', error);
    }
  };

  const handleJoinGame = async (code: string, name: string) => {
    try {
      const { gameId: joinedGameId, playerId } = await multiplayerService.joinGame(code, name);
      sessionStorage.setItem('monopolyGameId', joinedGameId);
      sessionStorage.setItem('monopolyPlayerId', playerId.toString());
      setGameId(joinedGameId);
      setLocalPlayerId(playerId);
    } catch (error) {
      console.error('Failed to join game:', error);
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

  // --- Auto roll or end turn after 2 min; everyone sees the countdown ---
  useEffect(() => {
    if (!currentPlayer || gameState?.phase !== GamePhase.PLAYER_TURN) {
      clearRollInterval();
      setRollTimeLeft(null);
      return;
    }
    // Only count down for the active player's turn
    setRollTimeLeft(120);
    clearRollInterval();
    rollIntervalRef.current = setInterval(() => {
      setRollTimeLeft(prev => {
        if (prev === null) return null;
        const next = prev - 1;
        if (next % 10 === 0 || next <= 5) sound('tick');
        if (next <= 0) {
          clearRollInterval();
          sound('timeout');
          // If player is trading when time runs out -> end their turn (as requested)
          if (tradeState.isOpen && currentPlayer.id === localPlayerId) {
            setTradeState({ isOpen: false, targetPlayer: null, isCounter: false });
            dispatchAction({ type: 'END_TURN' });
          } else if (currentPlayer.id === localPlayerId && !gameState?.hasRolled && !gameState?.pendingAction) {
            sound('roll');
            dispatchAction({ type: 'ROLL_DICE' });
          }
          return null;
        }
        return next;
      });
    }, 1000);

    return () => clearRollInterval();
    // include only values that change the active player / phase
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayer?.id, gameState?.phase]);

  // --- Handle pending actions (purchase, card ack, trade, jail, debt) ---
  useEffect(() => {
    if (!gameState || !localPlayer) {
      clearPurchaseTimers();
      clearTradeDecisionTimers();
      clearCounterTimers();
      return;
    }

    const { pendingAction } = gameState;

    // Clear if no pending
    if (!pendingAction) {
      if (modal.isOpen) closeModal();
      if (handledAction) setHandledAction(null);
      clearPurchaseTimers();
      clearTradeDecisionTimers();
      clearCounterTimers();
      return;
    }

    // Avoid reprocessing same action
    if (pendingAction === handledAction) {
      return;
    }

    // do not stack modals except Debt
    if (pendingAction.type !== PendingActionType.AWAIT_DEBT_RESOLUTION && modal.isOpen) {
      return;
    }

    switch (pendingAction.type) {
      case PendingActionType.AWAIT_PURCHASE: {
        if (pendingAction.playerId !== localPlayer.id) return;
        const prop = gameState.board[pendingAction.propertyId] as Property;

        clearPurchaseTimers();
        setPurchaseTimeLeft(30);

        purchaseIntervalRef.current = setInterval(() => {
          setPurchaseTimeLeft(prev => {
            if (prev === null) return null;
            const next = prev - 1;
            if (next <= 5) sound('tick');
            if (next <= 0) {
              clearPurchaseTimers();
              sound('timeout');
              dispatchAction({ type: 'DECLINE_PROPERTY' });
              closeModal();
              return null;
            }
            return next;
          });
        }, 1000);

        purchaseTimeoutRef.current = setTimeout(() => {
          clearPurchaseTimers();
          sound('timeout');
          dispatchAction({ type: 'DECLINE_PROPERTY' });
          closeModal();
        }, 30000);

        const handleBuy = () => {
          clearPurchaseTimers();
          dispatchAction({ type: 'BUY_PROPERTY' });
          closeModal();
        };

        const handleDecline = () => {
          clearPurchaseTimers();
          dispatchAction({ type: 'DECLINE_PROPERTY' });
          closeModal();
        };

        setModal({
          isOpen: true,
          title: `Buy ${prop.name}?`,
          onClose: handleDecline,
          content: (
            <div>
              <PropertyCard property={prop} />
              <p className="text-xl my-4 text-center">Would you like to buy it for ${prop.price}?</p>
              {typeof purchaseTimeLeft === 'number' && (
                <p className="text-center text-sm text-gray-500 mb-2">
                  Auto-decline in <span className="font-semibold">{purchaseTimeLeft}s</span>
                </p>
              )}
              <div className="flex justify-around">
                <button className="bg-green-500 text-white px-6 py-2 rounded-lg font-bold" onClick={handleBuy}>
                  Buy
                </button>
                <button className="bg-gray-400 text-white px-6 py-2 rounded-lg font-bold" onClick={handleDecline}>
                  Decline
                </button>
              </div>
            </div>
          ),
        });
        break;
      }

      case PendingActionType.AWAIT_CARD_ACKNOWLEDGEMENT: {
        if (pendingAction.playerId !== localPlayer.id) return;
        const { card } = pendingAction;

        const handleAck = () => {
          setHandledAction(pendingAction);
          closeModal();
          dispatchAction({ type: 'ACKNOWLEDGE_CARD' });
        };

        const timeoutId = setTimeout(() => {
          sound('timeout');
          handleAck();
        }, 10000);

        setModal({
          isOpen: true,
          title: `You drew a card!`,
          onClose: undefined,
          content: (
            <div className="text-center">
              <p className="text-lg mb-6 p-4 bg-yellow-100 border border-yellow-300 rounded-lg">{card.text}</p>
              <button
                className="bg-blue-500 text-white px-6 py-2 rounded-lg font-bold"
                onClick={() => {
                  clearTimeout(timeoutId);
                  handleAck();
                }}
              >
                OK
              </button>
            </div>
          ),
        });
        break;
      }

      case PendingActionType.AWAIT_TRADE_RESPONSE: {
        const { tradeOffer } = pendingAction;
        const fromPlayer = gameState.players.find(p => p.id === tradeOffer.fromPlayerId);
        const toPlayer = gameState.players.find(p => p.id === tradeOffer.toPlayerId);

        // notify all that a trade arrived
        sound('trade');

        if (localPlayer.id === pendingAction.playerId) {
          // 60s to decide
          clearTradeDecisionTimers();
          setTradeDecisionTimeLeft(60);

          tradeDecisionIntervalRef.current = setInterval(() => {
            setTradeDecisionTimeLeft(prev => {
              if (prev === null) return null;
              const next = prev - 1;
              if (next <= 5) sound('tick');
              if (next <= 0) {
                clearTradeDecisionTimers();
                sound('timeout');
                // auto-decline
                dispatchAction({ type: 'RESPOND_TO_TRADE', tradeOffer, accepted: false });
                closeModal();
                return null;
              }
              return next;
            });
          }, 1000);

          tradeDecisionTimeoutRef.current = setTimeout(() => {
            clearTradeDecisionTimers();
            sound('timeout');
            dispatchAction({ type: 'RESPOND_TO_TRADE', tradeOffer, accepted: false });
            closeModal();
          }, 60000);

          const handleCounterOffer = () => {
            // Decline original then open composer (60s)
            dispatchAction({ type: 'RESPOND_TO_TRADE', tradeOffer, accepted: false });
            closeModal();

            // start a 60s counter compose window
            clearCounterTimers();
            setCounterTimeLeft(60);
            counterIntervalRef.current = setInterval(() => {
              setCounterTimeLeft(prev => {
                if (prev === null) return null;
                const next = prev - 1;
                if (next <= 5) sound('tick');
                if (next <= 0) {
                  clearCounterTimers();
                  sound('timeout');
                  // close composer if open; no proposal gets sent
                  setTradeState({ isOpen: false, targetPlayer: null, isCounter: false });
                  return null;
                }
                return next;
              });
            }, 1000);
            counterTimeoutRef.current = setTimeout(() => {
              clearCounterTimers();
              sound('timeout');
              setTradeState({ isOpen: false, targetPlayer: null, isCounter: false });
            }, 60000);

            setTradeState({ isOpen: true, targetPlayer: fromPlayer!, isCounter: true });
          };

          setModal({
            isOpen: true,
            title: `Trade Offer from ${fromPlayer?.name}`,
            onClose: () => {
              clearTradeDecisionTimers();
              dispatchAction({ type: 'RESPOND_TO_TRADE', tradeOffer, accepted: false });
            },
            content: (
              <div>
                <TradeOfferDetails
                  tradeOffer={tradeOffer}
                  board={gameState.board}
                  players={gameState.players}
                  perspectivePlayerId={localPlayer.id}
                />
                {typeof tradeDecisionTimeLeft === 'number' && (
                  <p className="text-center text-sm text-gray-500 mt-3">
                    Auto-decline in <span className="font-semibold">{tradeDecisionTimeLeft}s</span>
                  </p>
                )}
                <div className="flex justify-around mt-4">
                  <button
                    className="bg-green-500 text-white px-4 py-2 rounded-lg font-bold"
                    onClick={() => {
                      clearTradeDecisionTimers();
                      dispatchAction({ type: 'RESPOND_TO_TRADE', tradeOffer, accepted: true });
                      closeModal();
                    }}
                  >
                    Accept
                  </button>
                  <button className="bg-yellow-500 text-white px-4 py-2 rounded-lg font-bold" onClick={handleCounterOffer}>
                    Counter
                  </button>
                  <button
                    className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold"
                    onClick={() => {
                      clearTradeDecisionTimers();
                      dispatchAction({ type: 'RESPOND_TO_TRADE', tradeOffer, accepted: false });
                      closeModal();
                    }}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ),
          });
        } else if (localPlayer.id !== fromPlayer?.id) {
          // Spectator modal (no timer)
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
                <p className="text-center mt-4 text-gray-500">
                  Waiting for {toPlayer?.name} to respond...
                </p>
              </div>
            ),
          });
        }
        break;
      }

      case PendingActionType.AWAIT_JAIL_DECISION: {
        if (pendingAction.playerId !== localPlayer.id) return;

        const handleJailAction = (actionType: 'ATTEMPT_JAIL_ROLL' | 'PAY_JAIL_FINE' | 'USE_JAIL_CARD') => {
          setHandledAction(pendingAction);
          closeModal();
          dispatchAction({ type: actionType });
        };

        setModal({
          isOpen: true,
          title: 'You are in Jail',
          onClose: undefined,
          content: (
            <div className="text-center">
              <p className="mb-4">What would you like to do?</p>
              <div className="flex flex-col space-y-2">
                <button
                  onClick={() => handleJailAction('ATTEMPT_JAIL_ROLL')}
                  disabled={localPlayer.jailTurns >= 3}
                  className="bg-blue-500 text-white px-4 py-2 rounded-lg font-bold disabled:bg-gray-400"
                >
                  Try to Roll Doubles
                </button>
                <button
                  onClick={() => handleJailAction('PAY_JAIL_FINE')}
                  disabled={localPlayer.money < 50}
                  className="bg-green-500 text-white px-4 py-2 rounded-lg font-bold disabled:bg-gray-400"
                >
                  Pay $50 Fine
                </button>
                <button
                  onClick={() => handleJailAction('USE_JAIL_CARD')}
                  disabled={localPlayer.getOutOfJailFreeCards <= 0}
                  className="bg-yellow-500 text-white px-4 py-2 rounded-lg font-bold disabled:bg-gray-400"
                >
                  Use 'Get Out of Jail Free' Card
                </button>
              </div>
            </div>
          ),
        });
        break;
      }

      case PendingActionType.AWAIT_DEBT_RESOLUTION: {
        if (pendingAction.playerId !== localPlayer.id) return;
        const creditor =
          pendingAction.owedToPlayerId === 'bank'
            ? 'the Bank'
            : gameState.players.find(p => p.id === pendingAction.owedToPlayerId)?.name;
        const canPay = localPlayer.money >= pendingAction.amountOwed;
        setModal({
          isOpen: true,
          title: 'Debt Collection',
          onClose: undefined,
          content: (
            <div className="text-center">
              <p className="mb-4 text-lg">
                You owe <span className="font-bold">{creditor}</span>{' '}
                <span className="font-bold text-red-600">
                  ${pendingAction.amountOwed.toLocaleString()}
                </span>.
              </p>
              <p className="mb-4">You must raise funds by mortgaging properties or selling houses.</p>
              <p className="mb-6 font-semibold">Your current cash: ${localPlayer.money.toLocaleString()}</p>
              <div className="flex flex-col space-y-3">
                <button
                  onClick={() => setAssetViewState({ isOpen: true, player: localPlayer })}
                  className="w-full bg-blue-500 text-white px-4 py-2 rounded-lg font-bold"
                >
                  Manage Assets
                </button>
                <button
                  onClick={() => { dispatchAction({ type: 'RESOLVE_DEBT' }); closeModal(); }}
                  disabled={!canPay}
                  className="w-full bg-green-500 text-white px-4 py-2 rounded-lg font-bold disabled:bg-gray-400"
                >
                  Pay Debt
                </button>
                <button
                  onClick={() => { dispatchAction({ type: 'DECLARE_BANKRUPTCY' }); closeModal(); }}
                  className="w-full bg-red-700 text-white px-4 py-2 rounded-lg font-bold"
                >
                  Declare Bankruptcy
                </button>
              </div>
            </div>
          ),
        });
        break;
      }
    }

    return () => {
      clearPurchaseTimers();
      clearTradeDecisionTimers();
      clearCounterTimers();
    };
  }, [
    gameState,
    localPlayer,
    handledAction,
    modal.isOpen,
    closeModal,
    dispatchAction,
    sound,
    clearPurchaseTimers,
    clearTradeDecisionTimers,
    clearCounterTimers,
    tradeState.isOpen,
    localPlayerId,
  ]);

  if (!gameId || !gameState) {
    return (
      <div className="min-h-screen bg-gray-800 flex flex-col justify-center items-center p-4">
        <div className="text-center bg-white p-10 rounded-xl shadow-2xl">
          <h1 className="text-6xl font-display font-extrabold text-red-600 mb-2">Monopoly</h1>
          <p className="text-xl text-gray-600 mb-8">Online Multiplayer</p>
          <SetupScreen onHost={handleHostGame} onJoin={handleJoinGame} />
        </div>
      </div>
    );
  }

  if (gameState.phase === GamePhase.LOBBY) {
    return (
      <Lobby
        gameState={gameState}
        localPlayerId={localPlayerId!}
        onStartGame={() => dispatchAction({ type: 'START_GAME' })}
        onLeave={resetGame}
      />
    );
  }

  if (gameState.phase === GamePhase.GAME_OVER) {
    const winner = gameState.players.find(p => !p.isBankrupt);
    return (
      <div className="min-h-screen bg-gray-800 flex flex-col justify-center items-center p-4">
        <div className="text-center bg-white p-10 rounded-xl shadow-2xl">
          <h1 className="text-5xl font-display font-extrabold text-green-600 mb-4">Congratulations!</h1>
          <p className="text-2xl text-gray-700 mb-8">
            <span className="font-bold">{winner?.name}</span> has won the game!
          </p>
          <button
            onClick={resetGame}
            className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold text-lg hover:bg-blue-700 transition-colors"
          >
            Main Menu
          </button>
        </div>
      </div>
    );
  }

  const playerPanelClass =
    gameState.players.length > 4
      ? 'w-full md:w-1/3 grid grid-cols-2 gap-x-4 gap-y-2'
      : 'w-full md:w-1/4 lg:w-1/5 flex flex-col gap-4';

  return (
    <div className="min-h-screen bg-gray-800 flex flex-col md:flex-row p-2 md:p-4 gap-4">
      <Modal isOpen={modal.isOpen} title={modal.title} onClose={modal.onClose}>
        {modal.content}
      </Modal>

      {tradeState.isOpen && localPlayer && tradeState.targetPlayer && (
        <Modal
          isOpen={tradeState.isOpen}
          title={`Trade with ${tradeState.targetPlayer.name} ${counterTimeLeft !== null ? `(${counterTimeLeft}s)` : ''}`}
          onClose={() => {
            clearCounterTimers();
            setTradeState({ isOpen: false, targetPlayer: null, isCounter: false });
          }}
        >
          <TradeModal
            currentPlayer={localPlayer}
            targetPlayer={tradeState.targetPlayer}
            board={gameState.board}
            isCounterOffer={tradeState.isCounter}
            onClose={() => {
              clearCounterTimers();
              setTradeState({ isOpen: false, targetPlayer: null, isCounter: false });
            }}
            onPropose={(tradeDetails) => {
              clearCounterTimers();
              // propose immediately
              dispatchAction({ type: 'PROPOSE_TRADE', tradeOffer: tradeDetails });
              setTradeState({ isOpen: false, targetPlayer: null, isCounter: false });
            }}
            secondsLeft={counterTimeLeft ?? undefined}
          />
        </Modal>
      )}

      {assetViewState.isOpen && assetViewState.player && (
        <ManagePropertiesModal
          player={assetViewState.player}
          isReadOnly={assetViewState.player.id !== localPlayerId}
          board={gameState.board}
          onClose={() => setAssetViewState({ isOpen: false, player: null })}
          onMortgage={(propertyId) => dispatchAction({ type: 'MORTGAGE_PROPERTY', propertyId })}
          onUnmortgage={(propertyId) => dispatchAction({ type: 'UNMORTGAGE_PROPERTY', propertyId })}
          onBuyHouse={(propertyId) => dispatchAction({ type: 'BUY_HOUSE', propertyId })}
          onSellHouse={(propertyId) => dispatchAction({ type: 'SELL_HOUSE', propertyId })}
        />
      )}

      <div className={playerPanelClass}>
        {gameState.players.map(p => (
          <PlayerInfo
            key={p.id}
            player={p}
            isCurrentPlayer={p.id === currentPlayer?.id}
            isLocalPlayer={p.id === localPlayerId}
            isMyTurn={p.id === currentPlayer?.id}
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
        <h2 className="text-2xl font-display font-bold border-b pb-2 mb-4">Controls</h2>
        {/* Global countdown visible to all */}
        {currentPlayer && (
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-1">
              {currentPlayer.name}&apos;s Turn {currentPlayer.id === localPlayerId ? '(You)' : ''}
            </h3>
            {rollTimeLeft !== null && (
              <p className="text-sm text-gray-600 mb-2">
                Time left: <span className="font-semibold">{rollTimeLeft}s</span>
              </p>
            )}
            <Dice
              die1={gameState.dice[0]}
              die2={gameState.dice[1]}
              isRolling={isProcessing && gameState.hasRolled === false}
            />
            <button
              onClick={() => { sound('roll'); dispatchAction({ type: 'ROLL_DICE' }); }}
              disabled={currentPlayer.id !== localPlayerId || gameState.hasRolled || isProcessing || !!gameState.pendingAction}
              className="w-full bg-red-600 text-white font-bold py-3 rounded-lg shadow-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isProcessing ? 'Processing...' : 'Get 2 Numbers'}
            </button>
            {currentPlayer.id === localPlayerId && gameState.hasRolled && (
              <button
                onClick={() => dispatchAction({ type: 'END_TURN' })}
                disabled={gameState.dice[0] === gameState.dice[1] || isProcessing || !!gameState.pendingAction}
                className="w-full mt-2 bg-gray-500 text-white font-bold py-2 rounded-lg shadow-md hover:bg-gray-600 disabled:bg-gray-300 transition-colors"
              >
                End Turn
              </button>
            )}
          </div>
        )}
        <div className="flex-grow mt-4 pt-4 border-t overflow-hidden">
          <h3 className="text-lg font-bold mb-2">Game Log</h3>
          <div className="text-xs text-gray-600 space-y-1 overflow-y-auto h-48 pr-2">
            {gameState.gameLog.map((msg, i) => <p key={i}>{msg}</p>)}
          </div>
        </div>
        <button onClick={resetGame} className="w-full mt-4 bg-red-700 text-white font-bold py-2 rounded-lg">
          Leave Game
        </button>
      </aside>
    </div>
  );
};

const SetupScreen: React.FC<{ onHost: (name: string) => void; onJoin: (code: string, name: string) => void }> = ({ onHost, onJoin }) => {
  const [mode, setMode] = useState<'host' | 'join' | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const handleHost = () => { if (name.trim()) onHost(name.trim()); };
  const handleJoin = () => { if (name.trim() && code.trim()) onJoin(code.trim().toUpperCase(), name.trim()); };

  if (mode === 'host') {
    return (
      <div className="flex flex-col items-center space-y-4">
        <input type="text" placeholder="Enter your name" value={name} onChange={e => setName(e.target.value)} className="text-center text-lg p-2 border rounded-md w-full" />
        <button onClick={handleHost} className="w-full bg-green-500 text-white font-bold py-3 rounded-lg">Create Game Lobby</button>
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

