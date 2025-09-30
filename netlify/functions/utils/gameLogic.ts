import { GameState, GamePhase, Player, Property, Space, SpaceType, PendingActionType, CardType, CardAction, CardEffect, GameAction } from '../../../src/types';
import { GO_SALARY, JAIL_POSITION } from './constants';
import { generateCardEvent } from './geminiService';


// --- Helper Functions ---
function log(state: GameState, message: string): GameState {
    const newState = { ...state };
    newState.gameLog = [`[${new Date().toLocaleTimeString()}] ${message}`, ...state.gameLog.slice(0, 49)];
    return newState;
}

function getPlayer(state: GameState, playerId: number): Player | undefined {
    return state.players.find(p => p.id === playerId);
}

function updatePlayer(state: GameState, updatedPlayer: Player): GameState {
    const playerIndex = state.players.findIndex(p => p.id === updatedPlayer.id);
    if (playerIndex > -1) {
        const newPlayers = [...state.players];
        newPlayers[playerIndex] = updatedPlayer;
        return { ...state, players: newPlayers };
    }
    return state;
}

function adjustPlayerMoney(state: GameState, playerId: number, amount: number): GameState {
    let player = getPlayer(state, playerId);
    if (!player) return state;

    player = { ...player, money: player.money + amount };

    if (amount > 0) player.lastGained = amount;
    else if (amount < 0) player.lastPaid = -amount;

    return updatePlayer(state, player);
}

async function handlePayment(state: GameState, payerId: number, payeeId: number | 'bank', amount: number, reason: string): Promise<GameState> {
    let payer = getPlayer(state, payerId)!;
    if (payer.money >= amount) {
        let newState = adjustPlayerMoney(state, payerId, -amount);
        if (payeeId !== 'bank') {
            newState = adjustPlayerMoney(newState, payeeId, amount);
        }
        newState = log(newState, reason);
        return newState;
    } else {
        let newState = { ...state };
        newState = log(newState, `${payer.name} does not have enough money to pay $${amount}. They must raise funds.`);
        newState.pendingAction = {
            type: PendingActionType.AWAIT_DEBT_RESOLUTION,
            playerId: payerId,
            amountOwed: amount,
            owedToPlayerId: payeeId,
        };
        return newState;
    }
}

function endTurn(state: GameState, forceEndTurn = false): GameState {
    let newState = { ...state };
    const endingPlayer = getPlayer(newState, newState.players[newState.currentPlayerIndex].id)!;
    
    const updatedEndingPlayer = {...endingPlayer, tradeCount: 0};
    newState = updatePlayer(newState, updatedEndingPlayer);
    
    if (!forceEndTurn && newState.dice[0] === newState.dice[1] && !endingPlayer.isJailed && newState.doublesCount < 3) {
        newState = log(newState, `${endingPlayer.name} rolled doubles and gets another turn!`);
        newState.hasRolled = false;
        return newState;
    }
    
    let nextPlayerIndex = newState.currentPlayerIndex;
    let nextPlayer;
    do {
        nextPlayerIndex = (nextPlayerIndex + 1) % newState.players.length;
        nextPlayer = newState.players[nextPlayerIndex];
    } while (nextPlayer.isBankrupt);

    nextPlayer = {...nextPlayer, lastGained: 0, lastPaid: 0};
    newState = updatePlayer(newState, nextPlayer);

    newState = log(newState, `It is now ${nextPlayer.name}'s turn.`);
    newState.currentPlayerIndex = nextPlayerIndex;
    newState.hasRolled = false;
    newState.doublesCount = 0;
    
    if (nextPlayer.isJailed) {
        newState.pendingAction = {
            type: PendingActionType.AWAIT_JAIL_DECISION,
            playerId: nextPlayer.id,
        };
        newState = log(newState, `${nextPlayer.name} is in jail and must decide what to do.`);
    }

    return newState;
}

async function movePlayer(state: GameState, playerId: number, totalDice: number, options?: { isCardMove?: boolean, forceEndTurn?: boolean }): Promise<GameState> {
    let newState = { ...state };
    let player = { ...getPlayer(newState, playerId)! };
    const newPosition = (player.position + totalDice + 40) % 40; // Ensure positive result for negative moves

    if (!options?.isCardMove && newPosition < player.position && !player.isJailed) {
        newState = adjustPlayerMoney(newState, player.id, GO_SALARY);
        newState = log(newState, `${player.name} passed GO and collected $${GO_SALARY}.`);
        player = getPlayer(newState, playerId)!;
    }
    player.position = newPosition;
    newState = updatePlayer(newState, player);
    
    return await handleSpaceLanding(newState, player.id, newState.board[newPosition], totalDice, options);
}

function calculateRent(space: Property, owner: Player, board: (Space | Property)[], diceRoll: number): number {
    switch(space.type) {
        case SpaceType.UTILITY:
            const ownedUtilities = owner.properties.filter(id => (board[id] as Property).type === SpaceType.UTILITY);
            return (ownedUtilities.length === 2 ? 10 : 4) * diceRoll;
        case SpaceType.RAILROAD:
            const ownedRailroads = owner.properties.filter(id => (board[id] as Property).type === SpaceType.RAILROAD);
            return space.rent[ownedRailroads.length - 1] || 25;
        case SpaceType.PROPERTY:
            if (space.houses > 0) return space.rent[space.houses];
            const color = space.color;
            const allInColorGroup = board.filter(s => 'color' in s && s.color === color);
            const ownerHasMonopoly = allInColorGroup.every(s => 'ownerId' in s && s.ownerId === owner.id && !(s as Property).mortgaged);
            return space.rent[0] * (ownerHasMonopoly ? 2 : 1);
        default: return 0;
    }
}

async function handleSpaceLanding(state: GameState, playerId: number, space: Space | Property, diceRoll: number, options?: { forceEndTurn?: boolean }): Promise<GameState> {
    const player = getPlayer(state, playerId)!;
    let newState = log({ ...state }, `${player.name} landed on ${space.name}.`);

    switch(space.type) {
        case SpaceType.PROPERTY:
        case SpaceType.RAILROAD:
        case SpaceType.UTILITY:
            const prop = space as Property;
            if (prop.ownerId === undefined) {
                 if(player.money >= prop.price) {
                    newState.pendingAction = { type: PendingActionType.AWAIT_PURCHASE, playerId: player.id, propertyId: prop.id };
                 } else {
                     newState = log(newState, `${player.name} cannot afford to buy ${prop.name}.`);
                     newState = endTurn(newState, options?.forceEndTurn);
                 }
            } else if (prop.ownerId !== player.id && !prop.mortgaged) {
                const owner = getPlayer(newState, prop.ownerId)!;
                if (owner.isJailed) {
                    newState = log(newState, `${owner.name} is in jail and cannot collect rent.`);
                    newState = endTurn(newState, options?.forceEndTurn);
                } else {
                    const rent = calculateRent(prop, owner, newState.board, diceRoll);
                    newState = await handlePayment(newState, playerId, owner.id, rent, `${player.name} pays $${rent} in rent to ${owner.name}.`);
                    if (!newState.pendingAction) newState = endTurn(newState, options?.forceEndTurn);
                }
            } else {
                newState = endTurn(newState, options?.forceEndTurn);
            }
            break;
        case SpaceType.CHANCE:
        case SpaceType.COMMUNITY_CHEST: {
            const cardType = space.type === SpaceType.CHANCE ? CardType.CHANCE : CardType.COMMUNITY_CHEST;
            newState = log(newState, `${player.name} draws a ${cardType} card.`);
            const card = await generateCardEvent(cardType);
            newState.pendingAction = { type: PendingActionType.AWAIT_CARD_ACKNOWLEDGEMENT, playerId: player.id, card };
            break;
        }
        case SpaceType.GO_TO_JAIL:
            newState = log(newState, `${player.name} is sent to Jail!`);
            let jailedPlayer = {...player, position: JAIL_POSITION, isJailed: true, jailTurns: 0};
            newState = updatePlayer(newState, jailedPlayer);
            newState = endTurn(newState, true);
            break;
        case SpaceType.TAX:
            const taxAmount = (space as any).price;
            newState = await handlePayment(newState, player.id, 'bank', taxAmount, `${player.name} pays $${taxAmount} in tax.`);
            if (!newState.pendingAction) newState = endTurn(newState, options?.forceEndTurn);
            break;
        default:
            newState = endTurn(newState, options?.forceEndTurn);
    }
    return newState;
}

async function applyCardEffect(state: GameState, playerId: number, card: CardEffect): Promise<GameState> {
    let newState = { ...state };
    let player = getPlayer(newState, playerId)!;
    newState = log(newState, `Card effect: ${card.text}`);

    switch (card.action) {
        case CardAction.RECEIVE_MONEY:
            newState = adjustPlayerMoney(newState, playerId, card.amount!);
            newState = endTurn(newState);
            break;
        case CardAction.PAY_MONEY:
            newState = await handlePayment(newState, playerId, 'bank', card.amount!, card.text);
            if (!newState.pendingAction) newState = endTurn(newState);
            break;
        case CardAction.MOVE_TO: {
            let spaceId = card.spaceId!;
            if (spaceId < player.position && spaceId !== JAIL_POSITION) {
                newState = adjustPlayerMoney(newState, playerId, GO_SALARY);
                newState = log(newState, `${player.name} passed GO and collected $${GO_SALARY}.`);
                player = getPlayer(newState, playerId)!;
            }
            player.position = spaceId;
            newState = updatePlayer(newState, player);
            newState = await handleSpaceLanding(newState, playerId, newState.board[spaceId], 0);
            break;
        }
        case CardAction.MOVE_BY:
            newState = await movePlayer(newState, playerId, card.amount!, { isCardMove: true });
            break;
        case CardAction.GO_TO_JAIL:
            player.position = JAIL_POSITION;
            player.isJailed = true;
            player.jailTurns = 0;
            newState = updatePlayer(newState, player);
            newState = endTurn(newState, true);
            break;
        case CardAction.GET_OUT_OF_JAIL_FREE:
            player.getOutOfJailFreeCards += 1;
            newState = updatePlayer(newState, player);
            newState = endTurn(newState);
            break;
        case CardAction.RECEIVE_FROM_PLAYERS: {
            const amount = card.amount!;
            let collected = 0;
            const otherPlayers = newState.players.filter(p => p.id !== playerId && !p.isBankrupt);
            otherPlayers.forEach(p => {
                newState = adjustPlayerMoney(newState, p.id, -amount);
                collected += amount;
            });
            newState = adjustPlayerMoney(newState, playerId, collected);
            newState = endTurn(newState);
            break;
        }
        case CardAction.PAY_FOR_BUILDINGS: {
            const { perHouse, perHotel } = card.buildingCosts!;
            let totalCost = 0;
            player.properties.forEach(propId => {
                const prop = newState.board[propId] as Property;
                if (prop.houses === 5) totalCost += perHotel;
                else totalCost += prop.houses * perHouse;
            });
            newState = await handlePayment(newState, playerId, 'bank', totalCost, `${player.name} pays $${totalCost} for building repairs.`);
            if (!newState.pendingAction) newState = endTurn(newState);
            break;
        }
    }
    return newState;
}

// Main action processor
export async function processAction(state: GameState, action: GameAction): Promise<GameState> {
    const isTurnBasedAction = ['ROLL_DICE', 'END_TURN', 'BUY_PROPERTY', 'DECLINE_PROPERTY', 'MORTGAGE_PROPERTY', 'UNMORTGAGE_PROPERTY', 'BUY_HOUSE', 'SELL_HOUSE'].includes(action.type);
    if (state.phase === GamePhase.PLAYER_TURN && isTurnBasedAction) {
        const activePlayer = state.players[state.currentPlayerIndex];
        if (action.playerId !== activePlayer.id) {
            if(!state.pendingAction || action.playerId !== state.pendingAction.playerId) {
                if (['MORTGAGE_PROPERTY', 'UNMORTGAGE_PROPERTY', 'BUY_HOUSE', 'SELL_HOUSE'].includes(action.type)) {
                     if (state.players[state.currentPlayerIndex].id !== action.playerId) {
                        throw new Error("You can only manage properties on your turn.");
                    }
                } else {
                    throw new Error("It's not your turn.");
                }
            }
        }
    }
    if (state.pendingAction && state.pendingAction.playerId !== action.playerId) {
         if(action.type !== 'PROPOSE_TRADE') {
            throw new Error("Waiting for another player to act.");
         }
    }

    let nextState = { ...state };

    switch(action.type) {
        case 'START_GAME':
            if (action.playerId !== state.hostId) throw new Error("Only the host can start the game.");
            if (state.players.length < 2) throw new Error("Need at least 2 players to start.");
            nextState.phase = GamePhase.PLAYER_TURN;
            nextState = log(nextState, `Game started! It's ${nextState.players[0].name}'s turn.`);
            break;
        case 'ROLL_DICE': {
            if (state.hasRolled) throw new Error("You have already rolled.");
            const player = getPlayer(state, action.playerId)!;
            if (player.isJailed) throw new Error("You are in jail and must use a jail action.");
            
            const die1 = Math.floor(Math.random() * 6) + 1;
            const die2 = Math.floor(Math.random() * 6) + 1;
            nextState = log(nextState, `${player.name} rolled a ${die1} and a ${die2}.`);
            
            nextState.dice = [die1, die2];
            nextState.hasRolled = true;
            if(die1 === die2) nextState.doublesCount++;
            
            if (nextState.doublesCount === 3) {
                 nextState = log(nextState, `Rolled doubles 3 times! Go to jail.`);
                 let jailedPlayer = {...player, position: JAIL_POSITION, isJailed: true, jailTurns: 0};
                 nextState = updatePlayer(nextState, jailedPlayer);
                 nextState = endTurn(nextState, true);
            } else {
                nextState = await movePlayer(nextState, action.playerId, die1 + die2);
            }
            break;
        }
        case 'BUY_PROPERTY': {
            if (!state.pendingAction || state.pendingAction.type !== PendingActionType.AWAIT_PURCHASE) throw new Error("Not awaiting a property purchase.");
            const prop = state.board[state.pendingAction.propertyId] as Property;
            let player = getPlayer(state, action.playerId)!;
            
            nextState = adjustPlayerMoney(nextState, player.id, -prop.price);
            player = getPlayer(nextState, action.playerId)!;

            player.properties.push(prop.id);
            (nextState.board[prop.id] as Property).ownerId = player.id;
            nextState = updatePlayer(nextState, player);

            nextState = log(nextState, `${player.name} bought ${prop.name}.`);
            nextState.pendingAction = null;
            nextState = endTurn(nextState);
            break;
        }
        case 'DECLINE_PROPERTY': {
            if (!state.pendingAction || state.pendingAction.type !== PendingActionType.AWAIT_PURCHASE) throw new Error("Not awaiting a property purchase.");
             const propName = state.board[state.pendingAction.propertyId].name;
             const playerName = getPlayer(state, action.playerId)?.name || 'A player'
             nextState = log(nextState, `${playerName} declined to buy ${propName}.`);
             nextState.pendingAction = null;
             nextState = endTurn(nextState);
            break;
        }
        case 'END_TURN':
            if (!state.hasRolled) throw new Error("You must roll first.");
            if (state.pendingAction) throw new Error("Cannot end turn while an action is pending.");
            if (state.dice[0] === state.dice[1]) throw new Error("You rolled doubles, go again!");
            nextState = endTurn(state);
            break;
        case 'ACKNOWLEDGE_CARD': {
             if (!state.pendingAction || state.pendingAction.type !== PendingActionType.AWAIT_CARD_ACKNOWLEDGEMENT) throw new Error("Not awaiting card acknowledgement.");
             const cardEffect = state.pendingAction.card;
             nextState.pendingAction = null;
             nextState = await applyCardEffect(nextState, action.playerId, cardEffect);
            break;
        }
        case 'PROPOSE_TRADE': {
            const proposer = getPlayer(state, action.playerId)!;
            const activePlayer = state.players[state.currentPlayerIndex];

            if (proposer.id === activePlayer.id) {
                if(proposer.tradeCount >= 3) throw new Error("You have reached your trade limit for this turn.");
                const updatedProposer = {...proposer, tradeCount: proposer.tradeCount + 1};
                nextState = updatePlayer(nextState, updatedProposer);
            }
            
            nextState.pendingAction = {
                type: PendingActionType.AWAIT_TRADE_RESPONSE,
                playerId: action.tradeOffer.toPlayerId,
                tradeOffer: action.tradeOffer
            };
            const toPlayer = getPlayer(state, action.tradeOffer.toPlayerId)!;
            nextState = log(nextState, `${proposer.name} proposed a trade to ${toPlayer.name}.`);
            break;
        }
        case 'RESPOND_TO_TRADE': {
            if (!state.pendingAction || state.pendingAction.type !== PendingActionType.AWAIT_TRADE_RESPONSE) throw new Error("Not awaiting a trade response.");
            const { tradeOffer, accepted } = action;
            const fromPlayer = getPlayer(state, tradeOffer.fromPlayerId)!;
            const toPlayer = getPlayer(state, tradeOffer.toPlayerId)!;

            if (accepted) {
                nextState = adjustPlayerMoney(nextState, fromPlayer.id, -tradeOffer.offer.money);
                nextState = adjustPlayerMoney(nextState, toPlayer.id, tradeOffer.offer.money);
                nextState = adjustPlayerMoney(nextState, fromPlayer.id, tradeOffer.request.money);
                nextState = adjustPlayerMoney(nextState, toPlayer.id, -tradeOffer.request.money);

                let pFrom = getPlayer(nextState, fromPlayer.id)!;
                let pTo = getPlayer(nextState, toPlayer.id)!;
                
                pFrom.properties = pFrom.properties.filter(p => !tradeOffer.offer.properties.includes(p));
                pTo.properties.push(...tradeOffer.offer.properties);
                tradeOffer.offer.properties.forEach(pId => ((nextState.board[pId] as Property).ownerId = pTo.id));

                pTo.properties = pTo.properties.filter(p => !tradeOffer.request.properties.includes(p));
                pFrom.properties.push(...tradeOffer.request.properties);
                tradeOffer.request.properties.forEach(pId => ((nextState.board[pId] as Property).ownerId = pFrom.id));

                nextState = updatePlayer(nextState, pFrom);
                nextState = updatePlayer(nextState, pTo);
                nextState = log(nextState, `Trade between ${fromPlayer.name} and ${toPlayer.name} was accepted!`);

            } else {
                nextState = log(nextState, `${toPlayer.name} declined the trade from ${fromPlayer.name}.`);
            }
            nextState.pendingAction = null;
            break;
        }
         case 'MORTGAGE_PROPERTY': {
            const player = getPlayer(state, action.playerId)!;
            const prop = nextState.board[action.propertyId] as Property;
            if (prop.ownerId !== player.id) throw new Error("You don't own this property.");
            if (prop.mortgaged) throw new Error("Property is already mortgaged.");
            if (prop.houses > 0) throw new Error("Cannot mortgage property with houses on it.");

            prop.mortgaged = true;
            const mortgageValue = prop.price / 2;
            nextState = adjustPlayerMoney(nextState, player.id, mortgageValue);
            nextState = log(nextState, `${player.name} mortgaged ${prop.name} for $${mortgageValue}.`);
            break;
         }
         case 'UNMORTGAGE_PROPERTY': {
            const player = getPlayer(state, action.playerId)!;
            const prop = nextState.board[action.propertyId] as Property;
            if (prop.ownerId !== player.id) throw new Error("You don't own this property.");
            if (!prop.mortgaged) throw new Error("Property is not mortgaged.");
            
            const unmortgageCost = Math.floor(prop.price / 2 * 1.1);
            if (player.money < unmortgageCost) throw new Error("Not enough money to unmortgage.");
            
            prop.mortgaged = false;
            nextState = adjustPlayerMoney(nextState, player.id, -unmortgageCost);
            nextState = log(nextState, `${player.name} unmortgaged ${prop.name} for $${unmortgageCost}.`);
            break;
         }
         case 'BUY_HOUSE': {
            const player = getPlayer(state, action.playerId)!;
            const prop = nextState.board[action.propertyId] as Property;

            if (prop.ownerId !== player.id) throw new Error("You don't own this property.");
            if (prop.type !== SpaceType.PROPERTY) throw new Error("Can only build on normal properties.");
            if (prop.houses >= 5) throw new Error("Maximum buildings reached.");
            if (player.money < prop.houseCost) throw new Error("Not enough money to buy a house.");
            
            const colorGroup = state.board.filter(s => (s as Property).color === prop.color) as Property[];
            const hasMonopoly = colorGroup.every(p => p.ownerId === player.id && !p.mortgaged);
            if (!hasMonopoly) throw new Error("You must own the entire color group (unmortgaged) to build houses.");
            
            prop.houses++;
            nextState = adjustPlayerMoney(nextState, player.id, -prop.houseCost);
            
            const buildingType = prop.houses === 5 ? 'a hotel' : 'a house';
            nextState = log(nextState, `${player.name} bought ${buildingType} for ${prop.name}.`);
            break;
         }
         case 'SELL_HOUSE': {
            const player = getPlayer(state, action.playerId)!;
            const prop = nextState.board[action.propertyId] as Property;
             if (prop.ownerId !== player.id) throw new Error("You don't own this property.");
             if (prop.houses <= 0) throw new Error("No houses to sell on this property.");
             
             prop.houses--;
             const salePrice = prop.houseCost / 2;
             nextState = adjustPlayerMoney(nextState, player.id, salePrice);
             const buildingType = prop.houses === 4 ? 'a hotel' : 'a house';
             nextState = log(nextState, `${player.name} sold ${buildingType} on ${prop.name} for $${salePrice}.`);
             break;
         }
         case 'PAY_JAIL_FINE': {
            if (!state.pendingAction || state.pendingAction.type !== PendingActionType.AWAIT_JAIL_DECISION) throw new Error("Not in jail.");
            let player = getPlayer(state, action.playerId)!;
            if (player.money < 50) throw new Error("Not enough money to pay the fine.");

            nextState = adjustPlayerMoney(nextState, player.id, -50);
            nextState = log(nextState, `${player.name} paid $50 to get out of jail.`);
            
            player = getPlayer(nextState, action.playerId)!;
            player.isJailed = false;
            player.jailTurns = 0;
            nextState = updatePlayer(nextState, player);
            nextState.pendingAction = null;
            nextState = log(nextState, `${player.name} is now out of jail. Roll the dice to continue your turn.`);
            break;
         }
         case 'USE_JAIL_CARD': {
            if (!state.pendingAction || state.pendingAction.type !== PendingActionType.AWAIT_JAIL_DECISION) throw new Error("Not in jail.");
            let player = getPlayer(state, action.playerId)!;
            if(player.getOutOfJailFreeCards <= 0) throw new Error("No 'Get Out of Jail Free' cards to use.");

            player.getOutOfJailFreeCards--;
            player.isJailed = false;
            player.jailTurns = 0;
            nextState = updatePlayer(nextState, player);
            nextState.pendingAction = null;
            nextState = log(nextState, `${player.name} used a 'Get Out of Jail Free' card and can now roll the dice.`);
            break;
         }
         case 'ATTEMPT_JAIL_ROLL': {
            if (!state.pendingAction || state.pendingAction.type !== PendingActionType.AWAIT_JAIL_DECISION) throw new Error("Not in jail.");
            let player = getPlayer(state, action.playerId)!;
            const die1 = Math.floor(Math.random() * 6) + 1;
            const die2 = Math.floor(Math.random() * 6) + 1;
            nextState = log(nextState, `${player.name} attempts to roll doubles... and gets a ${die1} and a ${die2}.`);
            nextState.dice = [die1, die2];

            if (die1 === die2) {
                nextState = log(nextState, `Success! ${player.name} is out of jail.`);
                player.isJailed = false;
                player.jailTurns = 0;
                nextState = updatePlayer(nextState, player);
                nextState.pendingAction = null;
                nextState.hasRolled = true;
                nextState = await movePlayer(nextState, player.id, die1 + die2, { forceEndTurn: true });
            } else {
                player.jailTurns++;
                nextState = updatePlayer(nextState, player);
                nextState.pendingAction = null;

                if (player.jailTurns >= 3) {
                    nextState = log(nextState, `Third attempt failed. ${player.name} must pay the $50 fine.`);
                    nextState = await handlePayment(nextState, player.id, 'bank', 50, `${player.name} pays the $50 jail fine.`);
                    
                    // If payment is pending, we keep them in jail until it's resolved.
                    if (!nextState.pendingAction) {
                        const paidPlayer = getPlayer(nextState, player.id)!;
                        paidPlayer.isJailed = false;
                        paidPlayer.jailTurns = 0;
                        nextState = updatePlayer(nextState, paidPlayer);
                        // Player is out but turn ends
                        nextState = endTurn(nextState, true);
                    } else {
                        // The debt is pending, so they stay in jail until resolved.
                        // On next turn, they'll be prompted to pay again.
                        nextState = endTurn(nextState, true);
                    }
                } else {
                    nextState = log(nextState, `Failed to roll doubles. ${player.name} remains in jail.`);
                    nextState = endTurn(nextState, true);
                }
            }
            break;
         }
         case 'RESOLVE_DEBT': {
            if (!state.pendingAction || state.pendingAction.type !== PendingActionType.AWAIT_DEBT_RESOLUTION) throw new Error("Not resolving a debt.");
            const { amountOwed, owedToPlayerId } = state.pendingAction;
            const player = getPlayer(state, action.playerId)!;
            if(player.money < amountOwed) throw new Error("Still not enough money to pay the debt.");

            nextState = adjustPlayerMoney(nextState, player.id, -amountOwed);
            if(owedToPlayerId !== 'bank') {
                nextState = adjustPlayerMoney(nextState, owedToPlayerId, amountOwed);
            }
            nextState.pendingAction = null;
            nextState = log(nextState, `${player.name} has paid their debt of $${amountOwed}.`);
            
            // If the debt was from being in jail too long, free them.
            const freedPlayer = getPlayer(nextState, player.id)!;
            if (freedPlayer.isJailed && freedPlayer.jailTurns >= 3) {
                 freedPlayer.isJailed = false;
                 freedPlayer.jailTurns = 0;
                 nextState = updatePlayer(nextState, freedPlayer);
            }

            nextState = endTurn(nextState);
            break;
         }
         case 'DECLARE_BANKRUPTCY': {
            if (!state.pendingAction || state.pendingAction.type !== PendingActionType.AWAIT_DEBT_RESOLUTION) throw new Error("Not resolving a debt.");
            const { owedToPlayerId } = state.pendingAction;
            let bankruptPlayer = getPlayer(state, action.playerId)!;
            let creditor: Player | 'bank' = owedToPlayerId === 'bank' ? 'bank' : getPlayer(state, owedToPlayerId)!;

            if (creditor !== 'bank') {
                nextState = log(nextState, `${bankruptPlayer.name} goes bankrupt to ${creditor.name}!`);
                nextState = adjustPlayerMoney(nextState, creditor.id, bankruptPlayer.money);
                const updatedCreditor = getPlayer(nextState, creditor.id)!;
                
                bankruptPlayer.properties.forEach(propId => {
                    (nextState.board[propId] as Property).ownerId = updatedCreditor.id;
                });
                updatedCreditor.properties.push(...bankruptPlayer.properties);
                updatedCreditor.getOutOfJailFreeCards += bankruptPlayer.getOutOfJailFreeCards;
                nextState = updatePlayer(nextState, updatedCreditor);
            } else {
                nextState = log(nextState, `${bankruptPlayer.name} goes bankrupt to the bank!`);
                bankruptPlayer.properties.forEach(propId => {
                    const prop = nextState.board[propId] as Property;
                    prop.ownerId = undefined;
                    prop.mortgaged = false;
                    prop.houses = 0;
                });
            }
            
            const updatedBankruptPlayer = {...bankruptPlayer, money: 0, isBankrupt: true, properties: []};
            nextState = updatePlayer(nextState, updatedBankruptPlayer);
            nextState.pendingAction = null;

            const nonBankruptPlayers = nextState.players.filter(p => !p.isBankrupt);
            if (nonBankruptPlayers.length <= 1) {
                nextState.phase = GamePhase.GAME_OVER;
            } else {
                nextState = endTurn(nextState);
            }
            break;
         }
    }
    return nextState;
}